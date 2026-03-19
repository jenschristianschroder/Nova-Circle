#!/bin/sh
# /docker-entrypoint.d/40-env-config.sh
#
# Generates /usr/share/nginx/html/env-config.js from container environment
# variables at startup. The React SPA reads window.__ENV__ from this file
# before the main bundle initialises, allowing Azure credentials to be
# injected at runtime without rebuilding the image per environment.
#
# VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID are public OAuth identifiers
# (not secrets); it is safe to expose them to the browser.

set -e

DEST=/usr/share/nginx/html/env-config.js

CLIENT_ID="${VITE_AZURE_CLIENT_ID:-}"
TENANT_ID="${VITE_AZURE_TENANT_ID:-}"

# Sanitise: Azure Client IDs and Tenant IDs are UUIDs consisting only of
# hex digits and hyphens. Strip any other characters defensively to prevent
# accidental injection into the generated JavaScript file.
CLIENT_ID=$(printf '%s' "$CLIENT_ID" | sed 's/[^a-fA-F0-9-]//g')
TENANT_ID=$(printf '%s' "$TENANT_ID" | sed 's/[^a-fA-F0-9-]//g')

printf 'window.__ENV__ = {\n  VITE_AZURE_CLIENT_ID: "%s",\n  VITE_AZURE_TENANT_ID: "%s"\n};\n' \
  "$CLIENT_ID" \
  "$TENANT_ID" \
  > "$DEST"

echo "env-config: wrote VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID to ${DEST}"
