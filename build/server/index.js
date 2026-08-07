var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, redirect, UNSAFE_withErrorBoundaryProps, useRouteError, useFetcher } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const DELIVERY_CUSTOMIZATION_TITLE = "Entrega en tienda — Delivery Customization";
const SHIPPING_DISCOUNT_TITLE = "Entrega en tienda — Shipping Discount";
const SHOP_METAFIELD_NAMESPACE = "custom";
const SHOP_METAFIELD_KEY = "entrega_tienda_config";
const DISCOUNT_FUNCTION_CONFIG_JSON = JSON.stringify({
  enabled: true,
  defaultPrice: 4.99,
  freeShippingThresholdEnabled: true,
  freeOverSubtotal: 100
});
const DEFAULT_ENTREGA_CONFIG = {
  enabled: true,
  matchMode: "any",
  countryCode: "ES",
  cities: ["Madrid"],
  provinces: ["M"],
  zipRanges: [{ from: "28000", to: "28099" }],
  displayName: "Entrega en tienda",
  pickupDeliveryOptionMatchers: ["entrega en tienda"],
  pricing: {
    default: 4.99,
    rules: [{ type: "subtotalAbove", value: 100, price: 0 }]
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
    phone: "+34900000000"
  }
};
function userErrorsMessage(userErrors) {
  if (!(userErrors == null ? void 0 : userErrors.length)) return null;
  return userErrors.map((e) => e.message).join("; ");
}
function graphqlErrorsMessage(errors) {
  if (!(errors == null ? void 0 : errors.length)) return null;
  return errors.map((e) => e.message).join("; ");
}
async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, variables ? { variables } : void 0);
  return await response.json();
}
async function resolveFunctionId(admin, titleIncludes, apiTypeIncludes) {
  var _a2;
  const result = await graphql(
    admin,
    `#graphql
      query ListShopifyFunctions {
        shopifyFunctions(first: 25) {
          nodes { id title apiType }
        }
      }`
  );
  const gqlErr = graphqlErrorsMessage(result.errors);
  if (gqlErr && !result.data) {
    return null;
  }
  const nodes = ((_a2 = result.data) == null ? void 0 : _a2.shopifyFunctions.nodes) ?? [];
  const node = nodes.find(
    (n) => n.title.includes(titleIncludes) && (!apiTypeIncludes || n.apiType.toLowerCase().includes(apiTypeIncludes))
  ) ?? nodes.find((n) => n.title.includes(titleIncludes));
  return (node == null ? void 0 : node.id) ?? null;
}
async function ensureDeliveryCustomization(admin) {
  var _a2, _b, _c, _d;
  const list2 = await graphql(
    admin,
    `#graphql
      query ListDeliveryCustomizations {
        deliveryCustomizations(first: 20) {
          nodes { id title enabled }
        }
      }`
  );
  const existing = (_a2 = list2.data) == null ? void 0 : _a2.deliveryCustomizations.nodes.find(
    (node) => node.title === DELIVERY_CUSTOMIZATION_TITLE
  );
  if (existing == null ? void 0 : existing.enabled) {
    return {
      ok: true,
      message: "Personalización de entrega ya activa."
    };
  }
  if (existing && !existing.enabled) {
    const updated = await graphql(
      admin,
      `#graphql
        mutation EnableDeliveryCustomization($id: ID!) {
          deliveryCustomizationUpdate(
            id: $id
            deliveryCustomization: { enabled: true }
          ) {
            deliveryCustomization { id enabled }
            userErrors { field message }
          }
        }`,
      { id: existing.id }
    );
    const updatePayload = (_b = updated.data) == null ? void 0 : _b.deliveryCustomizationUpdate;
    const updateErr = userErrorsMessage(updatePayload == null ? void 0 : updatePayload.userErrors);
    if (updateErr) {
      return { ok: false, message: updateErr };
    }
    if ((_c = updatePayload == null ? void 0 : updatePayload.deliveryCustomization) == null ? void 0 : _c.enabled) {
      return {
        ok: true,
        message: "Personalización de entrega reactivada."
      };
    }
  }
  const functionId = await resolveFunctionId(
    admin,
    "Delivery Customization"
  );
  if (!functionId) {
    return {
      ok: false,
      message: "Function de entrega no encontrada. Haz deploy + release de la app en Partners e instala de nuevo."
    };
  }
  const created = await graphql(
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
        functionId,
        enabled: true
      }
    }
  );
  const payload = (_d = created.data) == null ? void 0 : _d.deliveryCustomizationCreate;
  const err = userErrorsMessage(payload == null ? void 0 : payload.userErrors);
  if (err) {
    return { ok: false, message: err };
  }
  if (payload == null ? void 0 : payload.deliveryCustomization) {
    return {
      ok: true,
      message: "Personalización de entrega creada y activada."
    };
  }
  return { ok: false, message: "No se pudo crear la personalización de entrega." };
}
function isShippingDiscountTitle(title) {
  if (!title) return false;
  const normalized = title.trim().toLowerCase();
  return title === SHIPPING_DISCOUNT_TITLE || normalized.includes("entrega en tienda") && normalized.includes("shipping");
}
function isDuplicateDiscountTitleError(message) {
  return /unique|already|taken|duplicate/i.test(message);
}
function parseExistingAppDiscount(id, discount) {
  var _a2;
  if (!discount || typeof discount !== "object" || !("title" in discount)) {
    return null;
  }
  const parsed = discount;
  if (!parsed.title) return null;
  return {
    id,
    title: parsed.title,
    status: parsed.status,
    functionId: (_a2 = parsed.appDiscountType) == null ? void 0 : _a2.functionId
  };
}
async function findExistingShippingDiscount(admin, functionId) {
  var _a2, _b;
  const searchQuery = `title:${SHIPPING_DISCOUNT_TITLE}`;
  const byTitle = await graphql(
    admin,
    `#graphql
      query FindShippingDiscountByTitle($query: String!) {
        discountNodes(first: 10, query: $query) {
          nodes {
            id
            discount {
              ... on DiscountAutomaticApp {
                title
                status
                appDiscountType { functionId }
              }
            }
          }
        }
      }`,
    { query: searchQuery }
  );
  for (const node of ((_a2 = byTitle.data) == null ? void 0 : _a2.discountNodes.nodes) ?? []) {
    const parsed = parseExistingAppDiscount(node.id, node.discount);
    if (!parsed) continue;
    if (isShippingDiscountTitle(parsed.title)) return parsed;
    if (functionId && parsed.functionId === functionId) return parsed;
  }
  const list2 = await graphql(
    admin,
    `#graphql
      query ListAppAutomaticDiscounts {
        discountNodes(first: 50, query: "type:app") {
          nodes {
            id
            discount {
              ... on DiscountAutomaticApp {
                title
                status
                appDiscountType { functionId }
              }
            }
          }
        }
      }`
  );
  for (const node of ((_b = list2.data) == null ? void 0 : _b.discountNodes.nodes) ?? []) {
    const parsed = parseExistingAppDiscount(node.id, node.discount);
    if (!parsed) continue;
    if (isShippingDiscountTitle(parsed.title)) return parsed;
    if (functionId && parsed.functionId === functionId) return parsed;
  }
  return null;
}
async function ensureShippingDiscountFunctionConfig(admin, discountId) {
  await graphql(
    admin,
    `#graphql
      mutation ConfigureShippingDiscountFunction($id: ID!, $input: DiscountAutomaticAppInput!) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $input) {
          userErrors { field message }
        }
      }`,
    {
      id: discountId,
      input: {
        metafields: [
          {
            namespace: "$app",
            key: "function-configuration",
            type: "json",
            value: DISCOUNT_FUNCTION_CONFIG_JSON
          }
        ]
      }
    }
  );
}
async function ensureShippingDiscountActive(admin, discountId) {
  var _a2, _b;
  const updated = await graphql(
    admin,
    `#graphql
      mutation ReactivateShippingDiscount($id: ID!, $input: DiscountAutomaticAppInput!) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $input) {
          automaticAppDiscount { title status }
          userErrors { field message }
        }
      }`,
    {
      id: discountId,
      input: {
        startsAt: (/* @__PURE__ */ new Date()).toISOString(),
        discountClasses: ["SHIPPING"]
      }
    }
  );
  const payload = (_a2 = updated.data) == null ? void 0 : _a2.discountAutomaticAppUpdate;
  const err = userErrorsMessage(payload == null ? void 0 : payload.userErrors);
  if (err) {
    return {
      ok: true,
      message: "Descuento de envío ya existía en la tienda."
    };
  }
  const status = (_b = payload == null ? void 0 : payload.automaticAppDiscount) == null ? void 0 : _b.status;
  if (status === "ACTIVE" || status === "SCHEDULED") {
    return { ok: true, message: "Descuento de envío reactivado." };
  }
  return { ok: true, message: "Descuento de envío ya configurado." };
}
async function ensureShippingDiscount(admin) {
  var _a2, _b;
  const functionId = await resolveFunctionId(
    admin,
    "Shipping Discount",
    "shipping"
  );
  const existing = await findExistingShippingDiscount(admin, functionId);
  if (existing) {
    await ensureShippingDiscountFunctionConfig(admin, existing.id);
    if (existing.status === "EXPIRED") {
      return ensureShippingDiscountActive(admin, existing.id);
    }
    return {
      ok: true,
      message: "Descuento de envío ya configurado."
    };
  }
  if (!functionId) {
    return {
      ok: false,
      message: "Function de descuento no encontrada. Haz deploy + release de la app en Partners e instala de nuevo."
    };
  }
  const created = await graphql(
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
        functionId,
        startsAt: (/* @__PURE__ */ new Date()).toISOString(),
        discountClasses: ["SHIPPING"],
        metafields: [
          {
            namespace: "$app",
            key: "function-configuration",
            type: "json",
            value: DISCOUNT_FUNCTION_CONFIG_JSON
          }
        ]
      }
    }
  );
  const gqlErr = graphqlErrorsMessage(created.errors);
  if (gqlErr && !((_a2 = created.data) == null ? void 0 : _a2.discountAutomaticAppCreate)) {
    return { ok: false, message: gqlErr };
  }
  const payload = (_b = created.data) == null ? void 0 : _b.discountAutomaticAppCreate;
  const err = userErrorsMessage(payload == null ? void 0 : payload.userErrors);
  if (err) {
    if (isDuplicateDiscountTitleError(err)) {
      const duplicate = await findExistingShippingDiscount(admin, functionId);
      if ((duplicate == null ? void 0 : duplicate.status) === "EXPIRED") {
        return ensureShippingDiscountActive(admin, duplicate.id);
      }
      if (duplicate) {
        await ensureShippingDiscountFunctionConfig(admin, duplicate.id);
      }
      return {
        ok: true,
        message: "Descuento de envío ya existía en la tienda."
      };
    }
    return { ok: false, message: err };
  }
  if (payload == null ? void 0 : payload.automaticAppDiscount) {
    return {
      ok: true,
      message: "Descuento de envío creado."
    };
  }
  return { ok: false, message: "No se pudo crear el descuento de envío." };
}
async function ensureMetafieldDefinition(admin) {
  var _a2, _b, _c, _d, _e;
  const existing = await graphql(
    admin,
    `#graphql
      query ShopEntregaMetafieldDefinition {
        metafieldDefinitions(
          first: 1
          ownerType: SHOP
          namespace: "${SHOP_METAFIELD_NAMESPACE}"
          key: "${SHOP_METAFIELD_KEY}"
        ) {
          nodes { id key namespace }
        }
      }`
  );
  if ((_c = (_b = (_a2 = existing.data) == null ? void 0 : _a2.metafieldDefinitions) == null ? void 0 : _b.nodes) == null ? void 0 : _c.length) {
    return {
      ok: true,
      message: "Definición del metacampo de tienda ya existía."
    };
  }
  const created = await graphql(
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
            access: {
              storefront: PUBLIC_READ
            }
          }
        ) {
          createdDefinition { id namespace key }
          userErrors { field message code }
        }
      }`
  );
  const payload = (_d = created.data) == null ? void 0 : _d.metafieldDefinitionCreate;
  const err = userErrorsMessage(payload == null ? void 0 : payload.userErrors);
  if (err && !((_e = payload == null ? void 0 : payload.userErrors) == null ? void 0 : _e.some(
    (e) => /taken|already|exists|not permitted|access control/i.test(
      `${e.message} ${e.code ?? ""}`
    )
  ))) {
    return { ok: false, message: err };
  }
  if (payload == null ? void 0 : payload.createdDefinition) {
    return {
      ok: true,
      message: "Definición del metacampo de tienda creada."
    };
  }
  return {
    ok: true,
    message: "Definición del metacampo de tienda ya existía."
  };
}
function normalizeMatcherToken(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function hasUnsafePickupMatchers(matchers) {
  return matchers.some((m) => {
    const n = normalizeMatcherToken(m);
    if (!n) return true;
    if (n === "recogida") return true;
    if (n.includes("punto de servicio")) return true;
    if (n.includes("sendcloud")) return true;
    if (n.includes("recogida") && !n.includes("entrega en tienda")) return true;
    return false;
  });
}
function repairEntregaConfigJson(raw) {
  const matchers = Array.isArray(raw.pickupDeliveryOptionMatchers) ? raw.pickupDeliveryOptionMatchers : [];
  if (!hasUnsafePickupMatchers(matchers)) return null;
  return {
    ...raw,
    pickupDeliveryOptionMatchers: [...DEFAULT_ENTREGA_CONFIG.pickupDeliveryOptionMatchers]
  };
}
async function ensureShopMetafieldValue(admin) {
  var _a2, _b, _c, _d, _e;
  const shopQuery = await graphql(
    admin,
    `#graphql
      query ShopEntregaConfig {
        shop {
          id
          metafield(namespace: "${SHOP_METAFIELD_NAMESPACE}", key: "${SHOP_METAFIELD_KEY}") {
            id
            jsonValue
          }
        }
      }`
  );
  const shopId = (_a2 = shopQuery.data) == null ? void 0 : _a2.shop.id;
  if (!shopId) {
    return { ok: false, message: "No se pudo leer el ID de la tienda." };
  }
  const existing = (_b = shopQuery.data) == null ? void 0 : _b.shop.metafield;
  if (existing == null ? void 0 : existing.id) {
    const raw = existing.jsonValue != null && typeof existing.jsonValue === "object" && !Array.isArray(existing.jsonValue) ? existing.jsonValue : null;
    const repaired = raw ? repairEntregaConfigJson(raw) : null;
    if (repaired) {
      const set2 = await graphql(
        admin,
        `#graphql
          mutation RepairShopConfigMetafield($metafields: [MetafieldsSetInput!]!) {
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
              value: JSON.stringify(repaired)
            }
          ]
        }
      );
      const payload2 = (_c = set2.data) == null ? void 0 : _c.metafieldsSet;
      const err2 = userErrorsMessage(payload2 == null ? void 0 : payload2.userErrors);
      if (err2) {
        return {
          ok: false,
          message: `Matchers inseguros detectados pero no se pudo corregir: ${err2}`
        };
      }
      return {
        ok: true,
        message: "Matchers de envío corregidos (ya no afectan Sendcloud / pickup points)."
      };
    }
    return {
      ok: true,
      message: "Configuración de tienda (metacampo) ya cargada."
    };
  }
  const set = await graphql(
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
          value: JSON.stringify(DEFAULT_ENTREGA_CONFIG)
        }
      ]
    }
  );
  const payload = (_d = set.data) == null ? void 0 : _d.metafieldsSet;
  const err = userErrorsMessage(payload == null ? void 0 : payload.userErrors);
  if (err) {
    return { ok: false, message: err };
  }
  if ((_e = payload == null ? void 0 : payload.metafields) == null ? void 0 : _e.length) {
    return {
      ok: true,
      message: "Configuración inicial de tienda cargada."
    };
  }
  return { ok: false, message: "No se pudo guardar la configuración de tienda." };
}
async function runEntregaTiendaSetup(admin) {
  const metafieldDefinition = await ensureMetafieldDefinition(admin);
  const shopMetafield = await ensureShopMetafieldValue(admin);
  const deliveryCustomization = await ensureDeliveryCustomization(admin);
  const shippingDiscount = await ensureShippingDiscount(admin);
  return {
    metafieldDefinition,
    shopMetafield,
    deliveryCustomization,
    shippingDiscount
  };
}
const setup_server = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DEFAULT_ENTREGA_CONFIG,
  runEntregaTiendaSetup
}, Symbol.toStringTag, { value: "Module" }));
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  },
  hooks: {
    afterAuth: async ({ admin }) => {
      try {
        await runEntregaTiendaSetup(admin);
      } catch (error) {
        console.error("[entrega-tienda] afterAuth setup failed:", error);
      }
    }
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.October25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        ServerRouter,
        {
          context: reactRouterContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const action$3 = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const action$2 = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({
      where: {
        shop
      }
    });
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$5 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$1 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: route$1,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_12o3y_1";
const heading = "_heading_12o3y_11";
const text = "_text_12o3y_12";
const content = "_content_12o3y_22";
const form = "_form_12o3y_27";
const label = "_label_12o3y_35";
const input = "_input_12o3y_43";
const button = "_button_12o3y_47";
const list = "_list_12o3y_51";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$4 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$3 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$3,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = async ({
  request
}) => {
  await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const app = UNSAFE_withComponentProps(function App3() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    children: [/* @__PURE__ */ jsx("s-app-nav", {
      children: /* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Configuración"
      })
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers$2 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers: headers$2,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  const {
    admin
  } = await authenticate.admin(request);
  const {
    runEntregaTiendaSetup: runEntregaTiendaSetup2
  } = await Promise.resolve().then(() => setup_server);
  const status = await runEntregaTiendaSetup2(admin);
  return {
    status
  };
};
const app_deliveryCustomization_$functionId_$id = UNSAFE_withComponentProps(function DeliveryCustomizationSetup() {
  const {
    status
  } = useLoaderData();
  const ok = status.deliveryCustomization.ok;
  return /* @__PURE__ */ jsx("s-page", {
    heading: "Entrega en tienda",
    children: /* @__PURE__ */ jsxs("s-section", {
      heading: "Personalización de entrega",
      children: [/* @__PURE__ */ jsx("s-banner", {
        tone: ok ? "success" : "critical",
        children: status.deliveryCustomization.message
      }), /* @__PURE__ */ jsx("s-paragraph", {
        children: ok ? "Ya puedes cerrar esta ventana y probar el checkout." : "Abre la app desde Apps → entrega-tienda y pulsa «Repetir configuración»."
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Ir al panel de configuración"
      })]
    })
  });
});
const headers$1 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_deliveryCustomization_$functionId_$id,
  headers: headers$1,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
function allSetupOk(status) {
  return status.metafieldDefinition.ok && status.shopMetafield.ok && status.deliveryCustomization.ok && status.shippingDiscount.ok;
}
const loader = async ({
  request
}) => {
  const {
    admin
  } = await authenticate.admin(request);
  const {
    runEntregaTiendaSetup: runEntregaTiendaSetup2
  } = await Promise.resolve().then(() => setup_server);
  const status = await runEntregaTiendaSetup2(admin);
  return {
    status
  };
};
const action = async ({
  request
}) => {
  const {
    admin
  } = await authenticate.admin(request);
  const {
    runEntregaTiendaSetup: runEntregaTiendaSetup2
  } = await Promise.resolve().then(() => setup_server);
  const status = await runEntregaTiendaSetup2(admin);
  return {
    status
  };
};
function StepRow({
  label: label2,
  step
}) {
  return /* @__PURE__ */ jsx("s-box", {
    padding: "base",
    borderWidth: "base",
    borderRadius: "base",
    children: /* @__PURE__ */ jsxs("s-stack", {
      direction: "block",
      gap: "small",
      children: [/* @__PURE__ */ jsxs("s-text", {
        type: step.ok ? "strong" : void 0,
        children: [step.ok ? "✓" : "✗", " ", label2]
      }), /* @__PURE__ */ jsx("s-text", {
        color: "subdued",
        children: step.message
      })]
    })
  });
}
const app__index = UNSAFE_withComponentProps(function Index() {
  var _a2, _b;
  const {
    status
  } = useLoaderData();
  const fetcher = useFetcher();
  const shopify2 = useAppBridge();
  const currentStatus = ((_a2 = fetcher.data) == null ? void 0 : _a2.status) ?? status;
  const ready = allSetupOk(currentStatus);
  const isLoading = ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  useEffect(() => {
    var _a3;
    if (((_a3 = fetcher.data) == null ? void 0 : _a3.status) && allSetupOk(fetcher.data.status)) {
      shopify2.toast.show("Configuración completada");
    }
  }, [(_b = fetcher.data) == null ? void 0 : _b.status, shopify2]);
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Entrega en tienda",
    children: [/* @__PURE__ */ jsx("s-button", {
      slot: "primary-action",
      onClick: () => fetcher.submit({}, {
        method: "POST"
      }),
      ...isLoading ? {
        loading: true
      } : {},
      children: "Repetir configuración"
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Estado de la instalación",
      children: [/* @__PURE__ */ jsx("s-banner", {
        tone: ready ? "success" : "warning",
        children: ready ? "La app está lista. Solo falta revisar envíos y ajustar la configuración de ciudad/zona si hace falta." : "Hay pasos pendientes. Usa el botón de abajo o reinstala la app si el problema continúa."
      }), /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "base",
        children: [/* @__PURE__ */ jsx("s-button", {
          variant: "primary",
          onClick: () => fetcher.submit({}, {
            method: "POST"
          }),
          ...isLoading ? {
            loading: true
          } : {},
          children: ready ? "Volver a ejecutar configuración" : "Ejecutar configuración ahora"
        }), /* @__PURE__ */ jsx("s-text", {
          color: "subdued",
          children: "Al abrir esta página la configuración se ejecuta sola. Si algo falló, pulsa el botón para repetirla."
        })]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Recursos creados automáticamente",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "base",
        children: [/* @__PURE__ */ jsx(StepRow, {
          label: "Definición del metacampo de tienda",
          step: currentStatus.metafieldDefinition
        }), /* @__PURE__ */ jsx(StepRow, {
          label: "Configuración inicial (ciudad, CP, dirección tienda)",
          step: currentStatus.shopMetafield
        }), /* @__PURE__ */ jsx(StepRow, {
          label: "Personalización de entrega",
          step: currentStatus.deliveryCustomization
        }), /* @__PURE__ */ jsx(StepRow, {
          label: "Descuento de envío automático",
          step: currentStatus.shippingDiscount
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Qué debe hacer el cliente",
      children: /* @__PURE__ */ jsxs("s-unordered-list", {
        children: [/* @__PURE__ */ jsxs("s-list-item", {
          children: ["En ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Configuración → Envío y entrega"
          }), ", crear la tarifa manual ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Entrega en tienda"
          }), " ", "con el precio deseado."]
        }), /* @__PURE__ */ jsxs("s-list-item", {
          children: ["En ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Datos personalizados → Tienda"
          }), ", editar ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Entrega en tienda — configuración"
          }), " ", "para cambiar ciudades, códigos postales y dirección de la tienda."]
        }), /* @__PURE__ */ jsxs("s-list-item", {
          children: ["Matcher del metacampo: solo", " ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Entrega en tienda"
          }), '. No usar "recogida" (conflicto con Sendcloud).']
        }), /* @__PURE__ */ jsxs("s-list-item", {
          children: ["En ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Configuración → Checkout → Personalizar"
          }), ", añade el bloque ", /* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Entrega en tienda — UI"
          }), " ", "en la sección de envío (banner + cambio de dirección a tienda)."]
        }), /* @__PURE__ */ jsx("s-list-item", {
          children: "Probar el checkout con una dirección de Madrid (p. ej. CP 28042) en incógnito."
        })]
      })
    })]
  });
});
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: app__index,
  headers,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BF-FzpIp.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-CC0ImHxS.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-DELoIbZP.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js", "/assets/AppProxyProvider-DmoHTPZF.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-BKVlaaEk.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js"], "css": ["/assets/route-Xpdx9QZl.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-DbKNTe2N.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js", "/assets/AppProxyProvider-DmoHTPZF.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.delivery-customization.$functionId.$id": { "id": "routes/app.delivery-customization.$functionId.$id", "parentId": "routes/app", "path": "delivery-customization/:functionId/:id", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.delivery-customization._functionId._id-C_m-dg56.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-qSGXd60U.js", "imports": ["/assets/chunk-4N6VE7H7-a2UNLnVa.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-be69e5b5.js", "version": "be69e5b5", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "v8_passThroughRequests": false, "unstable_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route4
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/app.delivery-customization.$functionId.$id": {
    id: "routes/app.delivery-customization.$functionId.$id",
    parentId: "routes/app",
    path: "delivery-customization/:functionId/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route8
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
