import {
  reactExtension,
  Banner,
  BlockStack,
  Text,
  useDeliveryGroups,
  useAppMetafields,
  useTranslate,
  useInstructions,
} from "@shopify/ui-extensions-react/checkout";
import { matchesPickupDeliveryTitle } from "./config";
import { usePickupShippingAddressSync } from "./usePickupShippingAddressSync";
import { parseEntregaConfigFromAppMetafields } from "./shopMetafieldEntrega";

export default reactExtension(
  "purchase.checkout.shipping-option-list.render-after",
  () => <PickupNotice />,
);

function PickupNotice() {
  /** Crítico en checkout por pasos: la sección delivery-address suele desmontarse al llegar a envío. */
  usePickupShippingAddressSync();

  const t = useTranslate();
  const groups = useDeliveryGroups();
  const instructions = useInstructions();
  const canPatchShippingAddress =
    instructions?.delivery?.canSelectCustomAddress !== false;
  const meta = useAppMetafields({
    type: "shop",
    namespace: "custom",
    key: "entrega_tienda_config",
  });

  const cfg = parseEntregaConfigFromAppMetafields(meta);
  if (!cfg?.enabled) return null;

  const isPickup = groups?.some((group) => {
    const selectedHandle = group.selectedDeliveryOption?.handle;
    if (!selectedHandle) return false;
    const opt = group.deliveryOptions.find(
      (o) => o.handle === selectedHandle,
    );
    return matchesPickupDeliveryTitle(opt?.title, cfg);
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

  if (!canPatchShippingAddress) {
    return (
      <Banner status="warning" title={t("pickup.title")}>
        <Text>{t("pickup.cannotPatchShippingAddress")}</Text>
      </Banner>
    );
  }

  return (
    <Banner status="info" title={t("pickup.title")}>
      <BlockStack spacing="tight">
        <Text>{t("pickup.intro")}</Text>
        <Text emphasis="bold">
          {a.address1}
          {a.address2 ? `, ${a.address2}` : ""}, {a.zip} {a.city} ({a.province})
        </Text>
        <Text appearance="subdued" size="small">
          {t("pickup.subtext")}
        </Text>
      </BlockStack>
    </Banner>
  );
}
