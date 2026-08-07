/** Fragmentos que identifican carriers / pickup points (Sendcloud, etc.). Nunca tocar. */
const EXCLUDE_TITLE_FRAGMENTS = [
  "punto de servicio",
  "service point",
  "sendcloud",
  "pickup point",
];

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Quita precio/plazo que Shopify añade: "Entrega en tienda · Gratis". */
export function baseShippingTitle(title: string): string {
  const parts = title.trim().split(/\s*[·•|]\s*|\s+[-–]\s+/);
  return parts[0]?.trim() ?? title.trim();
}

export function isExcludedCarrierPickupTitle(title: string): boolean {
  const base = normalizeTitle(baseShippingTitle(title));
  return EXCLUDE_TITLE_FRAGMENTS.some((frag) => base.includes(normalizeTitle(frag)));
}

/**
 * Solo la tarifa manual creada en Admin (nombre exacto o prefijo).
 * No usa `includes("recogida")` para no capturar Sendcloud u otros pickup points.
 */
export function matchesEntregaTiendaShippingRate(
  title: string | null | undefined,
  matchers: string[],
  displayName?: string | null,
): boolean {
  if (!title?.trim() || !matchers?.length) return false;
  if (isExcludedCarrierPickupTitle(title)) return false;

  const base = normalizeTitle(baseShippingTitle(title));

  if (displayName?.trim()) {
    const dn = normalizeTitle(displayName);
    if (base === dn || base.startsWith(`${dn} `) || base.startsWith(`${dn}(`)) {
      return true;
    }
  }

  for (const matcher of matchers) {
    const nm = normalizeTitle(matcher);
    if (!nm) continue;
    if (base === nm) return true;
    if (base.startsWith(`${nm} `) || base.startsWith(`${nm}(`)) return true;
  }

  return false;
}
