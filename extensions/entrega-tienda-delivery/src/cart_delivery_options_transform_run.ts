import type {
  CartDeliveryOptionsTransformRunInput,
  CartDeliveryOptionsTransformRunResult,
  Operation,
} from "../generated/api";
import {
  inCountry,
  isEligibleForGeo,
  pickAddressForGeo,
  resolveAddressForGeoRule,
} from "./geo_eligibility";

type ZipRange = { from: string; to: string };

export type EntregaTiendaConfig = {
  enabled: boolean;
  matchMode: "any" | "all";
  cities: string[];
  provinces: string[];
  zipRanges: ZipRange[];
  countryCode: string;
  displayName: string;
  pickupDeliveryOptionMatchers: string[];
  /** CP tienda recogida; recomendado si hay envío a domicilio + recogida. */
  storeAddress?: {
    zip?: string;
    city?: string;
  };
};

const NO_CHANGES: CartDeliveryOptionsTransformRunResult = { operations: [] };

export function cartDeliveryOptionsTransformRun(
  input: CartDeliveryOptionsTransformRunInput,
): CartDeliveryOptionsTransformRunResult {
  const cfg = input.shop?.metafield?.jsonValue as
    | EntregaTiendaConfig
    | undefined;

  if (!cfg?.enabled) return NO_CHANGES;

  const operations: Operation[] = [];
  const groups = input.cart.deliveryGroups;

  for (const group of groups) {
    for (const opt of group.deliveryOptions) {
      if (!isPickupOption(opt.title, cfg.pickupDeliveryOptionMatchers)) {
        continue;
      }

      /**
       * Para PICK_UP/pickup Shopify suele poner en el grupo la dirección de la tienda,
       * no la del cliente. Para reglas "solo Madrid" hay que leer la dirección del envío.
       */
      const rawAddr = resolveAddressForGeoRule(
        group,
        opt.deliveryMethodType,
        groups,
        input.cart.billingAddress ?? null,
      );
      const addr = pickAddressForGeo(
        rawAddr,
        input.cart.billingAddress ?? null,
        cfg.storeAddress?.zip
          ? { zip: cfg.storeAddress.zip, city: cfg.storeAddress.city ?? null }
          : null,
      );

      const eligible =
        !!addr &&
        inCountry(addr, cfg) &&
        isEligibleForGeo(addr, cfg);

      if (!eligible) {
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: opt.handle },
        } as Operation);
        continue;
      }

      /**
       * Solo renombramos: el importe lo define la tarifa manual de envío en Admin.
       */
      operations.push({
        deliveryOptionRename: {
          deliveryOptionHandle: opt.handle,
          title: cfg.displayName,
        },
      } as Operation);
    }
  }

  return { operations };
}

function isPickupOption(
  title: string | undefined | null,
  matchers: string[],
): boolean {
  if (!title || !matchers?.length) return false;
  const t = normalize(title);
  return matchers.some((m) => t.includes(normalize(m)));
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
