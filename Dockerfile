# syntax=docker/dockerfile:1

FROM node:20-bookworm AS builder

WORKDIR /app

ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=300000

COPY . .

RUN npm install \
 && npm install --prefix Athens \
 && cd project-avalon && npm install --ignore-scripts \
 && npm run build -w @avalon/shared \
 && npm run build -w @avalon/backend \
 && npm run build -w @avalon/ai-bff \
 && cd .. \
 && npm run build -w unified-ai-server \
 && cd vender-server && npm install && npm run build

WORKDIR /app/Athens
ARG VITE_API_URL=/api
ARG VITE_AVALON_SERVER=/avalon
ARG VITE_AI_BFF_URL=/ai-bff
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AVALON_SERVER=${VITE_AVALON_SERVER}
ENV VITE_AI_BFF_URL=${VITE_AI_BFF_URL}
RUN npm run build


FROM mongo:7.0 AS mongodb

FROM node:20-bookworm

ENV NODE_ENV=production \
    MONGO_URL=mongodb://127.0.0.1:27017 \
    MONGO_DB=AthensDB \
    HOST=0.0.0.0 \
    PORT=8979 \
    UNIFIED_AI_URL=http://127.0.0.1:8790 \
    AI_BFF_URL=http://127.0.0.1:3920 \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=3848 \
    CORS_ORIGIN=* \
    EMBEDDED_MONGO=auto \
    PUPPETEER_CACHE_DIR=/app/Athens-server/.cache/puppeteer

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    nginx \
    supervisor \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

COPY --from=mongodb /usr/bin/mongod /usr/local/bin/mongod

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/Athens-server ./Athens-server
COPY --from=builder /app/unified-ai-server ./unified-ai-server
COPY --from=builder /app/project-avalon/package.json /app/project-avalon/package-lock.json ./project-avalon/
COPY --from=builder /app/project-avalon/node_modules ./project-avalon/node_modules
COPY --from=builder /app/project-avalon/packages/shared ./project-avalon/packages/shared
COPY --from=builder /app/project-avalon/packages/backend ./project-avalon/packages/backend
COPY --from=builder /app/project-avalon/packages/ai-bff ./project-avalon/packages/ai-bff
COPY --from=builder /app/Athens/dist ./Athens/dist
COPY --from=builder /app/vender-server ./vender-server
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /app/docker/supervisord.conf
COPY docker/entrypoint.sh /app/docker/entrypoint.sh

# Install Puppeteer's Chrome for Testing into PUPPETEER_CACHE_DIR so PDF
# rendering does not depend on a host/system Chrome package.
RUN cd /app/Athens-server \
 && node ./scripts/ensure-puppeteer-chrome.mjs

RUN chmod +x /app/docker/entrypoint.sh \
 && find /app -name '.env' -delete \
 && find /app -name '.env.*' ! -name '.env.example' -delete \
 && mkdir -p /data/db /var/log/mongodb /var/log/nginx

VOLUME ["/data/db"]

EXPOSE 80 3847 3848 3920 8790 8979

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1/avalon/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/app/docker/entrypoint.sh"]
