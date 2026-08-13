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
