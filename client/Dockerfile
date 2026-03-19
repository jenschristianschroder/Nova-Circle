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
# entrypoint.sh runs before nginx starts (via /docker-entrypoint.d/) and
# writes env-config.js from container environment variables so the React SPA
# can read VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID at runtime without
# requiring the image to be rebuilt per environment.
COPY entrypoint.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh

# SPA config: all unknown paths fall back to index.html for client-side routing.
# Static assets built by Vite include content hashes, so they are cached
# aggressively; HTML is never cached to pick up new deployments immediately.
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # SPA fallback\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache hashed assets for 1 year\n\
    location ~* \\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # Never cache the HTML entry point\n\
    location = /index.html {\n\
        add_header Cache-Control "no-store";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
