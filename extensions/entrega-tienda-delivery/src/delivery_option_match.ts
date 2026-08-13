/** Tarifa manual en Admin (no Sendcloud «Entrega en V&V Fuencarral»). */
export const MANUAL_RATE_DISPLAY_NAME = "Recogida en V&V Fuencarral";

/** Sendcloud y pickup points: nunca renombrar, ocultar ni aplicar descuento. */
const CARRIER_PICKUP_TITLE_FRAGMENTS = [
  "punto de servicio",
  "service point",
  "sendcloud",
  "pickup point",
  "pickuppoint",
  "entrega en v&v fuencarral",
  "entrega en v&v",
];

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export const MANUAL_RATE_CANONICAL_TITLE = normalizeTitle(
  MANUAL_RATE_DISPLAY_NAME,
);

export function baseShippingTitle(title: string): string {
  const parts = title.trim().split(/\s*[·•|]\s*|\s+[-–]\s+/);
  return parts[0]?.trim() ?? title.trim();
}

function matchesCanonicalManualRateTitle(base: string): boolean {
  const canonical = MANUAL_RATE_CANONICAL_TITLE;
  if (base === canonical) return true;
  return (
    base.startsWith(`${canonical} `) || base.startsWith(`${canonical}(`)
  );
}

export function isOurManualPickupRateTitle(title: string): boolean {
  if (!title?.trim()) return false;
  const base = normalizeTitle(baseShippingTitle(title));
  return matchesCanonicalManualRateTitle(base);
}

export function isCarrierPickupOrSendcloudTitle(title: string): boolean {
  if (isOurManualPickupRateTitle(title)) return false;

  const base = normalizeTitle(baseShippingTitle(title));
  if (!base) return false;
  return CARRIER_PICKUP_TITLE_FRAGMENTS.some((frag) =>
    base.includes(normalizeTitle(frag)),
  );
}

/** @deprecated Usar isCarrierPickupOrSendcloudTitle */
export function isExcludedCarrierPickupTitle(title: string): boolean {
  return isCarrierPickupOrSendcloudTitle(title);
}

export function isUnsafePickupMatcher(matcher: string): boolean {
  return normalizeTitle(matcher) !== MANUAL_RATE_CANONICAL_TITLE;
}

export function isSafeManualRateMatcher(matcher: string): boolean {
  return normalizeTitle(matcher) === MANUAL_RATE_CANONICAL_TITLE;
}

/**
 * Solo la tarifa manual «Recogida en V&V Fuencarral».
 * Nunca Sendcloud («Entrega en V&V Fuencarral», puntos de servicio, etc.).
 */
export function matchesOriginalShippingRateTitle(
  title: string | null | undefined,
  matchers: string[],
): boolean {
  if (!title?.trim()) return false;
  if (isCarrierPickupOrSendcloudTitle(title)) return false;

  const base = normalizeTitle(baseShippingTitle(title));
  const safeMatchers = matchers.filter((m) => isSafeManualRateMatcher(m));

  if (safeMatchers.length === 0) {
    return matchesCanonicalManualRateTitle(base);
  }

  return safeMatchers.some((matcher) => {
    const nm = normalizeTitle(matcher);
    return (
      nm === base ||
      (nm === MANUAL_RATE_CANONICAL_TITLE && matchesCanonicalManualRateTitle(base))
    );
  });
}
