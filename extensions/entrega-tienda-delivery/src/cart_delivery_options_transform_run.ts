import type {
  CartDeliveryOptionsTransformRunInput,
  CartDeliveryOptionsTransformRunResult,
  Operation,
} from "../generated/api";
import { DeliveryMethod } from "../generated/api";
import {
  inCountry,
  isEligibleForGeo,
  pickAddressForGeo,
  resolveAddressForGeoRule,
} from "./geo_eligibility";
import { matchesOriginalShippingRateTitle } from "./delivery_option_match";

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
      // Tarifa manual de envío; no pickup points (Sendcloud PICKUP_POINT, etc.).
      if (opt.deliveryMethodType !== DeliveryMethod.Shipping) {
        continue;
      }
      if (
        !matchesOriginalShippingRateTitle(
          opt.title,
          cfg.pickupDeliveryOptionMatchers,
        )
      ) {
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

      const hasGeoSignal = Boolean(
        addr?.city?.trim() || addr?.zip?.trim() || addr?.provinceCode?.trim(),
      );
      if (!hasGeoSignal) {
        continue;
      }

      const eligible =
        inCountry(addr, cfg) &&
        isEligibleForGeo(addr, cfg);

      if (eligible) {
        operations.push({
          deliveryOptionRename: {
            deliveryOptionHandle: opt.handle,
            title: cfg.displayName,
          },
        } as Operation);
        continue;
      }

      // Solo ocultar si hay CP/ciudad+provincia claros; evita parpadeos en checkout.
      if (hasConfidentOutsideSignal(addr, cfg)) {
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: opt.handle },
        } as Operation);
      }
    }
  }

  return { operations };
}

function hasConfidentOutsideSignal(
  addr: {
    city?: string | null;
    zip?: string | null;
    provinceCode?: string | null;
    countryCode?: string | null;
  },
  cfg: EntregaTiendaConfig,
): boolean {
  const explicitCountry = addr.countryCode?.trim();
  if (explicitCountry && !inCountry(addr, cfg)) {
    return true;
  }

  const zipDigits = addr.zip?.replace(/\D/g, "") ?? "";
  if (zipDigits.length >= 5 && cfg.zipRanges?.length) {
    const inZip = cfg.zipRanges.some((r) =>
      zipInNumericRange(zipDigits, r.from, r.to),
    );
    if (!inZip) return true;
  }

  if (addr.city?.trim() && cfg.cities?.length) {
    const city = normalize(addr.city);
    const cityMatch = cfg.cities.some((c) => normalize(c) === city);
    if (!cityMatch && zipDigits.length >= 5) {
      const inZip = cfg.zipRanges?.some((r) =>
        zipInNumericRange(zipDigits, r.from, r.to),
      );
      if (!inZip) return true;
    }
  }

  return false;
}

function zipInNumericRange(zipDigits: string, from: string, to: string): boolean {
  const a = from.replace(/\D/g, "");
  const b = to.replace(/\D/g, "");
  if (!zipDigits || !a || !b) return false;
  if (zipDigits.length === a.length && a.length === b.length) {
    const z = parseInt(zipDigits, 10);
    return z >= parseInt(a, 10) && z <= parseInt(b, 10);
  }
  return zipDigits >= a && zipDigits <= b;
}
