import type { RunInput, FunctionRunResult } from "../generated/api";
import { DeliveryMethod } from "../generated/api";
import type { GeoMatchConfig, ZipRange } from "./geo_eligibility";
import {
  inCountry,
  isEligibleForGeo,
  pickAddressForGeo,
  resolveCustomerShippingAddress,
} from "./geo_eligibility";
import { matchesEntregaTiendaShippingRate } from "./delivery_option_match";

/** Si no hay precio válido ni en descuento ni en JSON tienda. */
const DEFAULT_DISCOUNT_PRICE = 4.99;

type DiscountConfig = {
  enabled?: boolean;
  defaultPrice?: number | string;
  freeOverSubtotal?: number | string | null;
  freeShippingThresholdEnabled?: boolean;
};

type ShopConfig = {
  enabled?: boolean;
  displayName?: string;
  pickupDeliveryOptionMatchers?: string[];
  matchMode?: "any" | "all";
  cities?: string[];
  provinces?: string[];
  zipRanges?: ZipRange[];
  countryCode?: string;
  storeAddress?: {
    zip?: string;
    city?: string;
  };
  pricing?: {
    default?: number;
    rules?: Array<
      | { type: "subtotalAbove"; value: number; price: number }
      | { type: "subtotalBelow"; value: number; price: number }
    >;
  };
};

const EMPTY: FunctionRunResult = { discounts: [] };

export function run(input: RunInput): FunctionRunResult {
  const shopCfg = input.shop?.metafield?.jsonValue as ShopConfig | undefined;

  const matchers = shopCfg?.pickupDeliveryOptionMatchers ?? [];
  if (matchers.length === 0) return EMPTY;

  if (shopCfg && shopHasGeoRules(shopCfg)) {
    const geoCfg = shopCfg as ShopConfig & GeoMatchConfig;
    const rawAddr = resolveCustomerShippingAddress(
      input.cart.deliveryGroups,
      input.cart.billingAddress ?? null,
    );
    const addr = pickAddressForGeo(
      rawAddr,
      input.cart.billingAddress ?? null,
      shopCfg.storeAddress?.zip
        ? {
            zip: shopCfg.storeAddress.zip,
            city: shopCfg.storeAddress.city ?? null,
          }
        : null,
    );
    if (
      !addr ||
      !inCountry(addr, geoCfg) ||
      !isEligibleForGeo(addr, geoCfg)
    ) {
      return EMPTY;
    }
  }

  /** Falta `enabled` en JSON ⇒ se considera activo (solo `false` lo apaga todo). */
  if (shopCfg?.enabled === false) return EMPTY;

  const subtotal = parseMoneyDecimal(input.cart.cost.subtotalAmount.amount);

  const pricing = resolvePricing(input.discountNode?.metafield, shopCfg);
  if (!pricing) return EMPTY;
  if (pricing.enabled === false) return EMPTY;

  const targetPrice = computeTargetPrice(pricing, subtotal);

  const pickupOptions = input.cart.deliveryGroups.flatMap((group) =>
    group.deliveryOptions.filter(
      (opt) =>
        opt.deliveryMethodType === DeliveryMethod.Shipping &&
        matchesEntregaTiendaShippingRate(
          opt.title,
          matchers,
          shopCfg?.displayName,
        ),
    ),
  );

  if (pickupOptions.length === 0) return EMPTY;

  const discounts = pickupOptions
    .map((opt) => {
      const base = parseMoneyDecimal(opt.cost.amount);
      if (targetPrice >= base) return null;
      if (targetPrice <= 0) {
        return {
          message: "Entrega en tienda gratuita",
          targets: [{ deliveryOption: { handle: opt.handle } }],
          value: { percentage: { value: "100.0" } },
        };
      }
      const baseMinor = moneyToMinorUnits(base);
      const targetMinor = moneyToMinorUnits(targetPrice);
      if (!Number.isFinite(baseMinor) || !Number.isFinite(targetMinor)) return null;
      const offMinor = Math.max(0, baseMinor - targetMinor);
      if (offMinor <= 0) return null;
      const label = minorUnitsToDecimalString(targetMinor);
      const offAmount = minorUnitsToDecimalString(offMinor);
      return {
        message: `Entrega en tienda — ${label}€`,
        targets: [{ deliveryOption: { handle: opt.handle } }],
        value: { fixedAmount: { amount: offAmount } },
      };
    })
    .filter((d): d is NonNullable<typeof d> => d != null);

  if (discounts.length === 0) return EMPTY;

  return { discounts };
}

type ResolvedPricing = {
  enabled?: boolean;
  default: number;
  freeOver?: number;
};

/**
 * Precio efectivo:
 * 1. Metacampo del descuento `$app:function-configuration` (form Admin en Descuentos) tiene prioridad.
 * 2. Si ese metacampo no existe o viene sin `defaultPrice`, se usa `pricing.default` del JSON de tienda.
 * 3. Si la tienda está `enabled` pero sin bloque pricing, último recurso DEFAULT_DISCOUNT_PRICE.
 */
function resolvePricing(
  discountMetafield: RunInput["discountNode"] extends infer D
    ? D extends { metafield?: infer M }
      ? M | null | undefined
      : undefined
    : undefined,
  shopCfg: ShopConfig | undefined,
): ResolvedPricing | null {
  const shopPricingDefault =
    shopCfg?.pricing?.default !== undefined &&
    Number.isFinite(Number(shopCfg.pricing.default))
      ? ensurePositiveDefaultPrice(Number(shopCfg.pricing.default))
      : undefined;

  if (discountMetafield != null) {
    const dc = discountMetafield.jsonValue as DiscountConfig | undefined;
    const parsedDefault = parseNonNegativeNumber(dc?.defaultPrice);
    const defaultPx =
      parsedDefault !== undefined && parsedDefault > 0
        ? parsedDefault
        : shopPricingDefault ?? DEFAULT_DISCOUNT_PRICE;
    return {
      enabled: dc?.enabled !== false,
      default: defaultPx,
      freeOver: resolveFreeOverFromDiscountJson(dc),
    };
  }

  /** Sin metacampo en el descuento: precio desde JSON tienda o default fijo. */
  if (shopCfg && shopCfg.enabled !== false) {
    const freeRule = shopCfg.pricing?.rules?.find(
      (r) => r.type === "subtotalAbove" && r.price === 0 && r.value > 0,
    );
    return {
      enabled: true,
      default: shopPricingDefault ?? DEFAULT_DISCOUNT_PRICE,
      freeOver: freeRule?.value,
    };
  }

  return null;
}

function parseNonNegativeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.replace(",", ".").trim())
        : Number.NaN;
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

function parsePositiveNumber(value: unknown): number | undefined {
  const n = parseNonNegativeNumber(value);
  if (n === undefined || n <= 0) return undefined;
  return n;
}

function parseMoneyDecimal(amount: unknown): number {
  if (typeof amount === "number" && Number.isFinite(amount)) return amount;
  const s =
    typeof amount === "string"
      ? amount
      : amount != null
        ? String(amount)
        : "";
  const n = Number.parseFloat(s.replace(/\s/g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

function resolveFreeOverFromDiscountJson(
  dc: DiscountConfig | undefined,
): number | undefined {
  if (!dc) return undefined;
  if (dc.freeShippingThresholdEnabled !== true) return undefined;
  return parsePositiveNumber(dc.freeOverSubtotal);
}

function ensurePositiveDefaultPrice(price: number): number {
  return Number.isFinite(price) && price > 0 ? price : DEFAULT_DISCOUNT_PRICE;
}

function computeTargetPrice(
  pricing: ResolvedPricing,
  subtotal: number,
): number {
  const defaultPx = ensurePositiveDefaultPrice(pricing.default);
  if (
    typeof pricing.freeOver === "number" &&
    Number.isFinite(pricing.freeOver) &&
    pricing.freeOver > 0 &&
    Number.isFinite(subtotal) &&
    subtotal >= pricing.freeOver
  ) {
    return 0;
  }
  return defaultPx;
}

function shopHasGeoRules(cfg: ShopConfig): boolean {
  return Boolean(
    (cfg.cities?.length ?? 0) > 0 ||
      (cfg.provinces?.length ?? 0) > 0 ||
      (cfg.zipRanges?.length ?? 0) > 0,
  );
}

/** Enteros en céntimos para evitar 7.00 → 7.01 por % redondeado en checkout. */
function moneyToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100);
}

function minorUnitsToDecimalString(minor: number): string {
  return (minor / 100).toFixed(2);
}
