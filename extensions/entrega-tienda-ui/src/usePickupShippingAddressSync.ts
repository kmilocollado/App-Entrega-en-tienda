import {
  useShippingAddress,
  useDeliveryGroups,
  useApplyAttributeChange,
  useAppMetafields,
  useApplyShippingAddressChange,
  useInstructions,
  useStorage,
} from "@shopify/ui-extensions-react/checkout";
import type { ShippingAddress } from "@shopify/ui-extensions/checkout";
import { useLayoutEffect } from "react";
import {
  matchesPickupDeliveryTitle,
  normalize,
  type StoreAddress,
} from "./config";
import { parseEntregaConfigFromAppMetafields } from "./shopMetafieldEntrega";

type ShippingPatch = Partial<{
  firstName: string | undefined;
  lastName: string | undefined;
  name: string | undefined;
  company: string | undefined;
  address1: string | undefined;
  address2: string | undefined;
  city: string | undefined;
  countryCode: string | undefined;
  provinceCode: string | undefined;
  zip: string | undefined;
  phone: string | undefined;
}>;

type OriginalShippingJson = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

type AddrLike =
  | {
      address1?: string;
      zip?: string;
      city?: string;
      provinceCode?: string;
      countryCode?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      address2?: string;
      phone?: string;
    }
  | undefined
  | null;

function mirroredAttrKey(primaryKey: string): string {
  return primaryKey.startsWith("_")
    ? `entrega_tienda_${primaryKey.slice(1)}`
    : `entrega_tienda_${primaryKey}`;
}

const STORAGE_ORIGINAL_SHIPPING_KEY = "entrega_tienda_original_shipping_v1";

const PICKUP_TRACKING_ATTR_PRIMARY_KEYS = [
  "_pickup_selected",
  "_pickup_location_address",
  "_original_shipping_address",
  "_pickup_address_apply_ok",
  "_pickup_address_apply_detail",
] as const;

/**
 * Quita atributos de carrito/pedido sólo usados para “Entrega en tienda” / Flow,
 * para que con envío estándar no aparezcan en “Información adicional”.
 */
async function removePickupTrackingAttributes(
  applyAttr: ReturnType<typeof useApplyAttributeChange>,
  canWrite: boolean,
): Promise<void> {
  if (!canWrite) return;
  const keys = new Set<string>();
  for (const primary of PICKUP_TRACKING_ATTR_PRIMARY_KEYS) {
    keys.add(primary);
    keys.add(mirroredAttrKey(primary));
  }
  await Promise.all(
    [...keys].map(async (k) => {
      try {
        const r = await applyAttr({
          type: "removeAttribute",
          key: k,
        });
        if (
          typeof r === "object" &&
          r !== null &&
          "type" in r &&
          (r as { type: string }).type === "error"
        ) {
          return;
        }
      } catch {
        /* noop */
      }
    }),
  );
}

function addressesRoughlyEqual(
  a: Partial<{ zip?: string | null; city?: string | null }>,
  b: Partial<{ zip?: string; city?: string }>,
): boolean {
  if (!a.zip || !b.zip) return false;
  return (
    normalize(String(a.zip)) === normalize(String(b.zip)) &&
    normalize(String(a.city ?? "")) === normalize(String(b.city ?? ""))
  );
}

function hasRestorableOriginal(
  value: unknown,
): value is OriginalShippingJson {
  if (!value || typeof value !== "object") return false;
  const o = value as OriginalShippingJson;
  return !!(
    (typeof o.address1 === "string" && o.address1.trim()) ||
    ((typeof o.city === "string" && o.city.trim()) &&
      (typeof o.zip === "string" && o.zip.trim()))
  );
}

function shouldPersistOriginal(
  address: AddrLike,
  savedOriginal: OriginalShippingJson | null,
  store: StoreAddress,
): boolean {
  if (hasRestorableOriginal(savedOriginal)) return false;
  if (!address?.address1?.trim()) return false;
  if (addressesRoughlyEqual(address, store)) return false;
  return true;
}

function storeCountryCode(s: StoreAddress): string | undefined {
  const ccRaw =
    typeof s.country_code === "string"
      ? s.country_code.trim()
      : "";
  if (ccRaw.length === 2) return ccRaw.toUpperCase();
  const c = typeof s.country === "string" ? s.country.trim() : "";
  if (c.length === 2) return c.toUpperCase();
  const lc = normalize(c);
  const lowerKeep = typeof s.country === "string" ? s.country.trim().toLowerCase() : "";
  if (lc === "spain" || lc === "espana" || lowerKeep === "españa")
    return "ES";
  return undefined;
}

function storeAddressToCheckoutPatch(
  s: StoreAddress,
  buyer?: AddrLike,
): ShippingPatch | null {
  const cc = storeCountryCode(s);
  const line1 = emptyToUndef(s.address1);
  if (!cc || !line1) return null;

  const phone = emptyToUndef(s.phone) ?? emptyToUndef(buyer?.phone);

  // No enviamos provinceCode: el checkout deja la provincia que el comprador ya tenía.
  // No enviamos firstName/lastName/name: el pedido debe seguir identificando al cliente.
  return {
    company: emptyToUndef(s.company) ?? "Tienda VIDAL & VIDAL",
    address1: line1,
    address2: emptyToUndef(s.address2) ?? "",
    city: emptyToUndef(s.city),
    zip: emptyToUndef(s.zip),
    phone,
    countryCode: cc,
  };
}

function checkoutAddressMatchesStore(
  addr: AddrLike,
  store: StoreAddress,
): boolean {
  const patch = storeAddressToCheckoutPatch(store, addr);
  if (!patch) return true;
  return (
    normalize(String(addr?.address1 ?? "")) ===
      normalize(String(patch.address1 ?? "")) &&
    normalize(String(addr?.zip ?? "")) ===
      normalize(String(patch.zip ?? "")) &&
    normalize(String(addr?.city ?? "")) ===
      normalize(String(patch.city ?? "")) &&
    normalize(String(addr?.company ?? "")) ===
      normalize(String(patch.company ?? ""))
  );
}

/**
 * Evita dos targets (o StrictMode) con refs distintas: una instancia creía que
 * el pickup era “nuevo” en cada cambio de `shippingAddress` y volvía a mutar la dirección.
 */
const pickupSyncSession = {
  prevIsPickup: false,
  applyAttempts: 0,
};

function savedOriginalToCheckoutPatch(o: OriginalShippingJson): ShippingPatch {
  const countryRaw =
    typeof o.country === "string" ? o.country.trim() : "";
  const countryCode =
    countryRaw.length === 2 ? countryRaw.toUpperCase() : undefined;
  const provinceRaw =
    typeof o.province === "string" ? o.province.trim() : "";
  const provinceCode = provinceRaw || undefined;
  const f = emptyToUndef(o.first_name ?? "") ?? "";
  const ln = emptyToUndef(o.last_name ?? "") ?? "";
  const name = `${f} ${ln}`.trim();

  return {
    firstName: f || undefined,
    lastName: ln || undefined,
    name: name || undefined,
    company: emptyToUndef(o.company ?? "") ?? "",
    address1: emptyToUndef(o.address1 ?? ""),
    address2: emptyToUndef(o.address2 ?? "") ?? "",
    city: emptyToUndef(o.city ?? ""),
    zip: emptyToUndef(o.zip ?? ""),
    phone: emptyToUndef(o.phone ?? ""),
    countryCode,
    provinceCode,
  };
}

function shippingAddressChangeWorked(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  return String((result as { type?: string }).type) === "success";
}

function emptyToUndef(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * Sincroniza la dirección de envío del checkout con `storeAddress` al elegir
 * “Entrega en tienda”. Debe ejecutarse en un target que siga montado al elegir
 * el método (p. ej. shipping-option-list), no sólo en delivery-address.
 * Usamos `useLayoutEffect` y paralelizamos mutaciones para minimizar la espera percibida.
 */
export function usePickupShippingAddressSync(): void {
  const shippingAddress = useShippingAddress();
  const groups = useDeliveryGroups();
  const applyAttr = useApplyAttributeChange();
  const applyShippingChange = useApplyShippingAddressChange();
  const instructions = useInstructions();
  const storage = useStorage();

  const canWriteCartAttrs =
    instructions?.attributes?.canUpdateAttributes !== false;

  const canApplyShippingAddress =
    instructions?.delivery?.canSelectCustomAddress !== false;

  const meta = useAppMetafields({
    type: "shop",
    namespace: "$app",
    key: "entrega_tienda_config",
  });
  const cfg = parseEntregaConfigFromAppMetafields(meta);

  const isPickup = Boolean(
    cfg?.enabled &&
      groups?.some((group) => {
        const selectedHandle = group.selectedDeliveryOption?.handle;
        if (!selectedHandle) return false;
        const opt = group.deliveryOptions.find(
          (o) => o.handle === selectedHandle,
        );
        return matchesPickupDeliveryTitle(opt?.title, cfg, opt);
      }),
  );

  const selectionSignature =
    groups
      ?.map((g) => `${g.selectedDeliveryOption?.handle ?? ""}`)
      .join("|") ?? "";

  useLayoutEffect(() => {
    const storeAddr = cfg?.storeAddress;

    async function sync() {
      const pickupNow = Boolean(
        isPickup && storeAddr?.address1 && cfg?.enabled,
      );
      const prev = pickupSyncSession.prevIsPickup;

      if (pickupNow) {
        if (!prev) {
          if (pickupSyncSession.applyAttempts > 12) return;

          const savedRaw = await storage.read<unknown>(
            STORAGE_ORIGINAL_SHIPPING_KEY,
          );
          const savedOriginal = hasRestorableOriginal(savedRaw)
            ? savedRaw
            : null;

          const shouldSnapOrig = shouldPersistOriginal(
            shippingAddress,
            savedOriginal,
            storeAddr!,
          );
          const originalToStore: OriginalShippingJson | null = shouldSnapOrig
            ? {
                first_name: shippingAddress?.firstName ?? "",
                last_name: shippingAddress?.lastName ?? "",
                company: shippingAddress?.company ?? "",
                address1: shippingAddress?.address1 ?? "",
                address2: shippingAddress?.address2 ?? "",
                city: shippingAddress?.city ?? "",
                province: shippingAddress?.provinceCode ?? "",
                zip: shippingAddress?.zip ?? "",
                country: shippingAddress?.countryCode ?? "",
                phone: shippingAddress?.phone ?? "",
              }
            : null;

          if (originalToStore) {
            try {
              await storage.write(STORAGE_ORIGINAL_SHIPPING_KEY, originalToStore);
            } catch {
              /* noop */
            }
          }

          const patch = storeAddressToCheckoutPatch(
            storeAddr!,
            shippingAddress,
          );
          if (!patch) {
            return;
          }

          pickupSyncSession.applyAttempts += 1;

          if (!canApplyShippingAddress) {
            return;
          }

          if (!applyShippingChange) {
            return;
          }

          try {
            const result = await applyShippingChange({
              type: "updateShippingAddress",
              address: patch as Partial<ShippingAddress>,
            });

            const ok = shippingAddressChangeWorked(result);

            if (ok) {
              pickupSyncSession.prevIsPickup = true;
              pickupSyncSession.applyAttempts = 0;
            }
          } catch {
            /* noop */
          }
        } else if (
          pickupSyncSession.prevIsPickup &&
          storeAddr &&
          !checkoutAddressMatchesStore(shippingAddress, storeAddr) &&
          pickupSyncSession.applyAttempts <= 18 &&
          canApplyShippingAddress &&
          applyShippingChange
        ) {
          const patchRetry = storeAddressToCheckoutPatch(
            storeAddr,
            shippingAddress,
          );
          if (patchRetry) {
            pickupSyncSession.applyAttempts += 1;
            try {
              const result = await applyShippingChange({
                type: "updateShippingAddress",
                address: patchRetry as Partial<ShippingAddress>,
              });
              const ok = shippingAddressChangeWorked(result);
              if (ok) pickupSyncSession.applyAttempts = 0;
            } catch {
              /* noop */
            }
          }
        }

        return;
      }

      if (!pickupNow) {
        if (prev) {
          pickupSyncSession.applyAttempts = 0;

          const savedRaw = await storage.read<unknown>(
            STORAGE_ORIGINAL_SHIPPING_KEY,
          );
          const parsed = hasRestorableOriginal(savedRaw) ? savedRaw : null;

          const canRestore =
            parsed &&
            ((parsed.address1 ?? "").trim() ||
              ((parsed.city ?? "").trim() && (parsed.zip ?? "").trim()));

          if (canRestore && canApplyShippingAddress && applyShippingChange && parsed) {
            await applyShippingChange({
              type: "updateShippingAddress",
              address: savedOriginalToCheckoutPatch(
                parsed,
              ) as Partial<ShippingAddress>,
            });
          }

          try {
            await storage.delete(STORAGE_ORIGINAL_SHIPPING_KEY);
          } catch {
            /* noop */
          }
        }

        await removePickupTrackingAttributes(applyAttr, canWriteCartAttrs);

        pickupSyncSession.prevIsPickup = false;
        pickupSyncSession.applyAttempts = 0;
      }
    }

    sync().catch(() => {});
  }, [
    isPickup,
    selectionSignature,
    shippingAddress,
    cfg,
    applyAttr,
    applyShippingChange,
    storage,
    canWriteCartAttrs,
    canApplyShippingAddress,
  ]);
}
