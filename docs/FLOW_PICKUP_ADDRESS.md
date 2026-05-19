# Workaround opcional: Shopify Flow para reescribir shippingAddress

> **Solo necesario si NO usas Local Pickup nativo.**
> Local Pickup ya hace que el order use la dirección de la Location automáticamente. Si ese flujo te sirve, ignora este documento.

## Cuándo lo necesitas

Si has decidido que "Entrega en tienda" sea una *delivery rate* normal (no Local Pickup) — por ejemplo porque quieres que aparezca en tarifas de envío junto con SEUR/Correos y la function `delivery-customization` la filtra por Madrid — entonces el order resultante guardará la dirección del cliente como `shippingAddress`. Para que tu OMS y los emails de fulfillment vean la dirección de la tienda, hay que reescribirla justo después de crear el pedido.

## Setup en Shopify Flow (sin código)

1. Abre **Apps → Shopify Flow → Create workflow**.
2. **Trigger:** `Order created`.
3. **Condition (recomendada):** el método de envío del pedido indica recogida en tienda **sin depender de atributos del pedido**. En Flow suele poder expresarse como **el título de la primera línea de envío contiene** el mismo texto que `displayName` en tu `entrega_tienda_config` (p. ej. `Recogida en tienda — Madrid`). Ajusta el texto a lo que tengas en el JSON del metafield, porque la función `entrega-tienda-delivery` renombra la opción a ese `displayName`.
4. **Action:** `Run code` (Flow JavaScript) — pega lo siguiente. Flow exige una función **`export default` síncrona** (sin `async`). **Sustituye el objeto `p`** por los mismos campos que `storeAddress` en `custom.entrega_tienda_config` (deben coincidir con lo que ves en el checkout). La extensión ya **no** escribe `_pickup_location_address` en atributos.

```js
export default function main() {
  /** Copia aquí los mismos datos que storeAddress en custom.entrega_tienda_config */
  const p = {
    first_name: "Tienda",
    last_name: "Recogida",
    address1: "…",
    address2: "",
    city: "…",
    province: "M",
    province_code: "M",
    zip: "28045",
    country: "ES",
    country_code: "ES",
    phone: "",
  };

  const provinceCode =
    (typeof p.province_code === "string" && p.province_code.trim()) ||
    (typeof p.province === "string" && p.province.length === 2
      ? p.province.toUpperCase()
      : "");
  const countryCode =
    (typeof p.country_code === "string" && p.country_code.trim()) ||
    (typeof p.country === "string" && p.country.length === 2
      ? p.country.toUpperCase()
      : "ES");

  return {
    pickupAddress: {
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      company: "",
      address1: p.address1 || "",
      address2: p.address2 || "",
      city: p.city || "",
      provinceCode: provinceCode || p.province || "",
      zip: p.zip || "",
      countryCode: countryCode,
      phone: p.phone || "",
    },
  };
}
```

5. **Actualizar dirección con Admin API** (lo habitual si **no** ves la acción *Update shipping address on order*). Acción **Send Admin API request**:

   1. Tras **Run code**, **Add action** → **Send Admin API request**.
   2. **Versión de API:** la que ofrezca el desplegable (p. ej. `2025-10`, `2026-01`).

   **Cómo está el editor en Flow (importante):** esta acción **no** pide pegar un texto `mutation { ... }` largo. Suele funcionar así:

   - Campo tipo **“Mutation” / “Mutación”** o **buscador de operaciones**: escribe **`orderUpdate`** y **selecciónala** en la lista (es la mutación del Admin API, no una “consulta” de lectura).
   - Después Flow muestra un bloque **JSON / Variables / Input** con la forma que espera esa mutación (objeto `input` con `id`, `shippingAddress`, etc.).

   Si solo ves “GraphQL” y no te deja elegir mutación, revisa que la acción sea exactamente **Send Admin API request**; en algunos idiomas el titular puede confundirse con otros pasos.

   3. En el **JSON de entrada** (a veces titulado *Variables* o *Mutation input*), deja algo equivalente a:

```json
{
  "input": {
    "id": "{{ order.id }}",
    "shippingAddress": {
      "firstName": "{{ … Run code → pickupAddress.firstName … }}",
      "lastName": "{{ … }}",
      "company": "",
      "address1": "{{ … }}",
      "address2": "{{ … }}",
      "city": "{{ … }}",
      "provinceCode": "{{ … }}",
      "zip": "{{ … }}",
      "countryCode": "{{ … }}",
      "phone": "{{ … }}"
    }
  }
}
```

   Sustituye cada `{{ … }}` con **Insertar variable** (no copies Liquid a mano si tu Flow reescribe el JSON al insertar).

   **Misma dirección en facturación:** en el mismo `input` puedes añadir `billingAddress` con los mismos campos que `shippingAddress` (tokens `pickupAddress.*`). La extensión de checkout no puede forzar la facturación desde el buyer-facing UI con la API 2025-07.

   4. Ejecuta una prueba y revisa la salida del paso: si hay errores, suelen venir como respuesta de la API o como `userErrors` en el cuerpo de la respuesta.

   **Referencia** (por si tu Flow sí tiene campo de operación GraphQL libre): la mutación que ejecuta internamente `orderUpdate` es equivalente a:

```graphql
mutation ($input: OrderInput!) {
  orderUpdate(input: $input) {
    order { id }
    userErrors { field message }
  }
}
```

   — pero en la interfaz normal **solo eliges `orderUpdate`** y rellenas el JSON, no pegas esto salvo que tu pantalla lo pida explícitamente.

   **Opcional — acción “Update shipping address on order”:** si en tu tienda **sí** aparece en el buscador de acciones, puedes mapear los mismos tokens `pickupAddress.*` sin usar GraphQL.

6. Activa el workflow.

### Sendcloud y otras integraciones

Leen la dirección **del objeto Order en Shopify** en el momento en que sincronizan. Por eso hace falta el paso de Flow **en cuanto se crea el pedido** (trigger *Order created*), *antes* de que Sendcloud importe el pedido. Si Sendcloud captura el pedido demasiado rápido:

- Añade en Flow una **pequeña espera** solo si tu workflow lo permite, o
- Configura en Sendcloud el retardo / re‑sync si existe, o
- Usa en Sendcloud reglas basadas en **tags** del pedido (Flow puede etiquetar `pickup-address-rewritten` tras actualizar).

**Si la condición del paso 3 no se cumple** (el título del envío no coincide), no ejecutes `orderUpdate`: así evitas tocar pedidos de envío a domicilio.

## Limitaciones

- Si el order ya tiene `fulfillmentStatus = FULFILLED` o una etiqueta de envío comprada, `orderUpdate` falla — Flow correrá segundos después de `orders/create`, normalmente antes que cualquier fulfillment automático.
- El email de confirmación nativo se envía con la dirección **original** del cliente. Si quieres que vea la dirección de la tienda, deshabilita el email nativo en *Settings → Notifications* y envía uno custom desde Flow.
- Idempotencia: añade una condición extra `Order does NOT have tag "pickup-address-rewritten"`, y en una acción posterior añade el tag. Evitas reprocesar si Flow se reintenta.
