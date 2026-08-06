import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { allSetupOk, type SetupStatus } from "../lib/setup.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { runEntregaTiendaSetup } = await import("../lib/setup.server");
  const status = await runEntregaTiendaSetup(admin);
  return { status };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { runEntregaTiendaSetup } = await import("../lib/setup.server");
  const status = await runEntregaTiendaSetup(admin);
  return { status };
};

function StepRow({
  label,
  step,
}: {
  label: string;
  step: SetupStatus[keyof SetupStatus];
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small">
        <s-text type={step.ok ? "strong" : undefined}>
          {step.ok ? "✓" : "✗"} {label}
        </s-text>
        <s-text color="subdued">{step.message}</s-text>
      </s-stack>
    </s-box>
  );
}

export default function Index() {
  const { status } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const currentStatus = fetcher.data?.status ?? status;
  const ready = allSetupOk(currentStatus);
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.status && allSetupOk(fetcher.data.status)) {
      shopify.toast.show("Configuración completada");
    }
  }, [fetcher.data?.status, shopify]);

  return (
    <s-page heading="Entrega en tienda">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({}, { method: "POST" })}
        {...(isLoading ? { loading: true } : {})}
      >
        Repetir configuración
      </s-button>

      <s-section heading="Estado de la instalación">
        <s-banner tone={ready ? "success" : "warning"}>
          {ready
            ? "La app está lista. Solo falta revisar envíos y ajustar la configuración de ciudad/zona si hace falta."
            : "Hay pasos pendientes. Usa el botón de abajo o reinstala la app si el problema continúa."}
        </s-banner>
        <s-stack direction="block" gap="base">
          <s-button
            variant="primary"
            onClick={() => fetcher.submit({}, { method: "POST" })}
            {...(isLoading ? { loading: true } : {})}
          >
            {ready ? "Volver a ejecutar configuración" : "Ejecutar configuración ahora"}
          </s-button>
          <s-text color="subdued">
            Al abrir esta página la configuración se ejecuta sola. Si algo falló,
            pulsa el botón para repetirla.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Recursos creados automáticamente">
        <s-stack direction="block" gap="base">
          <StepRow
            label="Definición del metacampo de tienda"
            step={currentStatus.metafieldDefinition}
          />
          <StepRow
            label="Configuración inicial (ciudad, CP, dirección tienda)"
            step={currentStatus.shopMetafield}
          />
          <StepRow
            label="Personalización de entrega"
            step={currentStatus.deliveryCustomization}
          />
          <StepRow
            label="Descuento de envío automático"
            step={currentStatus.shippingDiscount}
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Qué debe hacer el cliente">
        <s-unordered-list>
          <s-list-item>
            En <s-text type="strong">Configuración → Envío y entrega</s-text>,
            crear la tarifa manual <s-text type="strong">Entrega en tienda</s-text>{" "}
            con el precio deseado.
          </s-list-item>
          <s-list-item>
            En <s-text type="strong">Datos personalizados → Tienda</s-text>,
            editar <s-text type="strong">Entrega en tienda — configuración</s-text>{" "}
            para cambiar ciudades, códigos postales y dirección de la tienda.
          </s-list-item>
          <s-list-item>
            En <s-text type="strong">Configuración → Checkout → Personalizar</s-text>,
            añade el bloque <s-text type="strong">Entrega en tienda — UI</s-text>{" "}
            en la sección de envío (banner + cambio de dirección a tienda).
          </s-list-item>
          <s-list-item>
            Probar el checkout con una dirección de Madrid (p. ej. CP 28042) en incógnito.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
