import {
  Banner,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/ui-extensions-react/checkout";

type TranslateFn = (key: string) => string;

function DetailLine({
  labelKey,
  textKey,
  t,
}: {
  labelKey: string;
  textKey: string;
  t: TranslateFn;
}) {
  return (
    <InlineStack spacing="extraTight" blockAlignment="start">
      <Text appearance="subdued" size="small" emphasis="bold">
        {t(labelKey)}
      </Text>
      <Text appearance="subdued" size="small">
        {t(textKey)}
      </Text>
    </InlineStack>
  );
}

export function PickupInfoBanner({ t }: { t: TranslateFn }) {
  return (
    <Banner status="info" title={t("pickup.title")}>
      <BlockStack spacing="tight">
        <Text emphasis="bold">{t("pickup.addressBold")}</Text>
        <DetailLine
          t={t}
          labelKey="pickup.availabilityLabel"
          textKey="pickup.availabilityText"
        />
        <DetailLine
          t={t}
          labelKey="pickup.hoursLabel"
          textKey="pickup.hoursText"
        />
        <DetailLine
          t={t}
          labelKey="pickup.requirementsLabel"
          textKey="pickup.requirementsText"
        />
        <DetailLine
          t={t}
          labelKey="pickup.thirdPartyLabel"
          textKey="pickup.thirdPartyText"
        />
      </BlockStack>
    </Banner>
  );
}
