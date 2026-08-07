/** Fragmentos que identifican carriers / pickup points (Sendcloud, etc.). */
const EXCLUDE_TITLE_FRAGMENTS = [
  "punto de servicio",
  "service point",
  "sendcloud",
  "pickup point",
  "pickuppoint",
];

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function baseShippingTitle(title: string): string {
  const parts = title.trim().split(/\s*[·•|]\s*|\s+[-–]\s+/);
  return parts[0]?.trim() ?? title.trim();
}

export function isExcludedCarrierPickupTitle(title: string): boolean {
  const base = normalizeTitle(baseShippingTitle(title));
  return EXCLUDE_TITLE_FRAGMENTS.some((frag) => base.includes(normalizeTitle(frag)));
}

/**
 * Solo la tarifa manual original en Admin (ej. "Entrega en tienda").
 * No usa displayName: evita colisión con Sendcloud u otros títulos "Recogida…".
 */
export function matchesOriginalShippingRateTitle(
  title: string | null | undefined,
  matchers: string[],
): boolean {
  if (!title?.trim() || !matchers?.length) return false;
  if (isExcludedCarrierPickupTitle(title)) return false;

  const base = normalizeTitle(baseShippingTitle(title));

  for (const matcher of matchers) {
    const nm = normalizeTitle(matcher);
    if (!nm) continue;
    if (base === nm) return true;
    if (base.startsWith(`${nm} `) || base.startsWith(`${nm}(`)) return true;
  }

  return false;
}
