import type { AppMetafieldEntry } from "@shopify/ui-extensions/checkout";
import type { EntregaTiendaUIConfig, StoreAddress } from "./config";
import {
  isCarrierPickupOrSendcloudTitle,
  isUnsafePickupMatcher,
  MANUAL_RATE_CANONICAL_TITLE,
  MANUAL_RATE_DISPLAY_NAME,
  normalizeTitle,
} from "./deliveryOptionMatch";

const APP_NS = "$app";
const LEGACY_NS = "custom";
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

function sanitizeEntregaUiConfig(
  base: Partial<EntregaTiendaUIConfig> & Record<string, unknown>,
  storeAddress: StoreAddress | undefined,
): EntregaTiendaUIConfig {
  let matchers = Array.isArray(base.pickupDeliveryOptionMatchers)
    ? (base.pickupDeliveryOptionMatchers as string[]).filter(
        (m) => typeof m === "string",
      )
    : [];
  if (matchers.some((m) => isUnsafePickupMatcher(m))) {
    matchers = [MANUAL_RATE_DISPLAY_NAME];
  } else if (matchers.length === 0) {
    matchers = [MANUAL_RATE_DISPLAY_NAME];
  }

  const rawDisplay =
    typeof base.displayName === "string" ? base.displayName.trim() : "";
  const displayName =
    !rawDisplay ||
    isCarrierPickupOrSendcloudTitle(rawDisplay) ||
    normalizeTitle(rawDisplay) !== MANUAL_RATE_CANONICAL_TITLE
      ? MANUAL_RATE_DISPLAY_NAME
      : rawDisplay;

  return {
    ...base,
    enabled: base.enabled !== false,
    displayName,
    pickupDeliveryOptionMatchers: matchers,
    matchMode:
      base.matchMode === "all" || base.matchMode === "any"
        ? base.matchMode
        : "any",
    cities: Array.isArray(base.cities)
      ? (base.cities as string[]).filter((c) => typeof c === "string")
      : [],
    provinces: Array.isArray(base.provinces)
      ? (base.provinces as string[]).filter((p) => typeof p === "string")
      : [],
    zipRanges: Array.isArray(base.zipRanges)
      ? (base.zipRanges as Array<{ from?: string; to?: string }>)
          .filter(
            (r) =>
              r &&
              typeof r.from === "string" &&
              typeof r.to === "string",
          )
          .map((r) => ({ from: r.from!, to: r.to! }))
      : [],
    countryCode:
      typeof base.countryCode === "string" && base.countryCode.trim()
        ? base.countryCode.trim()
        : "ES",
    storeAddress:
      storeAddress ?? (base.storeAddress as StoreAddress | undefined),
  } as EntregaTiendaUIConfig;
}

function readMetafieldJson(entry: AppMetafieldEntry | undefined): unknown {
  if (!entry?.metafield) return null;
  const m = entry.metafield;
  if (m.valueType === "json_string" || m.type === "json") {
    return parseJsonMaybeDouble(m.value);
  }
  return parseJsonMaybeDouble(m.value);
}

/**
 * Lee `entrega_tienda_config` tal como lo expone Checkout (useAppMetafields).
 * Prioriza `$app`; fallback `custom` (legacy).
 */
export function parseEntregaConfigFromAppMetafields(
  meta: AppMetafieldEntry[] | undefined | null,
): EntregaTiendaUIConfig | null {
  const entries = meta?.filter((m) => m.metafield?.key === KEY) ?? [];
  const appEntry = entries.find((m) => m.metafield?.namespace === APP_NS);
  const legacyEntry = entries.find((m) => m.metafield?.namespace === LEGACY_NS);
  const entry = appEntry ?? legacyEntry ?? entries[0];
  const parsed = readMetafieldJson(entry);
  if (parsed == null || typeof parsed !== "object") return null;

  const base = parsed as Partial<EntregaTiendaUIConfig> &
    Record<string, unknown>;
  const rawSa =
    base.storeAddress ??
    base.store_address ??
    base.storeaddress;
  const storeAddress = normalizeStoreAddressShape(rawSa);
  const resolvedStore =
    storeAddress ?? (base.storeAddress as StoreAddress | undefined);
  const storeWithoutPhone = resolvedStore
    ? ({ ...resolvedStore, phone: undefined } as StoreAddress)
    : undefined;
  if (storeWithoutPhone && "phone" in storeWithoutPhone) {
    delete (storeWithoutPhone as { phone?: string }).phone;
  }

  return sanitizeEntregaUiConfig(base, storeWithoutPhone);
}
