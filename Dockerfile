FROM node:22-bookworm-slim AS build

ARG VITE_REPLOFY_PLATFORM=standalone
ENV VITE_REPLOFY_PLATFORM=$VITE_REPLOFY_PLATFORM

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run server:build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=4100
ENV REPLOFY_DATA_DIR=/var/lib/replofy

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/drizzle ./drizzle

RUN mkdir -p /var/lib/replofy && chown -R node:node /app /var/lib/replofy
USER node

EXPOSE 4100
VOLUME ["/var/lib/replofy"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4100/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node dist-server/src/server/migrate.js && exec node dist-server/src/server/index.js"]
