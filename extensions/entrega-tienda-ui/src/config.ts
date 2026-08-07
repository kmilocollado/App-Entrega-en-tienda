import {
  matchesOriginalShippingRateTitle,
  matchesRenamedDisplayTitle,
} from "./deliveryOptionMatch";

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
  phone: string;
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
 * Tarifa manual "Entrega en tienda" (SHIPPING), no Sendcloud pickupPoint.
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
