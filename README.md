# POS — Point of Sale System

MVP POS system per `PRD_POS_ElysiaJS_Drizzle_PostgreSQL_Svelte.md`.

- **Backend:** ElysiaJS on Bun, Drizzle ORM, PostgreSQL
- **Frontend:** SvelteKit
- **Auth:** JWT access + refresh (rotating, revocable) with HttpOnly cookies

## Stack

```text
pos/
├── apps/
│   ├── api/     ElysiaJS + Drizzle (port 3001)
│   └── web/     SvelteKit (port 3000)
├── packages/
│   └── shared/  shared types/enums/validation constants
├── docker/
└── docker-compose.yml
```

## Quick Start (dev)

Requirements: [Bun](https://bun.sh), Docker.

```bash
# 1. Install dependencies
bun install

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Environment
cp .env.example .env   # defaults work for local dev

# 4. Generate & run migrations, then seed demo data
bun run db:generate
bun run db:migrate
bun run db:seed

# 5. Run API (http://localhost:3001) and web (http://localhost:3000)
bun run dev:api
bun run dev:web
```

Login with seeded accounts (`owner@pos.local` / `Passw0rd!`, `manager@pos.local` / `Passw0rd!`, `cashier@pos.local` / `Passw0rd!`).

## API

Base URL `/api/v1`. Standard responses:

```json
{ "success": true, "data": {}, "meta": {} }
{ "success": false, "error": { "code": "PRODUCT_NOT_FOUND", "message": "..." } }
```

Modules: auth, users, categories, products, customers, inventory, sales (checkout/cancel/return), reports, settings, audit-logs.

## Tests

```bash
bun test              # unit + integration
bun run dev:api       # then in another terminal
bun test apps/api/test/integration
```

Unit tests (pricing/stock/permissions) run anywhere; integration tests need PostgreSQL up.
