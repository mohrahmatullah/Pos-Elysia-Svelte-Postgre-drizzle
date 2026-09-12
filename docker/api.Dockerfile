FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile || bun install

FROM install AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN bun install && bun run build || true

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["bun", "run", "src/server.ts"]
