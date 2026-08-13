// node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/entrega-tienda-delivery/src/geo_eligibility.ts
function groupHasShippingMethod(g) {
  return g.deliveryOptions.some(
    (o) => o.deliveryMethodType === "SHIPPING" /* Shipping */
  );
}
function resolveCustomerShippingAddress(groups, billing) {
  const shippingAddrGroup = groups.find(
    (g) => groupHasShippingMethod(g) && g.deliveryAddress
  );
  if (shippingAddrGroup?.deliveryAddress)
    return shippingAddrGroup.deliveryAddress;
  if (billing && (billing.city || billing.zip || billing.provinceCode)) {
    return billing;
  }
  return null;
}
function billingHasAny(b) {
  return Boolean(b && (b.city || b.zip || b.provinceCode));
}
function addressMatchesPickupBranch(addr, branch) {
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
function addressesRoughlyEqual(a, b) {
  const za = a.zip?.replace(/\D/g, "") ?? "";
  const zb = b.zip?.replace(/\D/g, "") ?? "";
  if (za && zb && za !== zb) return false;
  const ca = a.city ? normalize(a.city) : "";
  const cb = b.city ? normalize(b.city) : "";
  if (ca && cb && ca !== cb) return false;
  const pa = a.provinceCode ? normalize(a.provinceCode) : "";
  const pb = b.provinceCode ? normalize(b.provinceCode) : "";
  if (pa && pb && pa !== pb) return false;
  return Boolean(za && zb || ca && cb || pa && pb);
}
function pickAddressForGeo(resolved, billing, storeBranch) {
  const b = billing && billingHasAny(billing) ? billing : null;
  if (!resolved) return b;
  if (!b) return resolved;
  if (addressesRoughlyEqual(resolved, b)) return resolved;
  if (storeBranch?.zip && addressMatchesPickupBranch(resolved, storeBranch)) {
    if (!addressMatchesPickupBranch(b, storeBranch)) return b;
  }
  return resolved;
}
function resolveAddressForGeoRule(currentGroup, method, allGroups, billing) {
  const methodUsesStoreLocation = method === "PICK_UP" /* PickUp */ || method === "PICKUP_POINT" /* PickupPoint */ || method === "LOCAL" /* Local */ || method === "RETAIL" /* Retail */;
  if (methodUsesStoreLocation) {
    return resolveCustomerShippingAddress(allGroups, billing);
  }
  const customerAddr = resolveCustomerShippingAddress(allGroups, billing);
  if (customerAddr) return customerAddr;
  return currentGroup.deliveryAddress ?? null;
}
function inCountry(addr, cfg) {
  if (!cfg.countryCode) return true;
  const want = normalize(String(cfg.countryCode));
  const have = addr.countryCode ? normalize(String(addr.countryCode)) : "";
  if (have && have === want) return true;
  if (!have && want === "es") {
    return Boolean(addr.city?.trim() || addr.zip?.trim() || addr.provinceCode?.trim());
  }
  return false;
}
function isEligibleForGeo(addr, cfg) {
  const checks = [];
  if (cfg.cities?.length && addr.city?.trim()) {
    const city = normalize(addr.city);
    checks.push(cfg.cities.some((c) => normalize(c) === city));
  }
  if (cfg.provinces?.length && addr.provinceCode?.trim()) {
    const provinceCode = normalize(addr.provinceCode);
    checks.push(
      cfg.provinces.some(
        (p) => provinceCodesMatch(p, provinceCode, addr.countryCode)
      )
    );
  }
  if (cfg.zipRanges?.length && addr.zip?.trim()) {
    const z = addr.zip.replace(/\D/g, "");
    checks.push(
      cfg.zipRanges.some((r) => zipInNumericRange(z, r.from, r.to))
    );
  }
  if (checks.length === 0) return false;
  return cfg.matchMode === "all" ? checks.every(Boolean) : checks.some(Boolean);
}
function provinceCodesMatch(cfgProvince, addrProvince, countryCode) {
  const n = normalize(cfgProvince);
  const p = normalize(addrProvince);
  if (n === p) return true;
  const c = countryCode ? normalize(String(countryCode)) : "";
  if (c && c !== "es") return false;
  const cfgMadrid = n === "md" || n === "m" || n === "madrid";
  const addrMadrid = p === "m" || p === "md" || p === "madrid";
  return cfgMadrid && addrMadrid;
}
function zipInNumericRange(zipDigits, from, to) {
  const a = from.replace(/\D/g, "");
  const b = to.replace(/\D/g, "");
  if (!zipDigits || !a || !b) return false;
  if (zipDigits.length === a.length && a.length === b.length) {
    const z = parseInt(zipDigits, 10);
    return z >= parseInt(a, 10) && z <= parseInt(b, 10);
  }
  return zipDigits >= a && zipDigits <= b;
}
function normalize(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// extensions/entrega-tienda-delivery/src/delivery_option_match.ts
var MANUAL_RATE_DISPLAY_NAME = "Recogida en V&V Fuencarral";
var CARRIER_PICKUP_TITLE_FRAGMENTS = [
  "punto de servicio",
  "service point",
  "sendcloud",
  "pickup point",
  "pickuppoint",
  "entrega en v&v fuencarral",
  "entrega en v&v"
];
function normalizeTitle(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
var MANUAL_RATE_CANONICAL_TITLE = normalizeTitle(
  MANUAL_RATE_DISPLAY_NAME
);
function baseShippingTitle(title) {
  const parts = title.trim().split(/\s*[·•|]\s*|\s+[-–]\s+/);
  return parts[0]?.trim() ?? title.trim();
}
function matchesCanonicalManualRateTitle(base) {
  const canonical = MANUAL_RATE_CANONICAL_TITLE;
  if (base === canonical) return true;
  return base.startsWith(`${canonical} `) || base.startsWith(`${canonical}(`);
}
function isOurManualPickupRateTitle(title) {
  if (!title?.trim()) return false;
  const base = normalizeTitle(baseShippingTitle(title));
  return matchesCanonicalManualRateTitle(base);
}
function isCarrierPickupOrSendcloudTitle(title) {
  if (isOurManualPickupRateTitle(title)) return false;
  const base = normalizeTitle(baseShippingTitle(title));
  if (!base) return false;
  return CARRIER_PICKUP_TITLE_FRAGMENTS.some(
    (frag) => base.includes(normalizeTitle(frag))
  );
}
function isUnsafePickupMatcher(matcher) {
  return normalizeTitle(matcher) !== MANUAL_RATE_CANONICAL_TITLE;
}
function isSafeManualRateMatcher(matcher) {
  return normalizeTitle(matcher) === MANUAL_RATE_CANONICAL_TITLE;
}
function matchesOriginalShippingRateTitle(title, matchers) {
  if (!title?.trim()) return false;
  if (isCarrierPickupOrSendcloudTitle(title)) return false;
  const base = normalizeTitle(baseShippingTitle(title));
  const safeMatchers = matchers.filter((m) => isSafeManualRateMatcher(m));
  if (safeMatchers.length === 0) {
    return matchesCanonicalManualRateTitle(base);
  }
  return safeMatchers.some((matcher) => {
    const nm = normalizeTitle(matcher);
    return nm === base || nm === MANUAL_RATE_CANONICAL_TITLE && matchesCanonicalManualRateTitle(base);
  });
}

// extensions/entrega-tienda-delivery/src/entrega_config.ts
var DEFAULT_MATCHERS = [MANUAL_RATE_DISPLAY_NAME];
var DEFAULT_DISPLAY_NAME = MANUAL_RATE_DISPLAY_NAME;
function hasUnsafePickupMatchers(matchers) {
  return matchers.some((m) => isUnsafePickupMatcher(m));
}
function isUnsafeDisplayName(name) {
  if (!name.trim()) return true;
  if (isCarrierPickupOrSendcloudTitle(name)) return true;
  return normalizeTitle(name) !== MANUAL_RATE_CANONICAL_TITLE;
}
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string");
}
function asZipRanges(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r) => r != null && typeof r === "object" && typeof r.from === "string" && typeof r.to === "string"
  ).map((r) => ({ from: r.from, to: r.to }));
}
function resolveEntregaTiendaConfig(appJson, legacyJson) {
  const raw = appJson ?? legacyJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let matchers = asStringArray(raw.pickupDeliveryOptionMatchers);
  if (matchers.length === 0) matchers = [...DEFAULT_MATCHERS];
  if (hasUnsafePickupMatchers(matchers)) matchers = [...DEFAULT_MATCHERS];
  const rawDisplayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  const displayName = isUnsafeDisplayName(rawDisplayName) ? DEFAULT_DISPLAY_NAME : rawDisplayName || DEFAULT_DISPLAY_NAME;
  const matchMode = raw.matchMode === "all" || raw.matchMode === "any" ? raw.matchMode : "any";
  return {
    enabled: raw.enabled !== false,
    matchMode,
    cities: asStringArray(raw.cities),
    provinces: asStringArray(raw.provinces),
    zipRanges: asZipRanges(raw.zipRanges),
    countryCode: typeof raw.countryCode === "string" && raw.countryCode.trim() ? raw.countryCode.trim() : "ES",
    displayName,
    pickupDeliveryOptionMatchers: matchers,
    hideOutsideGeo: raw.hideOutsideGeo !== false,
    storeAddress: raw.storeAddress != null && typeof raw.storeAddress === "object" && !Array.isArray(raw.storeAddress) ? {
      zip: typeof raw.storeAddress.zip === "string" ? raw.storeAddress.zip : void 0,
      city: typeof raw.storeAddress.city === "string" ? raw.storeAddress.city : void 0
    } : void 0
  };
}

// extensions/entrega-tienda-delivery/src/cart_delivery_options_transform_run.ts
var NO_CHANGES = { operations: [] };
function cartDeliveryOptionsTransformRun(input) {
  const shop = input.shop;
  const cfg = resolveEntregaTiendaConfig(
    shop?.appEntregaConfig?.jsonValue,
    shop?.legacyEntregaConfig?.jsonValue
  );
  if (!cfg || cfg.enabled === false) return NO_CHANGES;
  const operations = [];
  const groups = input.cart.deliveryGroups;
  for (const group of groups) {
    for (const opt of group.deliveryOptions) {
      if (opt.deliveryMethodType !== "SHIPPING" /* Shipping */) {
        continue;
      }
      if (isCarrierPickupOrSendcloudTitle(opt.title)) {
        continue;
      }
      if (!matchesOriginalShippingRateTitle(
        opt.title,
        cfg.pickupDeliveryOptionMatchers
      )) {
        continue;
      }
      const rawAddr = resolveAddressForGeoRule(
        group,
        opt.deliveryMethodType,
        groups,
        input.cart.billingAddress ?? null
      );
      const addr = pickAddressForGeo(
        rawAddr,
        input.cart.billingAddress ?? null,
        cfg.storeAddress?.zip ? { zip: cfg.storeAddress.zip, city: cfg.storeAddress.city ?? null } : null
      );
      const hasGeoSignal = Boolean(
        addr?.city?.trim() || addr?.zip?.trim() || addr?.provinceCode?.trim()
      );
      if (!hasGeoSignal) {
        continue;
      }
      const eligible = inCountry(addr, cfg) && isEligibleForGeo(addr, cfg);
      if (eligible) {
        operations.push({
          deliveryOptionRename: {
            deliveryOptionHandle: opt.handle,
            title: cfg.displayName
          }
        });
        continue;
      }
      if (hasGeoSignal) {
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: opt.handle }
        });
      }
    }
  }
  return { operations };
}

// <stdin>
function cartDeliveryOptionsTransformRun2() {
  return run_default(cartDeliveryOptionsTransformRun);
}
export {
  cartDeliveryOptionsTransformRun2 as cartDeliveryOptionsTransformRun
};
