import type { ZipRange } from "./geo_eligibility";

export type EntregaTiendaConfig = {
  enabled: boolean;
  matchMode: "any" | "all";
  cities: string[];
  provinces: string[];
  zipRanges: ZipRange[];
  countryCode: string;
  displayName: string;
  pickupDeliveryOptionMatchers: string[];
  hideOutsideGeo?: boolean;
  storeAddress?: {
    zip?: string;
    city?: string;
  };
  pricing?: {
    default?: number;
    rules?: Array<
      | { type: "subtotalAbove"; value: number; price: number }
      | { type: "subtotalBelow"; value: number; price: number }
    >;
  };
};

import {
  isCarrierPickupOrSendcloudTitle,
  isUnsafePickupMatcher,
  MANUAL_RATE_CANONICAL_TITLE,
  MANUAL_RATE_DISPLAY_NAME,
  normalizeTitle,
} from "./delivery_option_match";

const DEFAULT_MATCHERS = [MANUAL_RATE_DISPLAY_NAME];
const DEFAULT_DISPLAY_NAME = MANUAL_RATE_DISPLAY_NAME;

function hasUnsafePickupMatchers(matchers: string[]): boolean {
  return matchers.some((m) => isUnsafePickupMatcher(m));
}

function isUnsafeDisplayName(name: string): boolean {
  if (!name.trim()) return true;
  if (isCarrierPickupOrSendcloudTitle(name)) return true;
  return normalizeTitle(name) !== MANUAL_RATE_CANONICAL_TITLE;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asZipRanges(value: unknown): ZipRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is ZipRange =>
        r != null &&
        typeof r === "object" &&
        typeof (r as ZipRange).from === "string" &&
        typeof (r as ZipRange).to === "string",
    )
    .map((r) => ({ from: r.from, to: r.to }));
}

function asPricing(value: unknown): EntregaTiendaConfig["pricing"] | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const p = value as {
    default?: unknown;
    rules?: unknown;
  };
  const defaultPx =
    typeof p.default === "number" && Number.isFinite(p.default)
      ? p.default
      : undefined;
  const rules = Array.isArray(p.rules)
    ? p.rules.filter(
        (r): r is { type: "subtotalAbove"; value: number; price: number } =>
          r != null &&
          typeof r === "object" &&
          (r as { type?: string }).type === "subtotalAbove" &&
          typeof (r as { value?: unknown }).value === "number" &&
          typeof (r as { price?: unknown }).price === "number",
      )
    : undefined;
  if (defaultPx === undefined && !rules?.length) return undefined;
  return { default: defaultPx, rules };
}

/** Prioriza `$app`, fallback `custom`; repara matchers inseguros en runtime. */
export function resolveEntregaTiendaConfig(
  appJson: unknown,
  legacyJson?: unknown,
): EntregaTiendaConfig | null {
  const raw = (appJson ?? legacyJson) as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  let matchers = asStringArray(raw.pickupDeliveryOptionMatchers);
  if (matchers.length === 0) matchers = [...DEFAULT_MATCHERS];
  if (hasUnsafePickupMatchers(matchers)) matchers = [...DEFAULT_MATCHERS];

  const rawDisplayName =
    typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  const displayName = isUnsafeDisplayName(rawDisplayName)
    ? DEFAULT_DISPLAY_NAME
    : rawDisplayName || DEFAULT_DISPLAY_NAME;

  const matchMode =
    raw.matchMode === "all" || raw.matchMode === "any" ? raw.matchMode : "any";

  return {
    enabled: raw.enabled !== false,
    matchMode,
    cities: asStringArray(raw.cities),
    provinces: asStringArray(raw.provinces),
    zipRanges: asZipRanges(raw.zipRanges),
    countryCode:
      typeof raw.countryCode === "string" && raw.countryCode.trim()
        ? raw.countryCode.trim()
        : "ES",
    displayName,
    pickupDeliveryOptionMatchers: matchers,
    hideOutsideGeo: raw.hideOutsideGeo === true,
    storeAddress:
      raw.storeAddress != null &&
      typeof raw.storeAddress === "object" &&
      !Array.isArray(raw.storeAddress)
        ? {
            zip:
              typeof (raw.storeAddress as { zip?: unknown }).zip === "string"
                ? (raw.storeAddress as { zip: string }).zip
                : undefined,
            city:
              typeof (raw.storeAddress as { city?: unknown }).city === "string"
                ? (raw.storeAddress as { city: string }).city
                : undefined,
          }
        : undefined,
    pricing: asPricing(raw.pricing),
  };
}
