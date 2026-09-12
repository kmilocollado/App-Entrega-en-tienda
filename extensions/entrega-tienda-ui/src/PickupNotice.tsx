import {
  reactExtension,
  Banner,
  Text,
  useDeliveryGroups,
  useAppMetafields,
  useShippingAddress,
  useTranslate,
} from "@shopify/ui-extensions-react/checkout";
import {
  matchesPickupDeliveryTitle,
  isCustomerEligibleForEntregaTienda,
} from "./config";
import { usePickupShippingAddressSync } from "./usePickupShippingAddressSync";
import { parseEntregaConfigFromAppMetafields } from "./shopMetafieldEntrega";
import { PickupInfoBanner } from "./PickupInfoBanner";

export default reactExtension(
  "purchase.checkout.shipping-option-list.render-after",
  () => <PickupNotice />,
);

function PickupNotice() {
  /** Crítico en checkout por pasos: la sección delivery-address suele desmontarse al llegar a envío. */
  usePickupShippingAddressSync();

  const t = useTranslate();
  const groups = useDeliveryGroups();
  const shippingAddress = useShippingAddress();
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
  if (!cfg || cfg.enabled === false) return null;
  if (!isCustomerEligibleForEntregaTienda(shippingAddress, cfg)) return null;

  const isPickup = groups?.some((group) => {
    const selectedHandle = group.selectedDeliveryOption?.handle;
    if (!selectedHandle) return false;
    const opt = group.deliveryOptions.find(
      (o) => o.handle === selectedHandle,
    );
    return matchesPickupDeliveryTitle(opt?.title, cfg, opt);
  });
  if (!isPickup) return null;

  const a = cfg.storeAddress;
  if (!a?.address1) {
    return (
      <Banner status="warning">
        <Text>{t("pickup.addressNotConfigured")}</Text>
      </Banner>
    );
  }

  return <PickupInfoBanner t={t} />;
}
