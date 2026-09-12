import type { ActionFunctionArgs } from "react-router";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/**
 * "Entrega en tienda" es una tarifa de envío manual (no Local Pickup nativo)
 * renombrada por la function `entrega-tienda-delivery`. Por eso el pedido se
 * crea con la dirección del cliente como `shippingAddress`. Este webhook la
 * reescribe con la dirección de la tienda justo después de crear el pedido,
 * para que fulfillment/Sendcloud/OMS vean la dirección correcta.
 *
 * Antes esto se hacía en vivo en el checkout (updateShippingAddress al
 * elegir el método), pero cambiar la dirección de envío obliga a Shopify a
 * recalcular tarifas contra todos los transportistas de nuevo — la causa de
 * los 8-12s de recarga en móvil al seleccionar "Entrega en tienda". Ver
 * docs/FLOW_PICKUP_ADDRESS.md para el equivalente sin código (Shopify Flow).
 */

const SHOP_METAFIELD_NAMESPACE = "$app";
const LEGACY_SHOP_METAFIELD_NAMESPACE = "custom";
const SHOP_METAFIELD_KEY = "entrega_tienda_config";
const REWRITTEN_TAG = "pickup-address-rewritten";

type StoreAddressCfg = {
  company?: string;
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  zip?: string;
  country?: string;
  country_code?: string;
};

type EntregaCfg = {
  enabled?: boolean;
  displayName?: string;
  pickupDeliveryOptionMatchers?: string[];
  storeAddress?: StoreAddressCfg;
};

type OrderCreatePayload = {
  id?: number;
  admin_graphql_api_id?: string;
  tags?: string;
  shipping_lines?: Array<{ title?: string | null }>;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesPickupTitle(
  title: string | null | undefined,
  cfg: EntregaCfg,
): boolean {
  if (!title?.trim()) return false;
  const t = normalize(title);
  if (cfg.displayName && normalize(cfg.displayName) === t) return true;
  return (cfg.pickupDeliveryOptionMatchers ?? []).some(
    (m) => normalize(m) === t,
  );
}

function buildShippingAddressInput(store: StoreAddressCfg) {
  if (!store.address1?.trim()) return null;
  const countryCode =
    store.country_code?.trim().length === 2
      ? store.country_code.trim().toUpperCase()
      : store.country?.trim().length === 2
        ? store.country.trim().toUpperCase()
        : "ES";
  return {
    firstName: store.first_name || "",
    lastName: store.last_name || "",
    company: store.company || "",
    address1: store.address1,
    address2: store.address2 || "",
    city: store.city || "",
    provinceCode: store.province_code || store.province || "",
    zip: store.zip || "",
    countryCode,
  };
}

async function readEntregaConfig(
  admin: AdminApiContext,
): Promise<EntregaCfg | null> {
  const response = await admin.graphql(
    `#graphql
      query PickupOrderConfig {
        shop {
          appConfig: metafield(namespace: "${SHOP_METAFIELD_NAMESPACE}", key: "${SHOP_METAFIELD_KEY}") {
            jsonValue
          }
          legacyConfig: metafield(namespace: "${LEGACY_SHOP_METAFIELD_NAMESPACE}", key: "${SHOP_METAFIELD_KEY}") {
            jsonValue
          }
        }
      }`,
  );
  const json = (await response.json()) as {
    data?: {
      shop?: {
        appConfig?: { jsonValue?: unknown } | null;
        legacyConfig?: { jsonValue?: unknown } | null;
      };
    };
  };
  const raw =
    json.data?.shop?.appConfig?.jsonValue ??
    json.data?.shop?.legacyConfig?.jsonValue;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as EntregaCfg;
}

const LOG_PREFIX = "[entrega-tienda] orders/create:";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) {
    console.error(`${LOG_PREFIX} sin admin context (¿sesión offline ausente?)`);
    return new Response();
  }

  const order = payload as OrderCreatePayload;
  console.log(
    `${LOG_PREFIX} payload keys=${Object.keys(order ?? {}).join(",")}`,
  );

  const orderGid =
    order.admin_graphql_api_id ??
    (order.id ? `gid://shopify/Order/${order.id}` : null);
  if (!orderGid) {
    console.error(
      `${LOG_PREFIX} sin id/admin_graphql_api_id en el payload, no se puede identificar el pedido`,
    );
    return new Response();
  }

  const existingTags = (order.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (existingTags.includes(REWRITTEN_TAG)) {
    console.log(`${LOG_PREFIX} ${orderGid} ya tiene el tag, se omite`);
    return new Response();
  }

  const shippingTitle = order.shipping_lines?.[0]?.title;
  console.log(
    `${LOG_PREFIX} ${orderGid} shipping_lines=${JSON.stringify(order.shipping_lines)} title="${shippingTitle}"`,
  );

  const cfg = await readEntregaConfig(admin);
  console.log(
    `${LOG_PREFIX} ${orderGid} cfg enabled=${cfg?.enabled} displayName="${cfg?.displayName}" matchers=${JSON.stringify(cfg?.pickupDeliveryOptionMatchers)}`,
  );
  if (!cfg || cfg.enabled === false) {
    console.log(`${LOG_PREFIX} ${orderGid} sin config o deshabilitada, se omite`);
    return new Response();
  }
  if (!matchesPickupTitle(shippingTitle, cfg)) {
    console.log(
      `${LOG_PREFIX} ${orderGid} título "${shippingTitle}" no coincide con pickup, se omite`,
    );
    return new Response();
  }

  const shippingAddress = cfg.storeAddress
    ? buildShippingAddressInput(cfg.storeAddress)
    : null;
  if (!shippingAddress) {
    console.error(
      `${LOG_PREFIX} storeAddress incompleto (${JSON.stringify(cfg.storeAddress)}), no se pudo reescribir el pedido ${orderGid}`,
    );
    return new Response();
  }

  console.log(
    `${LOG_PREFIX} ${orderGid} coincide con pickup, aplicando shippingAddress=${JSON.stringify(shippingAddress)}`,
  );

  const updateResponse = await admin.graphql(
    `#graphql
      mutation RewritePickupOrderAddress($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }`,
    { variables: { input: { id: orderGid, shippingAddress } } },
  );
  const updateJson = (await updateResponse.json()) as {
    data?: {
      orderUpdate?: {
        order?: { id: string } | null;
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };
  const userErrors = updateJson.data?.orderUpdate?.userErrors;
  if (userErrors?.length) {
    console.error(
      `${LOG_PREFIX} orderUpdate falló para ${orderGid}:`,
      JSON.stringify(userErrors),
    );
    return new Response();
  }
  if (!updateJson.data?.orderUpdate?.order) {
    console.error(
      `${LOG_PREFIX} orderUpdate sin order en la respuesta para ${orderGid}:`,
      JSON.stringify(updateJson),
    );
    return new Response();
  }
  console.log(`${LOG_PREFIX} ${orderGid} dirección reescrita correctamente`);

  const tagResponse = await admin.graphql(
    `#graphql
      mutation TagPickupOrder($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`,
    { variables: { id: orderGid, tags: [REWRITTEN_TAG] } },
  );
  const tagJson = (await tagResponse.json()) as {
    data?: { tagsAdd?: { userErrors?: Array<{ message: string }> } };
  };
  const tagErrors = tagJson.data?.tagsAdd?.userErrors;
  if (tagErrors?.length) {
    console.error(
      `[entrega-tienda] orders/create: tagsAdd falló para ${orderGid}:`,
      tagErrors,
    );
  }

  return new Response();
};
