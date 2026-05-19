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
  if (zStore.length >= 3 && zAddr.length >= 3 && zStore === zAddr) return true;
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
  return currentGroup.deliveryAddress ?? resolveCustomerShippingAddress(allGroups, billing);
}
function inCountry(addr, cfg) {
  if (!cfg.countryCode) return true;
  const want = normalize(String(cfg.countryCode));
  const have = addr.countryCode ? normalize(String(addr.countryCode)) : "";
  return Boolean(have && have === want);
}
function isEligibleForGeo(addr, cfg) {
  const checks = [];
  if (cfg.cities?.length) {
    if (!addr.city) {
      checks.push(false);
    } else {
      const city = normalize(addr.city);
      checks.push(cfg.cities.some((c) => normalize(c) === city));
    }
  }
  if (cfg.provinces?.length) {
    const provinceCode = normalize(addr.provinceCode ?? "");
    checks.push(
      cfg.provinces.some(
        (p) => provinceCodesMatch(p, provinceCode, addr.countryCode)
      )
    );
  }
  if (cfg.zipRanges?.length) {
    if (!addr.zip) {
      checks.push(false);
    } else {
      const z = addr.zip.replace(/\D/g, "");
      checks.push(
        cfg.zipRanges.some((r) => zipInNumericRange(z, r.from, r.to))
      );
    }
  }
  if (checks.length === 0) return false;
  return cfg.matchMode === "all" ? checks.every(Boolean) : checks.some(Boolean);
}
function provinceCodesMatch(cfgProvince, addrProvince, countryCode) {
  const n = normalize(cfgProvince);
  const p = normalize(addrProvince);
  if (n === p) return true;
  const c = countryCode ? normalize(String(countryCode)) : "";
  if (c !== "es") return false;
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

// extensions/entrega-tienda-delivery/src/cart_delivery_options_transform_run.ts
var NO_CHANGES = { operations: [] };
function cartDeliveryOptionsTransformRun(input) {
  const cfg = input.shop?.metafield?.jsonValue;
  if (!cfg?.enabled) return NO_CHANGES;
  const operations = [];
  const groups = input.cart.deliveryGroups;
  for (const group of groups) {
    for (const opt of group.deliveryOptions) {
      if (!isPickupOption(opt.title, cfg.pickupDeliveryOptionMatchers)) {
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
      const eligible = !!addr && inCountry(addr, cfg) && isEligibleForGeo(addr, cfg);
      if (!eligible) {
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: opt.handle }
        });
        continue;
      }
      operations.push({
        deliveryOptionRename: {
          deliveryOptionHandle: opt.handle,
          title: cfg.displayName
        }
      });
    }
  }
  return { operations };
}
function isPickupOption(title, matchers) {
  if (!title || !matchers?.length) return false;
  const t = normalize2(title);
  return matchers.some((m) => t.includes(normalize2(m)));
}
function normalize2(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// <stdin>
function cartDeliveryOptionsTransformRun2() {
  return run_default(cartDeliveryOptionsTransformRun);
}
export {
  cartDeliveryOptionsTransformRun2 as cartDeliveryOptionsTransformRun
};
