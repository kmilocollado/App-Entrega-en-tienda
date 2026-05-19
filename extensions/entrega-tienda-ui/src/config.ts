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
  if (!title || !matchers?.length) return false;
  const t = normalize(title);
  return matchers.some((m) => t.includes(normalize(m)));
}

/**
 * En checkout el título suele basarse en **`displayName`** (tras Delivery Customization).
 * Shopify a veces añade precio, plazo o símbolos (`·`, `—`), así que también aceptamos
 * que el título **contenga** el `displayName` normalizado. Los matchers son opcionales
 * si `displayName` está definido.
 */
export function matchesPickupDeliveryTitle(
  title: string | undefined | null,
  cfg: PickupMatchInput,
): boolean {
  if (!title?.trim() || !cfg) return false;
  const nt = normalize(title);
  if (cfg.displayName?.trim()) {
    const dn = normalize(cfg.displayName);
    if (dn && (nt === dn || nt.includes(dn))) return true;
  }
  if (cfg.pickupDeliveryOptionMatchers?.length) {
    return isPickupOption(title, cfg.pickupDeliveryOptionMatchers);
  }
  return false;
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
