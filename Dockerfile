# Self-hosted Puente image. Build context is the repository root:
#   docker compose build app
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/storage

WORKDIR /app

# Dependencies first so the layer is cached until package files change.
COPY web/package.json web/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application files (tests, scripts and node_modules are excluded by .dockerignore).
COPY web/ ./

# Storage volume owned by the unprivileged user; a new named volume inherits this ownership.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/config?accion=salud" || exit 1

CMD ["node", "server.js"]
