import {
  matchesOriginalShippingRateTitle,
  matchesRenamedDisplayTitle,
} from "./deliveryOptionMatch";

import {
  inCountry,
  isEligibleForGeo,
  type GeoMatchConfig,
} from "./geoEligibility";

export type StoreAddress = {
  first_name: string;
  last_name: string;
  /** Nombre de empresa en la dirección de envío al elegir recogida (p. ej. transportista). */
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  /** No se usa en checkout; el teléfono del pedido es siempre el del cliente. */
  phone?: string;
  /** Preferible: ISO (ej. `ES`). Si falta se intentará inferir desde `country`. */
  country_code?: string;
  /** Preferible: código que usa Shopify Checkout para la provincia (ej. España: `MD` para Madrid). */
  province_code?: string;
};

export type EntregaTiendaUIConfig = {
  enabled: boolean;
  displayName: string;
  pickupDeliveryOptionMatchers: string[];
  storeAddress: StoreAddress;
  matchMode?: "any" | "all";
  cities?: string[];
  provinces?: string[];
  zipRanges?: Array<{ from: string; to: string }>;
  countryCode?: string;
};

type CheckoutDeliveryOption = {
  title?: string;
  type?: string;
};

/** Sendcloud y otros pickup points usan type pickupPoint; no tocar. */
export function isManualShippingDeliveryOption(
  opt: CheckoutDeliveryOption | undefined | null,
): boolean {
  if (!opt?.type) return true;
  return opt.type === "shipping" || opt.type === "local";
}

/**
 * Tarifa manual "Recogida en V&V Fuencarral" (SHIPPING), no Sendcloud pickupPoint.
 */
export function matchesPickupDeliveryTitle(
  title: string | undefined | null,
  cfg: PickupMatchInput,
  opt?: CheckoutDeliveryOption | null,
): boolean {
  if (!title?.trim() || !cfg) return false;
  if (opt && !isManualShippingDeliveryOption(opt)) return false;

  const matchers = cfg.pickupDeliveryOptionMatchers ?? [];
  if (matchesOriginalShippingRateTitle(title, matchers)) return true;

  // Tras rename por la function; solo shipping/local (Sendcloud pickupPoint excluido arriba).
  return matchesRenamedDisplayTitle(title, cfg.displayName);
}

export type PickupMatchInput = {
  displayName: string;
  pickupDeliveryOptionMatchers: string[];
};

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Solo Madrid (u otra zona definida en el metacampo). */
export function isCustomerEligibleForEntregaTienda(
  addr:
    | {
        city?: string | null;
        provinceCode?: string | null;
        zip?: string | null;
        countryCode?: string | null;
      }
    | null
    | undefined,
  cfg: GeoMatchConfig | null | undefined,
): boolean {
  if (!cfg) return false;
  const hasSignal = Boolean(
    addr?.city?.trim() || addr?.zip?.trim() || addr?.provinceCode?.trim(),
  );
  if (!hasSignal) return false;
  return inCountry(addr ?? {}, cfg) && isEligibleForGeo(addr ?? {}, cfg);
}
