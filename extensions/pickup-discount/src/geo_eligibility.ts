import { DeliveryMethod } from "../generated/api";

export type ZipRange = { from: string; to: string };

export type Addr = {
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  countryCode?: string | null;
};

export type GeoMatchConfig = {
  matchMode?: "any" | "all";
  cities?: string[];
  provinces?: string[];
  zipRanges?: ZipRange[];
  countryCode?: string;
};

export type PickupBranchAddressConfig = {
  zip?: string | null;
  city?: string | null;
};

type GroupLike = {
  deliveryAddress?: Addr | null;
  deliveryOptions: Array<{ deliveryMethodType: DeliveryMethod }>;
};

function groupHasShippingMethod<G extends GroupLike>(g: G): boolean {
  return g.deliveryOptions.some(
    (o) => o.deliveryMethodType === DeliveryMethod.Shipping,
  );
}

/** Solo grupos con envío a domicilio: en pickup puro `deliveryAddress` es la tienda. */
export function resolveCustomerShippingAddress<
  G extends GroupLike,
>(
  groups: ReadonlyArray<G>,
  billing?: Addr | null,
): Addr | null {
  const shippingAddrGroup = groups.find(
    (g) => groupHasShippingMethod(g) && g.deliveryAddress,
  );
  if (shippingAddrGroup?.deliveryAddress)
    return shippingAddrGroup.deliveryAddress;

  if (billing && (billing.city || billing.zip || billing.provinceCode)) {
    return billing;
  }
  return null;
}

function billingHasAny(b: Addr | null | undefined): boolean {
  return Boolean(b && (b.city || b.zip || b.provinceCode));
}

export function addressMatchesPickupBranch(
  addr: Addr,
  branch: PickupBranchAddressConfig,
): boolean {
  const zStore = branch.zip?.replace(/\D/g, "") ?? "";
  const zAddr = addr.zip?.replace(/\D/g, "") ?? "";
  if (zStore.length >= 3 && zAddr.length >= 3) {
    return zStore === zAddr;
  }
  if (branch.city && addr.city) {
    return normalize(branch.city) === normalize(addr.city);
  }
  return false;
}

export function addressesRoughlyEqual(a: Addr, b: Addr): boolean {
  const za = a.zip?.replace(/\D/g, "") ?? "";
  const zb = b.zip?.replace(/\D/g, "") ?? "";
  if (za && zb && za !== zb) return false;
  const ca = a.city ? normalize(a.city) : "";
  const cb = b.city ? normalize(b.city) : "";
  if (ca && cb && ca !== cb) return false;
  const pa = a.provinceCode ? normalize(a.provinceCode) : "";
  const pb = b.provinceCode ? normalize(b.provinceCode) : "";
  if (pa && pb && pa !== pb) return false;
  return Boolean((za && zb) || (ca && cb) || (pa && pb));
}

export function pickAddressForGeo(
  resolved: Addr | null,
  billing: Addr | null | undefined,
  storeBranch?: PickupBranchAddressConfig | null,
): Addr | null {
  const b = billing && billingHasAny(billing) ? billing : null;
  if (!resolved) return b;
  if (!b) return resolved;
  if (addressesRoughlyEqual(resolved, b)) return resolved;

  if (storeBranch?.zip && addressMatchesPickupBranch(resolved, storeBranch)) {
    if (!addressMatchesPickupBranch(b, storeBranch)) return b;
  }
  return resolved;
}

/** Para PICK_UP / pickup la dirección del grupo suele ser la tienda; usar envío del cliente. */
export function resolveAddressForGeoRule<
  G extends GroupLike,
>(
  currentGroup: G,
  method: DeliveryMethod,
  allGroups: ReadonlyArray<G>,
  billing?: Addr | null,
): Addr | null {
  const methodUsesStoreLocation =
    method === DeliveryMethod.PickUp ||
    method === DeliveryMethod.PickupPoint ||
    method === DeliveryMethod.Local ||
    method === DeliveryMethod.Retail;

  if (methodUsesStoreLocation) {
    return resolveCustomerShippingAddress(allGroups, billing);
  }

  const customerAddr = resolveCustomerShippingAddress(allGroups, billing);
  if (customerAddr) return customerAddr;

  return currentGroup.deliveryAddress ?? null;
}

export function inCountry(addr: Addr, cfg: GeoMatchConfig): boolean {
  if (!cfg.countryCode) return true;
  const want = normalize(String(cfg.countryCode));
  const have = addr.countryCode ? normalize(String(addr.countryCode)) : "";
  if (have && have === want) return true;
  if (!have && want === "es") {
    return Boolean(addr.city?.trim() || addr.zip?.trim() || addr.provinceCode?.trim());
  }
  return false;
}

export function isEligibleForGeo(addr: Addr, cfg: GeoMatchConfig): boolean {
  const checks: boolean[] = [];

  if (cfg.cities?.length && addr.city?.trim()) {
    const city = normalize(addr.city);
    checks.push(cfg.cities.some((c) => normalize(c) === city));
  }

  if (cfg.provinces?.length && addr.provinceCode?.trim()) {
    const provinceCode = normalize(addr.provinceCode);
    checks.push(
      cfg.provinces.some((p) =>
        provinceCodesMatch(p, provinceCode, addr.countryCode),
      ),
    );
  }

  if (cfg.zipRanges?.length && addr.zip?.trim()) {
    const z = addr.zip.replace(/\D/g, "");
    checks.push(
      cfg.zipRanges.some((r) => zipInNumericRange(z, r.from, r.to)),
    );
  }

  if (checks.length === 0) return false;
  return cfg.matchMode === "all"
    ? checks.every(Boolean)
    : checks.some(Boolean);
}

function provinceCodesMatch(
  cfgProvince: string,
  addrProvince: string,
  countryCode?: string | null,
): boolean {
  const n = normalize(cfgProvince);
  const p = normalize(addrProvince);
  if (n === p) return true;

  const c = countryCode ? normalize(String(countryCode)) : "";
  if (c && c !== "es") return false;

  const cfgMadrid = n === "md" || n === "m" || n === "madrid";
  const addrMadrid = p === "m" || p === "md" || p === "madrid";
  return cfgMadrid && addrMadrid;
}

function zipInNumericRange(zipDigits: string, from: string, to: string): boolean {
  const a = from.replace(/\D/g, "");
  const b = to.replace(/\D/g, "");
  if (!zipDigits || !a || !b) return false;
  if (zipDigits.length === a.length && a.length === b.length) {
    const z = parseInt(zipDigits, 10);
    return z >= parseInt(a, 10) && z <= parseInt(b, 10);
  }
  return zipDigits >= a && zipDigits <= b;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
