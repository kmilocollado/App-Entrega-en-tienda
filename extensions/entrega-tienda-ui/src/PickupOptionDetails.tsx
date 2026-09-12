import {
  reactExtension,
  Banner,
  Text,
  useAppMetafields,
  useShippingAddress,
  useTranslate,
  useInstructions,
  useShippingOptionTarget,
} from "@shopify/ui-extensions-react/checkout";
import {
  isCustomerEligibleForEntregaTienda,
  matchesPickupDeliveryTitle,
} from "./config";
import { parseEntregaConfigFromAppMetafields } from "./shopMetafieldEntrega";
import { PickupInfoBanner } from "./PickupInfoBanner";

export default reactExtension(
  "purchase.checkout.shipping-option-item.details.render",
  () => <PickupOptionDetails />,
);

function PickupOptionDetails() {
  const t = useTranslate();
  const instructions = useInstructions();
  const shippingAddress = useShippingAddress();
  const { shippingOptionTarget, isTargetSelected } = useShippingOptionTarget();
  const canPatchShippingAddress =
    instructions?.delivery?.canSelectCustomAddress !== false;

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

  const opt = {
    title: shippingOptionTarget.title,
    type: shippingOptionTarget.type,
  };

  if (!matchesPickupDeliveryTitle(opt.title, cfg, opt)) return null;
  if (!isCustomerEligibleForEntregaTienda(shippingAddress, cfg)) return null;

  const a = cfg.storeAddress;
  if (!a?.address1) {
    return (
      <Banner status="warning">
        <Text>{t("pickup.addressNotConfigured")}</Text>
      </Banner>
    );
  }

  if (!isTargetSelected) return null;

  if (!canPatchShippingAddress) {
    return (
      <Banner status="warning" title={t("pickup.title")}>
        <Text>{t("pickup.cannotPatchShippingAddress")}</Text>
      </Banner>
    );
  }

  return <PickupInfoBanner t={t} />;
}
