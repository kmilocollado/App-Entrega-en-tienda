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
import { matchesOriginalShippingRateTitle, isCarrierPickupOrSendcloudTitle } from "./delivery_option_match";
import { resolveEntregaTiendaConfig } from "./entrega_config";

const NO_CHANGES: CartDeliveryOptionsTransformRunResult = { operations: [] };

export function cartDeliveryOptionsTransformRun(
  input: CartDeliveryOptionsTransformRunInput,
): CartDeliveryOptionsTransformRunResult {
  const shop = input.shop as
    | {
        appEntregaConfig?: { jsonValue?: unknown } | null;
        legacyEntregaConfig?: { jsonValue?: unknown } | null;
      }
    | null
    | undefined;

  const cfg = resolveEntregaTiendaConfig(
    shop?.appEntregaConfig?.jsonValue,
    shop?.legacyEntregaConfig?.jsonValue,
  );

  if (!cfg || cfg.enabled === false) return NO_CHANGES;

  const operations: Operation[] = [];
  const groups = input.cart.deliveryGroups;

  for (const group of groups) {
    for (const opt of group.deliveryOptions) {
      // Tarifa manual de envío; no pickup points (Sendcloud PICKUP_POINT, etc.).
      if (opt.deliveryMethodType !== DeliveryMethod.Shipping) {
        continue;
      }
      if (isCarrierPickupOrSendcloudTitle(opt.title)) {
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
        inCountry(addr, cfg) && isEligibleForGeo(addr, cfg);

      if (eligible) {
        operations.push({
          deliveryOptionRename: {
            deliveryOptionHandle: opt.handle,
            title: cfg.displayName,
          },
        } as Operation);
        continue;
      }

      // Fuera de Madrid (u otra zona): ocultar cuando hay CP/ciudad/provincia del cliente.
      if (hasGeoSignal) {
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: opt.handle },
        } as Operation);
      }
    }
  }

  return { operations };
}
