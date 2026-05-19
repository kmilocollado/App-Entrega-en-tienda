import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { SetupStatus } from "./setup.shared";

const DELIVERY_FUNCTION_HANDLE = "entrega-tienda-delivery";
const DISCOUNT_FUNCTION_HANDLE = "pickup-discount";
const DELIVERY_CUSTOMIZATION_TITLE = "Entrega en tienda — Delivery Customization";
const SHIPPING_DISCOUNT_TITLE = "Entrega en tienda — Shipping Discount";
const SHOP_METAFIELD_NAMESPACE = "custom";
const SHOP_METAFIELD_KEY = "entrega_tienda_config";

export const DEFAULT_ENTREGA_CONFIG = {
  enabled: true,
  matchMode: "any" as const,
  countryCode: "ES",
  cities: ["Madrid"],
  provinces: ["M"],
  zipRanges: [{ from: "28000", to: "28099" }],
  displayName: "Entrega en tienda",
  pickupDeliveryOptionMatchers: ["entrega en tienda"],
  pricing: {
    default: 4.99,
    rules: [{ type: "subtotalAbove", value: 100, price: 0 }],
  },
  storeAddress: {
    company: "Tienda VIDAL & VIDAL",
    first_name: "Tienda",
    last_name: "Recogida",
    address1: "Plaza del Emperador Carlos V",
    address2: "",
    city: "Madrid",
    province: "Madrid",
    province_code: "M",
    zip: "28045",
    country: "Spain",
    country_code: "ES",
    phone: "+34900000000",
  },
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function userErrorsMessage(
  userErrors: Array<{ message: string }> | null | undefined,
): string | null {
  if (!userErrors?.length) return null;
  return userErrors.map((e) => e.message).join("; ");
}

async function graphql<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResponse<T>> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return (await response.json()) as GraphqlResponse<T>;
}

async function ensureDeliveryCustomization(
  admin: AdminApiContext,
): Promise<SetupStepResult> {
  const list = await graphql<{
    deliveryCustomizations: {
      nodes: Array<{ id: string; title: string; enabled: boolean }>;
    };
  }>(
    admin,
    `#graphql
      query ListDeliveryCustomizations {
        deliveryCustomizations(first: 20) {
          nodes { id title enabled }
        }
      }`,
  );

  const existing = list.data?.deliveryCustomizations.nodes.find(
    (node) => node.title === DELIVERY_CUSTOMIZATION_TITLE,
  );
  if (existing?.enabled) {
    return {
      ok: true,
      message: "Personalización de entrega ya activa.",
    };
  }

  const created = await graphql<{
    deliveryCustomizationCreate: {
      deliveryCustomization: { id: string; title: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateDeliveryCustomization($input: DeliveryCustomizationInput!) {
        deliveryCustomizationCreate(deliveryCustomization: $input) {
          deliveryCustomization { id title enabled }
          userErrors { field message }
        }
      }`,
    {
      input: {
        title: DELIVERY_CUSTOMIZATION_TITLE,
        functionHandle: DELIVERY_FUNCTION_HANDLE,
        enabled: true,
      },
    },
  );

  const payload = created.data?.deliveryCustomizationCreate;
  const err = userErrorsMessage(payload?.userErrors);
  if (err) {
    return { ok: false, message: err };
  }
  if (payload?.deliveryCustomization) {
    return {
      ok: true,
      message: "Personalización de entrega creada y activada.",
    };
  }
  return { ok: false, message: "No se pudo crear la personalización de entrega." };
}

async function ensureShippingDiscount(
  admin: AdminApiContext,
): Promise<SetupStepResult> {
  const list = await graphql<{
    automaticDiscountNodes: {
      nodes: Array<{
        id: string;
        automaticDiscount: { title?: string } | null;
      }>;
    };
  }>(
    admin,
    `#graphql
      query ListAutomaticDiscounts {
        automaticDiscountNodes(first: 25) {
          nodes {
            id
            automaticDiscount {
              ... on DiscountAutomaticApp { title status }
            }
          }
        }
      }`,
  );

  const existing = list.data?.automaticDiscountNodes.nodes.find(
    (node) =>
      node.automaticDiscount &&
      "title" in node.automaticDiscount &&
      node.automaticDiscount.title === SHIPPING_DISCOUNT_TITLE,
  );
  if (existing) {
    return {
      ok: true,
      message: "Descuento de envío ya configurado.",
    };
  }

  const created = await graphql<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string; title: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateShippingDiscount($input: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $input) {
          automaticAppDiscount { discountId title status }
          userErrors { field message }
        }
      }`,
    {
      input: {
        title: SHIPPING_DISCOUNT_TITLE,
        functionHandle: DISCOUNT_FUNCTION_HANDLE,
        startsAt: new Date().toISOString(),
      },
    },
  );

  const payload = created.data?.discountAutomaticAppCreate;
  const err = userErrorsMessage(payload?.userErrors);
  if (err) {
    return { ok: false, message: err };
  }
  if (payload?.automaticAppDiscount) {
    return {
      ok: true,
      message: "Descuento de envío creado.",
    };
  }
  return { ok: false, message: "No se pudo crear el descuento de envío." };
}

async function ensureMetafieldDefinition(
  admin: AdminApiContext,
): Promise<SetupStepResult> {
  const created = await graphql<{
    metafieldDefinitionCreate: {
      createdDefinition: { id: string; key: string } | null;
      userErrors: Array<{ message: string; code?: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateShopMetafieldDefinition {
        metafieldDefinitionCreate(
          definition: {
            name: "Entrega en tienda — configuración"
            namespace: "${SHOP_METAFIELD_NAMESPACE}"
            key: "${SHOP_METAFIELD_KEY}"
            description: "Ciudades, códigos postales, dirección de tienda y precios."
            type: "json"
            ownerType: SHOP
          }
        ) {
          createdDefinition { id namespace key }
          userErrors { field message code }
        }
      }`,
  );

  const payload = created.data?.metafieldDefinitionCreate;
  const err = userErrorsMessage(payload?.userErrors);
  if (
    err &&
    !payload?.userErrors?.some((e) =>
      /taken|already|exists/i.test(`${e.message} ${e.code ?? ""}`),
    )
  ) {
    return { ok: false, message: err };
  }
  if (payload?.createdDefinition) {
    return {
      ok: true,
      message: "Definición del metacampo de tienda creada.",
    };
  }
  return {
    ok: true,
    message: "Definición del metacampo de tienda ya existía.",
  };
}

async function ensureShopMetafieldValue(
  admin: AdminApiContext,
): Promise<SetupStepResult> {
  const shopQuery = await graphql<{
    shop: {
      id: string;
      metafield: { id: string } | null;
    };
  }>(
    admin,
    `#graphql
      query ShopEntregaConfig {
        shop {
          id
          metafield(namespace: "${SHOP_METAFIELD_NAMESPACE}", key: "${SHOP_METAFIELD_KEY}") {
            id
          }
        }
      }`,
  );

  const shopId = shopQuery.data?.shop.id;
  if (!shopId) {
    return { ok: false, message: "No se pudo leer el ID de la tienda." };
  }

  if (shopQuery.data?.shop.metafield?.id) {
    return {
      ok: true,
      message: "Configuración de tienda (metacampo) ya cargada.",
    };
  }

  const set = await graphql<{
    metafieldsSet: {
      metafields: Array<{ id: string }> | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation SetShopConfigMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key }
          userErrors { field message }
        }
      }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: SHOP_METAFIELD_NAMESPACE,
          key: SHOP_METAFIELD_KEY,
          type: "json",
          value: JSON.stringify(DEFAULT_ENTREGA_CONFIG),
        },
      ],
    },
  );

  const payload = set.data?.metafieldsSet;
  const err = userErrorsMessage(payload?.userErrors);
  if (err) {
    return { ok: false, message: err };
  }
  if (payload?.metafields?.length) {
    return {
      ok: true,
      message: "Configuración inicial de tienda cargada.",
    };
  }
  return { ok: false, message: "No se pudo guardar la configuración de tienda." };
}

/** Idempotente: crea recursos que faltan tras instalar o abrir la app. */
export async function runEntregaTiendaSetup(
  admin: AdminApiContext,
): Promise<SetupStatus> {
  const metafieldDefinition = await ensureMetafieldDefinition(admin);
  const shopMetafield = await ensureShopMetafieldValue(admin);
  const deliveryCustomization = await ensureDeliveryCustomization(admin);
  const shippingDiscount = await ensureShippingDiscount(admin);

  return {
    metafieldDefinition,
    shopMetafield,
    deliveryCustomization,
    shippingDiscount,
  };
}
