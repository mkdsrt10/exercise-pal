# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    # Docker VMs often connect slower than Node's 250 ms per-address default, which makes fetch time out.
    NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
