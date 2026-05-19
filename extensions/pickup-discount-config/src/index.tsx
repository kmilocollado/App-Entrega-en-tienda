import "@shopify/ui-extensions/preact";
import { useSignal } from "@preact/signals";
import { render } from "preact";

const NAMESPACE = "$app";
const KEY = "function-configuration";

type Config = {
  enabled: boolean;
  defaultPrice: number;
  /** Si es false o falta tras guardar nuevo, NO se usa subtotal gratis (solo `freeOverSubtotal` + número no basta). */
  freeShippingThresholdEnabled: boolean;
  freeOverSubtotal: number | null;
};

const DEFAULT_CONFIG: Config = {
  enabled: true,
  defaultPrice: 4.99,
  freeShippingThresholdEnabled: false,
  freeOverSubtotal: null,
};

function readInitialConfig(): Config {
  const mfs = shopify.data.metafields ?? [];
  const raw =
    mfs.find((m) => m.namespace === NAMESPACE && m.key === KEY)?.value ??
    mfs.find((m) => m.key === KEY)?.value;

  if (!raw) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    const rawPrice = parsed.defaultPrice as unknown;
    let defaultPriceLoaded = DEFAULT_CONFIG.defaultPrice;
    if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0) {
      defaultPriceLoaded = rawPrice;
    } else if (typeof rawPrice === "string") {
      const p = Number.parseFloat(rawPrice.replace(",", ".").trim());
      if (Number.isFinite(p) && p > 0) defaultPriceLoaded = p;
    }

    const ext = parsed as Partial<Config> & { freeShippingThresholdEnabled?: unknown };
    let thresholdEnabled = DEFAULT_CONFIG.freeShippingThresholdEnabled;
    let freeLoaded: number | null = null;

    if (typeof ext.freeShippingThresholdEnabled === "boolean") {
      thresholdEnabled = ext.freeShippingThresholdEnabled;
      if (thresholdEnabled) {
        if (
          typeof ext.freeOverSubtotal === "number" &&
          Number.isFinite(ext.freeOverSubtotal) &&
          ext.freeOverSubtotal > 0
        ) {
          freeLoaded = ext.freeOverSubtotal;
        }
      }
    } else {
      /** Legado sin bandera explícita: antes el umbral parecía “activo” aun sin clave porque se usaba 100 por defecto. */
      if (ext.freeOverSubtotal === null) {
        thresholdEnabled = false;
        freeLoaded = null;
      } else if (
        typeof ext.freeOverSubtotal === "number" &&
        Number.isFinite(ext.freeOverSubtotal) &&
        ext.freeOverSubtotal > 0
      ) {
        thresholdEnabled = true;
        freeLoaded = ext.freeOverSubtotal;
      }
    }

    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      defaultPrice: defaultPriceLoaded,
      freeShippingThresholdEnabled: thresholdEnabled,
      freeOverSubtotal: freeLoaded,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Evita guardar 0 por campo vacío/borrado: en la function 0 € = 100% dto. = siempre gratis. */
function parseDefaultPriceFromField(raw: string): number {
  const n = Number.parseFloat(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CONFIG.defaultPrice;
  return n;
}

function Extension() {
  const initial = readInitialConfig();

  /** Signals: el host llamó a setSignals desde @shopify/ui-extensions/preact; useState suele fallar para marcar dirty en la save bar */
  const enabled = useSignal(initial.enabled);
  const defaultPrice = useSignal(initial.defaultPrice.toString());
  const freeShippingEnabled = useSignal(initial.freeShippingThresholdEnabled);
  const freeOverSubtotal = useSignal(
    initial.freeOverSubtotal != null
      ? String(initial.freeOverSubtotal)
      : "100",
  );

  async function handleSubmit() {
    const thresholdRaw = Number.parseFloat(
      freeOverSubtotal.value.replace(",", ".").trim(),
    );
    const freeOverSubtotalValue =
      freeShippingEnabled.value &&
      Number.isFinite(thresholdRaw) &&
      thresholdRaw > 0
        ? thresholdRaw
        : null;

    const payload: Config = {
      enabled: enabled.value,
      defaultPrice: parseDefaultPriceFromField(defaultPrice.value),
      freeShippingThresholdEnabled: freeOverSubtotalValue !== null,
      freeOverSubtotal: freeOverSubtotalValue,
    };

    await shopify.applyMetafieldChange({
      type: "updateMetafield",
      namespace: NAMESPACE,
      key: KEY,
      value: JSON.stringify(payload),
      valueType: "json",
    });
  }

  function handleReset() {
    enabled.value = initial.enabled;
    defaultPrice.value = initial.defaultPrice.toString();
    freeShippingEnabled.value = initial.freeShippingThresholdEnabled;
    freeOverSubtotal.value =
      initial.freeOverSubtotal != null
        ? String(initial.freeOverSubtotal)
        : "100";
  }

  return (
    <s-function-settings
      onSubmit={(e: { waitUntil: (p: Promise<unknown>) => void }) =>
        e.waitUntil(handleSubmit())
      }
      onReset={handleReset}
    >
      <s-stack gap="base">
        <s-banner tone="info">
          Estos valores se aplican al método &quot;Entrega en tienda&quot; en el
          checkout.
        </s-banner>

        <s-checkbox
          name="enabled"
          label="Aplicar este descuento al método Entrega en tienda"
          details="Si lo desactivas, el método mostrará el precio del shipping rate sin descuento."
          checked={enabled}
          onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
            (enabled.value = e.currentTarget.checked)
          }
        />

        <s-number-field
          name="defaultPrice"
          label="Precio por defecto"
          details="Precio del envío cuando no aplica envío gratis."
          suffix="€"
          step={0.01}
          min={0}
          value={defaultPrice}
          onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
            (defaultPrice.value = e.currentTarget.value)
          }
          onInput={(e: Event & { currentTarget: HTMLInputElement }) =>
            (defaultPrice.value = e.currentTarget.value)
          }
        />

        <s-checkbox
          name="freeShippingEnabled"
          label="Activar envío gratis a partir de un subtotal"
          checked={freeShippingEnabled}
          onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
            (freeShippingEnabled.value = e.currentTarget.checked)
          }
        />

        {freeShippingEnabled.value ? (
          <s-number-field
            name="freeOverSubtotal"
            label="Subtotal mínimo para envío gratis"
            details="Si el subtotal del carrito supera este importe, el envío será gratuito."
            suffix="€"
            step={0.01}
            min={0}
            value={freeOverSubtotal}
            onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
              (freeOverSubtotal.value = e.currentTarget.value)
            }
            onInput={(e: Event & { currentTarget: HTMLInputElement }) =>
              (freeOverSubtotal.value = e.currentTarget.value)
            }
          />
        ) : null}

        <s-text color="subdued">
          La ciudad, los códigos postales y el país siguen configurándose en
          Configuración → Datos personalizados → Tienda → Entrega en tienda.
        </s-text>
      </s-stack>
    </s-function-settings>
  );
}

export default async () => {
  render(<Extension />, document.body);
};
