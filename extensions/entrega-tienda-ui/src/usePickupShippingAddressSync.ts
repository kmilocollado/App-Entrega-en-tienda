import {
  useDeliveryGroups,
  useApplyAttributeChange,
  useAppMetafields,
  useInstructions,
} from "@shopify/ui-extensions-react/checkout";
import { useLayoutEffect } from "react";
import { matchesPickupDeliveryTitle } from "./config";
import { parseEntregaConfigFromAppMetafields } from "./shopMetafieldEntrega";

function mirroredAttrKey(primaryKey: string): string {
  return primaryKey.startsWith("_")
    ? `entrega_tienda_${primaryKey.slice(1)}`
    : `entrega_tienda_${primaryKey}`;
}

/**
 * Claves de una versión anterior que sí escribía atributos de carrito al
 * elegir "Entrega en tienda". Ya no se generan, pero un carrito abierto
 * antes de este cambio puede seguir teniéndolas; se limpian por si acaso.
 */
const LEGACY_PICKUP_TRACKING_ATTR_PRIMARY_KEYS = [
  "_pickup_selected",
  "_pickup_location_address",
  "_original_shipping_address",
  "_pickup_address_apply_ok",
  "_pickup_address_apply_detail",
] as const;

async function removeLegacyPickupTrackingAttributes(
  applyAttr: ReturnType<typeof useApplyAttributeChange>,
  canWrite: boolean,
): Promise<void> {
  if (!canWrite) return;
  const keys = new Set<string>();
  for (const primary of LEGACY_PICKUP_TRACKING_ATTR_PRIMARY_KEYS) {
    keys.add(primary);
    keys.add(mirroredAttrKey(primary));
  }
  await Promise.all(
    [...keys].map(async (k) => {
      try {
        await applyAttr({ type: "removeAttribute", key: k });
      } catch {
        /* noop */
      }
    }),
  );
}

/**
 * La dirección de envío de la tienda ya NO se aplica en vivo durante el
 * checkout: hacerlo (updateShippingAddress) obliga a Shopify a recalcular
 * tarifas de envío contra todos los transportistas de nuevo, lo que causaba
 * 8-12s de recarga al elegir "Entrega en tienda" en móvil.
 *
 * La dirección de la tienda se escribe en el pedido después de crearlo,
 * vía el webhook `orders/create` (ver app/routes/webhooks.orders.create.tsx),
 * que no bloquea al comprador. Aquí solo queda una limpieza defensiva de
 * atributos de una versión anterior de esta extensión.
 */
export function usePickupShippingAddressSync(): void {
  const groups = useDeliveryGroups();
  const applyAttr = useApplyAttributeChange();
  const instructions = useInstructions();
  const canWriteCartAttrs =
    instructions?.attributes?.canUpdateAttributes !== false;

  const metaApp = useAppMetafields({
    type: "shop",
    namespace: "$app",
    key: "entrega_tienda_config",
  });
  const metaLegacy = useAppMetafields({
    type: "shop",
    namespace: "custom",
    key: "entrega_tienda_config",
  });
  const cfg = parseEntregaConfigFromAppMetafields([
    ...(metaApp ?? []),
    ...(metaLegacy ?? []),
  ]);

  const isPickup = Boolean(
    cfg &&
      cfg.enabled !== false &&
      groups?.some((group) => {
        const selectedHandle = group.selectedDeliveryOption?.handle;
        if (!selectedHandle) return false;
        const opt = group.deliveryOptions.find(
          (o) => o.handle === selectedHandle,
        );
        return matchesPickupDeliveryTitle(opt?.title, cfg, opt);
      }),
  );

  useLayoutEffect(() => {
    if (isPickup) return;
    removeLegacyPickupTrackingAttributes(applyAttr, canWriteCartAttrs).catch(
      () => {},
    );
  }, [isPickup, applyAttr, canWriteCartAttrs]);
}
