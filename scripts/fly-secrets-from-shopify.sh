#!/usr/bin/env bash
# Sincroniza el secreto SHOPIFY_API_SECRET en Fly desde el entorno local de Shopify CLI.
# Uso (desde apps/entrega-tienda):
#   ./scripts/fly-secrets-from-shopify.sh
#   ./scripts/fly-secrets-from-shopify.sh mi-app-fly

set -euo pipefail

APP_NAME="${1:-entrega-tienda}"

if ! command -v fly >/dev/null 2>&1; then
  echo "Instala Fly CLI: https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
fi

SECRET="$(npx shopify app env show --json 2>/dev/null | node -e "
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(s);
      const v = j.SHOPIFY_API_SECRET || j.shopiFY_API_SECRET;
      if (!v) process.exit(1);
      process.stdout.write(String(v));
    } catch { process.exit(1); }
  });
")"

if [[ -z "${SECRET}" ]]; then
  echo "No se pudo leer SHOPIFY_API_SECRET. Ejecuta antes: npx shopify app config link"
  exit 1
fi

fly secrets set "SHOPIFY_API_SECRET=${SECRET}" --app "${APP_NAME}"
echo "OK: SHOPIFY_API_SECRET actualizado en Fly (app: ${APP_NAME})"
