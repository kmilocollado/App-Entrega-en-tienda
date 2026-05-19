# Despliegue gratuito en Render — Entrega en tienda (recomendado)

Aloja la **app embebida** (OAuth + panel de setup) en el **plan Free de Render**, sin tarjeta de crédito. Las **extensiones** siguen yendo a Shopify con `shopify app deploy`.

> **Fly.io** exige método de pago aunque no cobre al inicio. Si quieres evitar eso, usa esta guía.

## Qué incluye el plan Free de Render

| | |
|---|---|
| Coste | 0 € (750 h/mes de instancia web) |
| Tarjeta | No obligatoria para el plan free |
| Inconveniente | Tras ~15 min sin uso, la app “duerme”; el primer acceso tarda ~30–60 s |
| Sesiones OAuth | SQLite en disco efímero → tras un **redeploy** el comercio puede tener que reabrir la app (el setup automático se vuelve a ejecutar) |

Para **una tienda cliente** y tráfico bajo, suele bastar.

## Resumen de componentes

| Componente | Dónde |
|---|---|
| Servidor web (React Router) | Render (Docker) |
| Functions + Checkout UI | Shopify Partners |

---

## 1. Subir el repo a GitHub

Render despliega desde Git. Asegúrate de que `apps/entrega-tienda/` está en el repositorio (con `Dockerfile`, `render.yaml`, `app/`, etc.).

---

## 2. Crear el Web Service en Render

1. [render.com](https://render.com) → **Sign up** (cuenta free).
2. **New +** → **Blueprint** (si ves `render.yaml` en el repo) **o** **Web Service** conectado al repo.
3. Si usas Blueprint, Render lee `render.yaml` de la raíz de `apps/entrega-tienda` (ajusta la **Root Directory** a `apps/entrega-tienda` si el repo es monorepo).
4. Si creas el servicio a mano:
   - **Root Directory:** `apps/entrega-tienda`
   - **Runtime:** Docker
   - **Instance type:** Free
   - **Plan:** Free

---

## 3. Variables de entorno en Render

En el dashboard → tu servicio → **Environment**:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | `file:/tmp/entrega-tienda.sqlite` |
| `SCOPES` | `read_locations,read_orders,read_shipping,write_orders,read_delivery_customizations,write_delivery_customizations,write_discounts` |
| `SHOPIFY_API_KEY` | Client ID de Partners (ej. el de `shopify.app.entrega-tienda.toml`) |
| `SHOPIFY_API_SECRET` | Client secret de Partners (**Secret**) |
| `SHOPIFY_APP_URL` | URL de Render, ej. `https://entrega-tienda.onrender.com` (sin `/` final) |

Obtén API key/secret:

```bash
cd apps/entrega-tienda
npx shopify app env show
```

---

## 4. Actualizar Shopify Partners

Cuando Render te dé la URL (ej. `https://entrega-tienda.onrender.com`), edita `shopify.app.entrega-tienda.toml`:

```toml
application_url = "https://entrega-tienda.onrender.com"

[auth]
redirect_urls = [
  "https://entrega-tienda.onrender.com/auth/callback",
  "https://entrega-tienda.onrender.com/auth/shopify/callback",
  "https://entrega-tienda.onrender.com/api/auth/callback"
]
```

Despliega la config + extensiones:

```bash
npx shopify app deploy --force
```

**Release** la versión en Partners.

---

## 5. Desplegar extensiones

```bash
cd apps/entrega-tienda
npx shopify app deploy --force
```

---

## 6. Probar en la tienda

1. Instala la app (enlace de Partners).
2. Abre **Apps → entrega-tienda** (espera el cold start si dormía).
3. Debe verse el panel verde con los 4 pasos del setup.
4. Crea la tarifa **Entrega en tienda** en Envíos.
5. Prueba checkout.

---

## Actualizar el servidor web

Push a Git → Render redeploy automático (si activaste auto-deploy).

O **Manual Deploy** en el dashboard.

---

## Otras opciones 100 % free

| Opción | Coste | Notas |
|---|---|---|
| **Render Free** (esta guía) | 0 € | Más simple; cold starts |
| **Oracle Cloud Always Free** (VM ARM) | 0 € | VPS permanente; más configuración (Docker + nginx) |
| **Cloudflare Tunnel + PC/VPS propio** | 0 € | Túnel gratis; necesitas máquina encendida |
| **Fly.io** | Requiere tarjeta | Ver `DEPLOY_FLY.md` solo si aceptas billing |

---

## Troubleshooting

**“Application failed to respond” al abrir la app en Admin**

- Render free dormida → espera ~1 min y recarga.
- Revisa logs en Render → **Logs**.

**Bucle de autenticación**

- `SHOPIFY_APP_URL` debe coincidir exactamente con la URL de Render.
- `redirect_urls` en `shopify.app.entrega-tienda.toml` actualizados y redeploy hecho.

**Setup no crea la customization**

- Abre la app embebida → **Repetir configuración**.
