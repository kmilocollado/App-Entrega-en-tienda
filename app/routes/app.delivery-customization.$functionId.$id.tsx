import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/**
 * Ruta enlazada desde Admin → Envío → Agregar personalización.
 * Activa la customization sin GraphQL manual.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { runEntregaTiendaSetup } = await import("../lib/setup.server");
  const status = await runEntregaTiendaSetup(admin);
  return { status };
};

export default function DeliveryCustomizationSetup() {
  const { status } = useLoaderData<typeof loader>();
  const ok = status.deliveryCustomization.ok;

  return (
    <s-page heading="Entrega en tienda">
      <s-section heading="Personalización de entrega">
        <s-banner tone={ok ? "success" : "critical"}>
          {status.deliveryCustomization.message}
        </s-banner>
        <s-paragraph>
          {ok
            ? "Ya puedes cerrar esta ventana y probar el checkout."
            : "Abre la app desde Apps → entrega-tienda y pulsa «Repetir configuración»."}
        </s-paragraph>
        <s-link href="/app">Ir al panel de configuración</s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
