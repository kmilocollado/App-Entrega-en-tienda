# Checklist de despliegue a producción

Pasos exactos para llevar la app **Entrega en tienda** a la tienda real del cliente. Cada paso indica si lo haces tú (developer) o el cliente (merchant).

## Antes de empezar

- [ ] Tener la app subida a Partners (Shopify Partners → Apps → entrega-tienda).
- [ ] Tener acceso de admin (collaborator account) a la tienda real del cliente.
- [ ] Saber: ciudad/provincias donde aplica, rangos de códigos postales, dirección física de la tienda, precio que quieren cobrar por la tarifa manual "Entrega en tienda".

---

## 1. Release de la app en Partners (developer)

Si acabas de cambiar el conjunto de extensiones (añadir o quitar `pickup-discount`, etc.), el deploy debe permitir actualizaciones correctas en Partners. Desde `apps/entrega-tienda`:

```bash
npx shopify app deploy --force
```

(`--force` equivale a permitir actualizaciones y eliminaciones sin confirmación; si tu CLI se queja con `--allow-updates --allow-deletes`, suele funcionar igual.)

Si prefieres el flujo guiado:

```bash
npx shopify app deploy
```

y acepta en los prompts borrar las extensiones que ya no existen localmente.

En despliegues posteriores suele bastar:

```bash
npx shopify app deploy --allow-updates
```

Cuando termine, en Partners:

1. Ve a tu app → **Versions** (o **Distribution** → **App versions**).
2. La nueva versión aparece como **Draft**. Pulsa **Release**.
3. Espera que el estado cambie a `Active`.

> Si la tienda real ya tiene instalada una versión anterior, esto la actualizará automáticamente.

---

## 2. Instalar la app en la tienda real (cliente o developer)

Desde Partners → **Apps** → `entrega-tienda` → **Distribution** → copia el **install link** (es un URL del tipo `https://partners.shopify.com/.../apps/.../install`).

Pásalo al cliente o úsalo tú directamente con la sesión del cliente. Al abrirlo:

1. Login en la tienda real.
2. Shopify pide aceptar permisos (`read_locations`, `write_delivery_customizations`, `write_discounts`, etc.). Acepta.
3. La app queda instalada. Aparece en `Apps → entrega-tienda`.

> Verás "Find this app in the pages where you work" — es el comportamiento esperado mientras no añadamos la app embebida (Fase 2).

---

## 3. Crear el shipping rate manual (cliente)

`Configuración → Envío y entrega → General shipping rates`.

En cada zona donde quieras ofrecer pickup (típicamente "Spain" / "España"):

1. **Add rate** → **Set up your own rates**.
2. **Rate name**: `Entrega en tienda` (escrito así, con esa capitalización).
3. **Price**: el importe real que cobrarás (ej. `4.99 €`). Ese es el precio que verá el cliente en checkout.
4. Sin condiciones de peso/precio. Guardar.

> El nombre `Entrega en tienda` es lo que la function busca para filtrarlo. Si lo escribes diferente (`recogida`, `pickup`), añade ese texto a `pickupDeliveryOptionMatchers` en el shop metafield (paso 4).

---

## 4. Cargar el shop metafield (developer)

Esto define **dónde aplica** "Entrega en tienda" (ciudad, zips, etc.).

`Configuración → Datos personalizados → Tienda`.

1. Si no existe la definición `custom.entrega_tienda_config`, créala:
   - **Add definition**.
   - Namespace and key: `custom.entrega_tienda_config`.
   - Type: `JSON`.
   - Access: `Storefront and admin` (esto permite que las functions y extensions lo lean).
   - Save.

2. Una vez creada la definición, **carga el valor** (esto es lo que la function lee). Tienes 2 caminos:

### Opción 4A — Desde Admin

En la pantalla de la definición, busca el botón **Edit value** o la sección "Shop metafields" donde puedes pegar el JSON. Pega el contenido de `docs/METAFIELD_EXAMPLE.json` y ajusta:

- `cities`: ciudades exactas (sensible a tildes).
- `provinces`: códigos de provincia ISO (`MD` = Madrid).
- `zipRanges`: rangos numéricos.
- `pricing` (opcional): `default` en moneda mayor y reglas tipo `subtotalAbove` para bajar el envío tipo tienda cuando el cliente elige ese método (`pickup-discount`).

### Opción 4B — Desde GraphiQL (más fiable)

Pulsa `g` en el terminal de `npx shopify app dev` (la primera vez tienes que correrlo conectado a la tienda real).

Ejecuta lo que está en `scripts/setup-customizations.graphql` bajo "**METAFIELD — Cargar el valor del metafield del shop**".

Verifica con:

```graphql
{
  shop {
    metafield(namespace: "custom", key: "entrega_tienda_config") {
      jsonValue
    }
  }
}
```

Tiene que devolver el JSON, no `null`.

---

## 5. Activar la Delivery Customization (developer)

`Configuración → Envío y entrega → Personalizaciones de entrega`.

1. **Agregar personalización de entrega** → elige `Entrega en tienda — Delivery Customization`.
2. Guardar.

> Si te lleva al app preview en lugar de crear la customization (porque la app es non-embedded), usa GraphiQL:
>
> Pulsa `g` en el terminal y ejecuta la **MUTATION 1** de `scripts/setup-customizations.graphql`. Antes ejecuta la **QUERY 1** para obtener el ID de la function.

Verifica que aparece en la lista de Customizations con estado **Active**.

---

## 6. Activar el descuento automático de envío (developer)

Para que aplique **`Entrega en tienda — Shipping Discount`** (`purchase.shipping-discount.run`):

1. Pulsa **`g`** en el terminal donde corre la app contra la tienda y ejecuta la **QUERY 1** de `scripts/setup-customizations.graphql`.
2. Copia el `id` de la función cuyo título coincida con **Entrega en tienda — Shipping Discount**.
3. Pégalo en la **MUTATION 2** (`<FUNCTION_ID_DISCOUNT>`) y ejecútala. Ajusta `startsAt` si Shopify lo exige.
4. En **Descuentos**, abre el descuento creado y revisa el bloque de **configuración de la función** (extensión `pickup-discount-config`) para precio base / umbral gratis, si no te basta con el JSON `pricing` del shop metafield.

Si no quieres descuento dinámico, puedes **desactivar o eliminar** ese descuento automático y dejar solo la tarifa manual del paso 3.

---

## 7. QA en checkout (developer)

Abre la storefront real **en una ventana de incógnito** (las customizations cachean por sesión).

| Caso | Resultado esperado |
|---|---|
| Producto + dirección Madrid 28045 | "Entrega en tienda" visible; el importe final refleja tarifa manual **y** las reglas del descuento función / `pricing` en metafield si los activaste |
| Producto + dirección Barcelona 08001 | "Entrega en tienda" NO aparece. Sí el rate estándar de la zona |
| Producto + dirección Toledo 45001 (sin estar en config) | "Entrega en tienda" NO aparece |

Después de seleccionar "Entrega en tienda" y completar el pedido (modo test):

- En el checkout, la dirección de envío debía mostrar la tienda (`storeAddress`). En el pedido del Admin, **no** esperes atributos `_pickup_*`: la extensión ya no los escribe. Si integraciones necesitan la dirección de tienda en el **objeto Order**, sigue usando Flow + `orderUpdate` como en `docs/FLOW_PICKUP_ADDRESS.md` (disparador por título del envío, no por atributos).

---

## 8. Verificación final (cliente)

Repite con el cliente al lado el flujo del paso 7. Cuando confirme que ve lo correcto, está en producción.

---

## Cambios futuros que no requieren redeploy

| Quiere cambiar | Dónde |
|---|---|
| El precio del envío en tienda / gratis por subtotal | Tarifa manual + descuento automático **Shipping Discount** (bloque función y/o `pricing` en metafield tienda) |
| Añadir Toledo como ciudad | metafield `custom.entrega_tienda_config` → `cities` y `zipRanges` |
| Renombrar el método visible | metafield → `displayName` |
| Cambiar la dirección de la tienda física (afecta al banner del checkout) | metafield → `storeAddress` |

Las funciones leen en cada checkout, los cambios son inmediatos.

---

## Cambios que sí requieren redeploy

- Cambiar el código de las functions (lógica de filtrado).
- Cambiar el target de alguna extension.

```bash
npx shopify app deploy --allow-updates
```

Y luego release en Partners.

---

## Troubleshooting

**Sale el rate "Entrega en tienda" en una dirección donde no debería.**

1. Verifica el shop metafield: `{ shop { metafield(namespace: "custom", key: "entrega_tienda_config") { jsonValue } } }` en GraphiQL. ¿Devuelve algo? ¿Está `enabled: true`?
2. Verifica que la Delivery Customization está **Active** en Settings → Shipping → Customizations.
3. Logs de la function: `npx shopify app logs` con el checkout abierto. Busca `cart.delivery-options.transform.run`.

**No sale el rate "Entrega en tienda" en Madrid.**

1. Verifica que existe el rate manual con ese nombre exacto en Settings → Shipping → General shipping rates → zona España.
2. Verifica que la dirección de prueba realmente cae en los `cities`/`zipRanges` configurados (sensible a tildes y mayúsculas en `cities`).

**El precio no coincide con lo esperado.**

1. Revisa la tarifa manual **Entrega en tienda** en Envíos: el cliente ve ese importe en checkout (salvo otros descuentos genéricos de la tienda).
2. Verifica que el shop metafield tiene el matcher correcto: `pickupDeliveryOptionMatchers` incluye un texto que coincida con el título real del método (sin tildes en la comparación interna).
