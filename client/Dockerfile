# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Compile TypeScript and bundle with Vite.
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached until package files change)
COPY package*.json ./
RUN npm ci

# Copy source and config, then build
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY public/ ./public/
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Runtime (nginx) ──────────────────────────────────────────────────
# Serve pre-built static assets from a minimal nginx image.
FROM nginx:1.27-alpine AS runtime

# Remove the default nginx page and replace with our app
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

# Runtime environment injection:
# entrypoint.sh runs before nginx starts (via /docker-entrypoint.d/) and:
#  1. Writes env-config.js from VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID so
#     the React SPA can read Azure credentials without rebuilding per environment.
#  2. Writes /etc/nginx/conf.d/default.conf at container startup, adding a
#     reverse-proxy location for /api when API_BASE_URL is set. This forwards
#     browser API calls to the backend container server-side (same-origin, no CORS).
COPY entrypoint.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh

# Remove the default nginx config so there is no stale config before the
# entrypoint script writes the runtime-generated one on first startup.
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
