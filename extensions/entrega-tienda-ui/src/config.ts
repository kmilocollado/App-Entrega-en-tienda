import { matchesEntregaTiendaShippingRate } from "./deliveryOptionMatch";

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

export function isPickupOption(
  title: string | undefined | null,
  matchers: string[] | undefined,
): boolean {
  if (!matchers?.length) return false;
  return matchesEntregaTiendaShippingRate(title, matchers);
}

/**
 * Detecta la tarifa manual de entrega en tienda (no Sendcloud / pickup points).
 */
export function matchesPickupDeliveryTitle(
  title: string | undefined | null,
  cfg: PickupMatchInput,
): boolean {
  if (!title?.trim() || !cfg) return false;
  return matchesEntregaTiendaShippingRate(
    title,
    cfg.pickupDeliveryOptionMatchers ?? [],
    cfg.displayName,
  );
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
