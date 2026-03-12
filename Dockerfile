# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Compile TypeScript to JavaScript.
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached until package files change)
COPY package*.json ./
RUN npm ci

# Copy source and config, then compile
COPY tsconfig.json ./
COPY src/ ./src/
COPY db/ ./db/

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Lean production image: only compiled output and production dependencies.
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from the build stage
COPY --from=builder /app/dist ./dist

# Run as a non-root user
RUN addgroup -S nova && adduser -S nova -G nova
USER nova

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server.js"]
