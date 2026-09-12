FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install || true
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN bun install && bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app/apps/web
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "./build/index.js"]
