# Despliegue en Fly.io — Entrega en tienda

> **Requiere tarjeta en Fly.io** (aunque el uso mínimo puede ser gratis con créditos).  
> **¿Sin tarjeta?** Usa **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** (plan Free de Render, recomendado).

Guía para alojar la **app embebida** (panel Admin + setup automático) en [Fly.io](https://fly.io). Las **extensiones** (functions + checkout UI) siguen desplegándose con `shopify app deploy` a Shopify.

## Resumen

| Componente | Dónde vive |
|---|---|
| Servidor web (React Router, OAuth, setup) | Fly.io |
| Functions + Checkout UI | Shopify (`shopify app deploy`) |

## Requisitos

- Cuenta en [Fly.io](https://fly.io)
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) (`fly auth login`)
- App vinculada en Partners (`npx shopify app config link`)
- Node 20+ local para builds de extensiones

## 1. Primera vez — crear app en Fly

Desde `apps/entrega-tienda`:

```bash
# Si el nombre entrega-tienda está ocupado globalmente en Fly, edita app = "..." en fly.toml
fly apps create entrega-tienda

# Volumen persistente para sesiones OAuth (SQLite)
fly volumes create entrega_tienda_data --region mad --size 1 --app entrega-tienda
```

> Región `mad` (Madrid). Cambia `--region` si tu org Fly usa otra.

## 2. Secretos y variables

### Secreto (nunca en fly.toml)

```bash
chmod +x scripts/fly-secrets-from-shopify.sh
./scripts/fly-secrets-from-shopify.sh entrega-tienda
```

O manualmente:

```bash
fly secrets set SHOPIFY_API_SECRET="tu_client_secret_de_partners" --app entrega-tienda
```

### URL pública

Tras el primer deploy, Fly asigna `https://entrega-tienda.fly.dev` (o la que elijas). Actualiza:

1. **`fly.toml`** → `SHOPIFY_APP_URL`
2. **`shopify.app.entrega-tienda.toml`** → `application_url` y `auth.redirect_urls`
3. Vuelve a sincronizar Partners:

```bash
npx shopify app deploy --force
# Release en Partners → Versions
```

## 3. Desplegar el servidor web

```bash
npm run deploy:fly
# equivalente: fly deploy --app entrega-tienda
```

Verifica:

```bash
fly logs --app entrega-tienda
fly status --app entrega-tienda
```

Abre `https://entrega-tienda.fly.dev` — debe responder (puede redirigir a login Shopify).

## 4. Desplegar extensiones (Shopify)

```bash
npx shopify app deploy --force
```

Release la versión en Partners. Las tiendas instaladas reciben la actualización de functions/UI.

## 5. Instalar / probar en la tienda

1. Enlace de instalación desde Partners
2. El comercio abre **Apps → entrega-tienda** → el setup automático crea customization, descuento y metafield
3. Crear tarifa manual **Entrega en tienda** en Envíos
4. Probar checkout

## Desarrollo local vs producción

| | Local (`npm run dev`) | Fly (producción) |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/dev.sqlite` (`.env`) | `file:/data/production.sqlite` (volumen) |
| `SHOPIFY_APP_URL` | Túnel del CLI | `https://….fly.dev` |
| Extensiones | Hot reload vía CLI | `shopify app deploy` |

Copia `.env.example` → `.env` para desarrollo:

```bash
DATABASE_URL="file:./prisma/dev.sqlite"
```

## Actualizar producción

```bash
# Cambios en app/ (panel, setup)
fly deploy --app entrega-tienda

# Cambios en extensions/
npx shopify app deploy --force
# Release en Partners
```

## Escalado (recomendado producción)

En `fly.toml` ya está:

- `min_machines_running = 1`
- `auto_stop_machines = "off"`

Evita cold starts que rompen OAuth embebido.

## Troubleshooting

**La app embebida no carga / bucle de auth**

- `SHOPIFY_APP_URL` en Fly = URL exacta con `https://`
- `application_url` y `redirect_urls` en `shopify.app.entrega-tienda.toml` coinciden
- Reinstala la app en la tienda tras cambiar URLs

**Error Prisma / sesiones**

- Comprueba que el volumen existe: `fly volumes list --app entrega-tienda`
- Logs: `fly logs --app entrega-tienda`

**Build Docker falla**

- Prueba local: `docker build -t entrega-tienda .`
- Asegura `npm exec react-router build` pasa en local

**Setup no crea customization**

- Abre la app embebida en Admin y pulsa **Repetir configuración**
- Revisa scopes en `fly.toml` y Partners

## PostgreSQL (opcional)

Para alta disponibilidad sin volumen SQLite:

```bash
fly postgres create --name entrega-tienda-db --region mad
fly postgres attach entrega-tienda-db --app entrega-tienda
```

Cambia `prisma/schema.prisma` a `provider = "postgresql"` y quita el bloque `[mounts]` de `fly.toml`. Requiere migración y redeploy.
