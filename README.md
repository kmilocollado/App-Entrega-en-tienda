# Entrega en tienda — Custom App de Vidal Vidal

Custom app de Shopify que añade el método **Entrega en tienda** al checkout de manera condicional (Madrid) y configurable, usando **Checkout Extensibility 2026** (delivery customization function, función de descuento de envío opcional y Checkout UI).

## Qué incluye

```
apps/entrega-tienda/
├── shopify.app.entrega-tienda.toml          Config de la app (scopes, auth, etc.)
├── package.json                             Workspaces root
└── extensions/
    ├── entrega-tienda-delivery/             Function: filtra y renombra el rate "Entrega en tienda"
    ├── pickup-discount/                     Function: descuento de envío cuando aplica ese método (subtotal, etc.)
    ├── pickup-discount-config/              Admin UI: ajustes del descuento en la ficha del descuento automático
    └── entrega-tienda-ui/                   Checkout UI: persistir dirección original del cliente
```

## Arquitectura

> **Shipping rate manual "Entrega en tienda"** (Admin → Envíos) con el **precio que quieras cobrar** + **Delivery Customization Function** (oculta el rate fuera de la zona configurada y renombra el título visible) + **Checkout UI Extension** (banner y persistencia de la dirección original como cart attribute).

Todo el comportamiento geográfico y de visibilidad va en **un metafield de tienda**:

| Metafield | Owner | Quién lo edita | Para qué |
|---|---|---|---|
| `custom.entrega_tienda_config` | Shop | Admin → Datos personalizados | Ciudad, provincias, zips, país, matchers del rate, nombre visible, dirección tienda y reglas **`pricing`** (precio por defecto / gratis por subtotal, usadas por `pickup-discount`) |

Además: el descuento automático tiene metacampos **`$app:function-configuration`** (JSON) configurables desde **Administración → Descuentos →** el descuento “Entrega en tienda — Shipping Discount” cuando la función expone UI de configuración (`pickup-discount-config`).

## Prerequisitos

- Node.js ≥ 20.10
- npm ≥ 10
- Cuenta de **Shopify Partners** y permisos de admin sobre la tienda destino
- Shopify CLI: se instala vía `npx` automáticamente, no hace falta global

## Setup paso a paso (en una tienda nueva)

Ver `docs/PRODUCTION_CHECKLIST.md` para el checklist completo paso a paso.

Resumen rápido:

### 1) Configura la tienda

1. **Settings → Shipping and delivery → General shipping rates** → en cada zona donde apliquen, crea un shipping rate manual llamado exactamente **`Entrega en tienda`** y fija ahí **el precio** (eso es lo que verá el cliente en checkout).
2. **Settings → Custom data → Shop → Add definition**:
   - Namespace and key: `custom.entrega_tienda_config`
   - Type: `JSON`
   - Una vez creada, **carga un valor** (no solo la definición). Pega el contenido de `docs/METAFIELD_EXAMPLE.json` ajustando ciudad, zips, etc.

### 2) Crea la app en Partners y vincúlala

```bash
cd apps/entrega-tienda
npm install
npx shopify app config link
```

El CLI te abrirá el navegador → elige **Create new app** o vincula a una existente. Esto rellena `client_id` y demás en `shopify.app.entrega-tienda.toml`.

### 3) Desarrollo local

```bash
npx shopify app dev
```

Pulsa **`p`** en el terminal para abrir preview de la app en tu dev store. Pulsa **`g`** para abrir GraphiQL (lo necesitas para activar la customization la primera vez).

### 4) Deploy

La primera vez que subas después de haber quitado extensiones del proyecto, el CLI debe poder **eliminar** extensiones que ya no están en el repo. Si `--allow-updates --allow-deletes` te da error o no lo acepta tu versión del CLI, usa el equivalente documentado:

```bash
npx shopify app deploy --force
```

(`-f` = permitir actualizar *y* borrar extensiones sin confirmaciones interactivas.)

O haz un deploy **sin flags** y, cuando pregunte, **acepta** quitar las extensiones que faltan en disco.

En despliegues normales suele bastar `npx shopify app deploy --allow-updates`. Acepta el release en Partners.

### 5) Activa la customization y el descuento de envío en la tienda

- **Delivery customization:** `Settings → Shipping and delivery → Customizations → Add customization` → **Entrega en tienda — Delivery Customization**.
- **Descuento de shipping:** el descuento automático **Entrega en tienda — Shipping Discount** se suele crear con GraphiQL (MUTATION 2 del script) tras el deploy la primera vez, o aparece cuando la función está disponible desde Admin según cómo cargue Shopify la app.

> Si la UI te lleva al app preview en lugar de crear recurso desde plantilla, usa GraphiQL con `scripts/setup-customizations.graphql` (QUERY + MUTATION 1 + MUTATION 2). Pulsa `g` en el terminal de `app dev`.

## Cómo edita el cliente las cosas (sin código)

| Lo que quiere cambiar | Dónde |
|---|---|
| Precio base del envío tienda vs gratis por pedido alto | **`pickup-discount`:** Admin → Descuentos → tu descuento automático shipping (bloque configuración función) **y/o** JSON `pricing` en `entrega_tienda_config`; además puede seguir marcándose tarifa manual en Envíos según uso |
| Ciudades / códigos postales / país | `Configuración → Datos personalizados → Tienda → entrega_tienda_config` |
| Activar / desactivar todo el sistema | `Configuración → Datos personalizados → Tienda` → `enabled: false` |

## Cómo se cumple cada requisito original

| Requisito | Implementación |
|---|---|
| Mostrar "Entrega en tienda" solo donde toque | `entrega-tienda-delivery` oculta el rate si la dirección no coincide con `cities`, `provinces` o `zipRanges` |
| Configurable (city / zip / province) | Shop metafield `custom.entrega_tienda_config` — sin redeploy |
| Precio / gratis condicionado por subtotal | Tarifa manual en Envíos como base **`y`** opcionalmente función **`pickup-discount`** (automático tipo app) usando `pricing` tienda + metacampos del descuento |
| Resto de zonas con envío estándar | Las zonas no elegibles simplemente no ven el rate "Entrega en tienda" — los demás rates de la zona siguen funcionando |
| No usar `checkout.liquid` | Todo es Functions + UI Extensions |

## QA — checklist mínimo

- [ ] Address Madrid + zip 28045 → aparece "Entrega en tienda" con el precio de la tarifa manual
- [ ] Address Madrid + zip 28999 → NO aparece (fuera de zipRanges, si así lo configuraste)
- [ ] Address Barcelona → NO aparece, pero sí los rates estándar
- [ ] Tras seleccionar pickup → en checkout la dirección de envío coincide con `storeAddress` del metafield; **no** se rellenan atributos `_pickup_*` en el pedido (la copia “real” del cliente solo vive en almacenamiento local de la extensión durante el checkout)

## Cambiar reglas sin redeploy

**Precio / reglas gratis** → tarifa manual en Envíos + descuento **Entrega en tienda — Shipping Discount** (bloque función) y/o campo `pricing` en `custom.entrega_tienda_config`.

**Ciudades / zips / matchers** → edita el JSON del shop metafield `custom.entrega_tienda_config` desde Admin → Datos personalizados → Tienda. Ejemplos:

- Añadir Toledo: añade `"Toledo"` a `cities` y `{"from":"45000","to":"45999"}` a `zipRanges`.
- Cambiar el nombre visible: cambia `displayName`.
- Mover de tienda: edita `storeAddress`.

Las extensiones lo leen en cada checkout — el cambio es **inmediato** (salvo caché breve del checkout).

## Limitaciones documentadas

Ver `docs/FLOW_PICKUP_ADDRESS.md` para limitaciones de la API y workarounds.

- Aunque en checkout se muestre la dirección de tienda (`applyShippingAddressChange`), el **pedido** puede seguir guardando la dirección del cliente como `shippingAddress` al usar una **tarifa de envío manual** (no Local Pickup nativo). Integraciones (p. ej. Sendcloud) leen esa dirección del pedido → hay que **reescribir la dirección de envío del pedido justo al crearse** con Flow o webhook + Admin API. Ver `docs/FLOW_PICKUP_ADDRESS.md`.
- Las Functions tienen límite de 5ms / 256KB output — el código está dentro de ese presupuesto.
- "Entrega en tienda" se implementa como shipping rate manual (no como Local Pickup nativo) para tener control fino sobre el filtrado por dirección y el renombrado dinámico.

## Estructura de extensiones — referencia rápida

```
extensions/entrega-tienda-delivery/
  shopify.extension.toml              target: cart.delivery-options.transform.run
  src/cart_delivery_options_transform_run.ts
  src/cart_delivery_options_transform_run.graphql

extensions/pickup-discount/
  shopify.extension.toml              target: purchase.shipping-discount.run

extensions/pickup-discount-config/
  shopify.extension.toml              Admin: admin.discount-details.function-settings.render

extensions/entrega-tienda-ui/
  shopify.extension.toml              targets: purchase.checkout.delivery-address.render-after,
                                               purchase.checkout.shipping-option-list.render-after
  src/PickupAddressBridge.tsx         persiste dirección original del cliente
  src/PickupNotice.tsx                muestra banner con dirección de la tienda
  src/config.ts                       tipos compartidos
  locales/es.default.json             i18n
```
# App-Entrega-en-tienda
