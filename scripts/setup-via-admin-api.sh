#!/usr/bin/env bash
# Setup en tienda de PRODUCCIÓN sin Render ni Shopify CLI.
#
# Requisitos:
#   1) App custom en el Admin de la tienda (Configuración → Apps → Desarrollar apps)
#   2) Scopes: write_delivery_customizations, write_discounts (+ read_* equivalentes)
#   3) Token de Admin API de esa app custom (se muestra una sola vez al instalar)
#
# Uso:
#   export SHOP="TU-TIENDA.myshopify.com"
#   export ADMIN_TOKEN="shpat_..."
#   bash scripts/setup-via-admin-api.sh

set -euo pipefail

if [[ -z "${SHOP:-}" || -z "${ADMIN_TOKEN:-}" ]]; then
  echo "Define SHOP y ADMIN_TOKEN antes de ejecutar."
  echo '  export SHOP="tu-tienda.myshopify.com"'
  echo '  export ADMIN_TOKEN="shpat_..."'
  exit 1
fi

API="https://${SHOP}/admin/api/2025-07/graphql.json"

run_gql() {
  local label="$1"
  local query="$2"
  echo ""
  echo "=== ${label} ==="
  curl -sS "$API" \
    -H "Content-Type: application/json" \
    -H "X-Shopify-Access-Token: ${ADMIN_TOKEN}" \
    -d "$(jq -n --arg q "$query" '{query: $q}')" | jq .
}

run_gql "Shop" '{ shop { name myshopifyDomain id } }'

run_gql "Delivery customization" \
  'mutation { deliveryCustomizationCreate(deliveryCustomization: { title: "Entrega en tienda — Delivery Customization", functionHandle: "entrega-tienda-delivery", enabled: true }) { deliveryCustomization { id title enabled } userErrors { message } } }'

run_gql "Shipping discount" \
  'mutation { discountAutomaticAppCreate(automaticAppDiscount: { title: "Entrega en tienda — Shipping Discount", functionHandle: "pickup-discount", startsAt: "2026-08-05T00:00:00Z" }) { automaticAppDiscount { discountId title status } userErrors { message } } }'

echo ""
echo "Listo. Revisa userErrors en la salida."
echo "Metacampo, checkout UI y tarifa manual: hazlos en el Admin (no requieren este script)."
