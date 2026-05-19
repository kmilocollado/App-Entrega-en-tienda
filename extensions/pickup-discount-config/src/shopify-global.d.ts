declare global {
  interface ShopifyMetafieldEntry {
    namespace: string;
    key: string;
    value: string;
    type?: string;
  }

  interface ShopifyDiscountFunctionSettingsApi {
    data: {
      metafields: ShopifyMetafieldEntry[];
      functionId?: string;
      discountId?: string;
    };
    applyMetafieldChange: (change: {
      type: "updateMetafield" | "removeMetafield";
      namespace: string;
      key: string;
      value?: string;
      valueType?: string;
    }) => Promise<unknown>;
  }

  const shopify: ShopifyDiscountFunctionSettingsApi;
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }
  }
}

export {};
