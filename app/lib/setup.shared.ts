export type SetupStepResult = {
  ok: boolean;
  message: string;
};

export type SetupStatus = {
  deliveryCustomization: SetupStepResult;
  shippingDiscount: SetupStepResult;
  metafieldDefinition: SetupStepResult;
  shopMetafield: SetupStepResult;
};

export function allSetupOk(status: SetupStatus): boolean {
  return (
    status.metafieldDefinition.ok &&
    status.shopMetafield.ok &&
    status.deliveryCustomization.ok &&
    status.shippingDiscount.ok
  );
}
