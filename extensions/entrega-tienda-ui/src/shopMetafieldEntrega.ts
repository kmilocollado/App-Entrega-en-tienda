import type { AppMetafieldEntry } from "@shopify/ui-extensions/checkout";
import type { EntregaTiendaUIConfig, StoreAddress } from "./config";

const NS = "$app";
const KEY = "entrega_tienda_config";

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Une aliases que a veces se usan al editar a mano o al importar desde otros sistemas. */
export function normalizeStoreAddressShape(
  raw: unknown,
): StoreAddress | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const address1 = firstNonEmptyString([
    o.address1,
    o.address_line1,
    o.addressLine1,
    o.line1,
    o.street,
  ]);
  if (!address1) return undefined;

  const zip = firstNonEmptyString([o.zip, o.postal_code, o.postcode]) ?? "";
  const city = firstNonEmptyString([o.city, o.town]) ?? "";
  const province =
    firstNonEmptyString([o.province, o.state, o.region]) ?? "";
  const country =
    firstNonEmptyString([o.country, o.country_name]) ?? "";
  const country_code =
    firstNonEmptyString([
      o.country_code,
      o.countryCode,
      typeof o.country === "string" && o.country.length === 2
        ? o.country
        : undefined,
    ]) ?? "ES";
  /** No copiar `province` aquí: suele ser el nombre (“Madrid”) y Checkout exige el código de subdivisión (p. ej. ES → `M`). */
  const province_code = firstNonEmptyString([
    o.province_code,
    o.provinceCode,
  ]);
  const phone = firstNonEmptyString([o.phone]) ?? "";

  return {
    first_name: firstNonEmptyString([o.first_name, o.firstName]) ?? "Tienda",
    last_name: firstNonEmptyString([o.last_name, o.lastName]) ?? "",
    company:
      firstNonEmptyString([o.company, o.company_name, o.companyName]) ??
      "Tienda VIDAL & VIDAL",
    address1,
    address2: firstNonEmptyString([o.address2, o.address_line2]) ?? "",
    city,
    province,
    province_code,
    zip,
    country,
    country_code,
    phone,
  };
}

function parseJsonMaybeDouble(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  let v: unknown = raw.trim();
  if (!v) return null;
  try {
    v = JSON.parse(v as string);
    if (typeof v === "string") v = JSON.parse(v);
    return v;
  } catch {
    return null;
  }
}

/**
 * Lee `entrega_tienda_config` tal como lo expone Checkout (useAppMetafields).
 * No asume `meta[0]`: el orden del array no está garantizado.
 */
export function parseEntregaConfigFromAppMetafields(
  meta: AppMetafieldEntry[] | undefined | null,
): EntregaTiendaUIConfig | null {
  const entry = meta?.find(
    (m) =>
      m.metafield?.namespace === NS && m.metafield?.key === KEY,
  );
  const rawVal = entry?.metafield?.value;
  const parsed = parseJsonMaybeDouble(rawVal);
  if (parsed == null || typeof parsed !== "object") return null;

  const base = parsed as Partial<EntregaTiendaUIConfig> &
    Record<string, unknown>;
  const rawSa =
    base.storeAddress ??
    base.store_address ??
    base.storeaddress;
  const storeAddress = normalizeStoreAddressShape(rawSa);

  return {
    ...base,
    enabled: Boolean(base.enabled),
    displayName: String(base.displayName ?? ""),
    pickupDeliveryOptionMatchers: Array.isArray(
      base.pickupDeliveryOptionMatchers,
    )
      ? (base.pickupDeliveryOptionMatchers as string[])
      : [],
    storeAddress:
      storeAddress ?? (base.storeAddress as StoreAddress | undefined),
  } as EntregaTiendaUIConfig;
}
