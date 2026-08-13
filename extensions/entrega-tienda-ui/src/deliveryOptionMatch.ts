/** Tarifa manual en Admin (no Sendcloud «Entrega en V&V Fuencarral»). */
export const MANUAL_RATE_DISPLAY_NAME = "Recogida en V&V Fuencarral";

/** Sendcloud y pickup points: la UI no debe cambiar dirección ni mostrar banner. */
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

export function isUnsafePickupMatcher(matcher: string): boolean {
  return normalizeTitle(matcher) !== MANUAL_RATE_CANONICAL_TITLE;
}

export function isSafeManualRateMatcher(matcher: string): boolean {
  return normalizeTitle(matcher) === MANUAL_RATE_CANONICAL_TITLE;
}

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

/** Tras rename en checkout; solo «Recogida en V&V Fuencarral», nunca Sendcloud. */
export function matchesRenamedDisplayTitle(
  title: string | null | undefined,
  displayName: string | null | undefined,
): boolean {
  if (!title?.trim()) return false;
  if (isCarrierPickupOrSendcloudTitle(title)) return false;

  const dn = displayName?.trim()
    ? normalizeTitle(displayName)
    : MANUAL_RATE_CANONICAL_TITLE;
  if (dn !== MANUAL_RATE_CANONICAL_TITLE) {
    return false;
  }

  const base = normalizeTitle(baseShippingTitle(title));
  return matchesCanonicalManualRateTitle(base);
}
