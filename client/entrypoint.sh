#!/bin/sh
# /docker-entrypoint.d/40-env-config.sh
#
# Runs before nginx starts (executed by /docker-entrypoint.sh in numeric order).
#
# 1. Generates /usr/share/nginx/html/env-config.js from container environment
#    variables so the React SPA can read VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID
#    at runtime without requiring the image to be rebuilt per environment.
#
# 2. Writes /etc/nginx/conf.d/default.conf at runtime, adding a reverse-proxy
#    location for /api when API_BASE_URL is set. The proxy forwards browser
#    requests to /api/v1/... to the backend API container server-side, so the
#    browser sees everything as same-origin and no CORS headers are needed.
#
# VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID are public OAuth identifiers
# (not secrets); it is safe to expose them to the browser.
#
# API_BASE_URL is the backend container's HTTPS base URL, e.g.:
#   https://ca-nova-circle-dev.xxx.swedencentral.azurecontainerapps.io
# It is used only for nginx's server-side proxy; the browser never sees it.

set -e

# ── 1. Write env-config.js (SPA runtime environment) ──────────────────────────

JS_DEST=/usr/share/nginx/html/env-config.js

CLIENT_ID="${VITE_AZURE_CLIENT_ID:-}"
TENANT_ID="${VITE_AZURE_TENANT_ID:-}"
SIGNUP_AUTHORITY="${VITE_AZURE_SIGNUP_AUTHORITY:-}"

# Sanitise: Azure Client IDs and Tenant IDs are UUIDs consisting only of
# hex digits and hyphens. Strip any other characters defensively to prevent
# accidental injection into the generated JavaScript file.
CLIENT_ID=$(printf '%s' "$CLIENT_ID" | sed 's/[^a-fA-F0-9-]//g')
TENANT_ID=$(printf '%s' "$TENANT_ID" | sed 's/[^a-fA-F0-9-]//g')

# Validate sign-up authority: must be an HTTPS URL pointing to a known Azure
# authority hostname (*.b2clogin.com, login.microsoftonline.com, *.ciamlogin.com).
# If invalid, an empty string is written and a warning is logged.
if [ -n "$SIGNUP_AUTHORITY" ]; then
  if printf '%s\n' "$SIGNUP_AUTHORITY" | grep -Eq '^https://([a-zA-Z0-9-]+\.b2clogin\.com|login\.microsoftonline\.com|[a-zA-Z0-9-]+\.ciamlogin\.com)(/[a-zA-Z0-9_./-]*)?$'; then
    : # valid — keep SIGNUP_AUTHORITY as-is
  else
    echo "env-config: WARNING: VITE_AZURE_SIGNUP_AUTHORITY '${SIGNUP_AUTHORITY}' is not a recognised Azure authority URL. Expected https://<tenant>.b2clogin.com/..., https://login.microsoftonline.com/..., or https://<tenant>.ciamlogin.com/... — ignoring." >&2
    SIGNUP_AUTHORITY=""
  fi
fi

printf 'window.__ENV__ = {\n  VITE_AZURE_CLIENT_ID: "%s",\n  VITE_AZURE_TENANT_ID: "%s",\n  VITE_AZURE_SIGNUP_AUTHORITY: "%s"\n};\n' \
  "$CLIENT_ID" \
  "$TENANT_ID" \
  "$SIGNUP_AUTHORITY" \
  > "$JS_DEST"

echo "env-config: wrote VITE_AZURE_CLIENT_ID, VITE_AZURE_TENANT_ID, and VITE_AZURE_SIGNUP_AUTHORITY to ${JS_DEST}"

# ── 2. Write nginx config (including /api proxy when backend URL is set) ───────

NGINX_CONF=/etc/nginx/conf.d/default.conf

# Sanitise and validate API_BASE_URL: extract the hostname only.
# Expected format: https://<hostname>  (no trailing slash, no path, no port, no query).
# Only [a-zA-Z0-9.-] are allowed in the hostname.  If the value does not match
# this strict format (e.g. contains a port like http://host:8080) the /api proxy
# is NOT configured to avoid silently generating a bad proxy target.
RAW_API_BASE_URL="${API_BASE_URL:-}"

# Trim whitespace.
if [ -n "${RAW_API_BASE_URL}" ]; then
  RAW_API_BASE_URL=$(printf '%s' "${RAW_API_BASE_URL}" | tr -d ' \t\r\n')
fi

BACKEND_FQDN=""
if [ -n "${RAW_API_BASE_URL}" ]; then
  # Require strict format: http(s):// followed by a bare hostname (no port/path/query).
  if printf '%s\n' "${RAW_API_BASE_URL}" | grep -Eq '^https?://[a-zA-Z0-9.-]+$'; then
    BACKEND_FQDN=$(printf '%s' "${RAW_API_BASE_URL}" | sed 's|^https\?://||')
  else
    echo "env-config: WARNING: API_BASE_URL '${API_BASE_URL}' is invalid. Expected format: https://<hostname> (no port, path, or query). /api proxy will NOT be configured." >&2
    BACKEND_FQDN=""
  fi
fi

if [ -n "${BACKEND_FQDN}" ]; then
  # Write nginx config WITH the /api reverse-proxy location.
  # Variables prefixed with \ are nginx variables (preserved literally);
  # ${BACKEND_FQDN} is the shell variable expanded to the actual hostname.
  cat > "${NGINX_CONF}" << NGINX_CONF_WITH_PROXY
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Reverse-proxy /api to the backend API — server-side, same-origin for browsers.
    # Backend: https://${BACKEND_FQDN}
    location /api {
        proxy_pass          https://${BACKEND_FQDN};
        proxy_http_version  1.1;
        proxy_ssl_server_name on;
        proxy_set_header    Host                ${BACKEND_FQDN};
        proxy_set_header    X-Real-IP           \$remote_addr;
        proxy_set_header    X-Forwarded-For     \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto   \$scheme;
        # Generous timeouts to accommodate Azure Container Apps cold-start.
        proxy_connect_timeout 30s;
        proxy_read_timeout    60s;
        proxy_send_timeout    60s;
    }

    # Never cache the runtime-generated env config.
    location = /env-config.js {
        add_header Cache-Control "no-store";
    }

    # Cache hashed static assets aggressively (Vite embeds content hashes).
    location ~* \.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache the HTML entry point.
    location = /index.html {
        add_header Cache-Control "no-store";
    }

    # SPA fallback — must be last so /api and specific locations take priority.
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX_CONF_WITH_PROXY
  echo "env-config: configured /api proxy → https://${BACKEND_FQDN}"
else
  # Write nginx config WITHOUT a proxy location.
  # Requests to /api will fall through to the SPA fallback (index.html).
  # Set API_BASE_URL on the container to enable the /api proxy in production.
  cat > "${NGINX_CONF}" << 'NGINX_CONF_STATIC'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Never cache the runtime-generated env config.
    location = /env-config.js {
        add_header Cache-Control "no-store";
    }

    # Cache hashed static assets aggressively (Vite embeds content hashes).
    location ~* \.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache the HTML entry point.
    location = /index.html {
        add_header Cache-Control "no-store";
    }

    # SPA fallback.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF_STATIC
  echo "env-config: API_BASE_URL not set — /api proxy not configured (set API_BASE_URL for production)"
fi
