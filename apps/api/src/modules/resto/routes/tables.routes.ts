/** Table management (Fase 2): dining areas + floor-plan tables. Resto/Hybrid only. */
import Elysia, { t } from 'elysia';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { diningAreas, restoOrders, restoTables } from '../../../db/schema';
import { ok, handleRouteError } from '../../../lib/response';
import { Errors } from '../../../lib/errors';
import { writeAudit } from '../../../lib/audit';
import { requireBusinessType } from '../guards';
import { auth } from '../../../middleware/auth';

/** Floor plan payload: tables with their open order (if any). */
const tableSelect = {
  id: restoTables.id,
  code: restoTables.code,
  seats: restoTables.seats,
  status: restoTables.status,
  area_id: restoTables.area_id,
  order_id: sql<string | null>`(SELECT ro.id FROM resto_orders ro WHERE ro.table_id = ${restoTables.id} AND ro.status = 'OPEN' LIMIT 1)`,
  guests: sql<number | null>`(SELECT ro.guests FROM resto_orders ro WHERE ro.table_id = ${restoTables.id} AND ro.status = 'OPEN' LIMIT 1)`,
};

export const tableRoutes = new Elysia({ prefix: '/resto/tables' })
  .use(auth)
  // List (floor plan) — resto.view is enough to SEE the floor
  .get(
    '/',
    async ({ user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.view')) throw Errors.forbidden();
        const tables = await db
          .select(tableSelect)
          .from(restoTables)
          .where(eq(restoTables.store_id, auth.storeId))
          .orderBy(asc(restoTables.code));
        const areas = await db
          .select()
          .from(diningAreas)
          .where(eq(diningAreas.store_id, auth.storeId))
          .orderBy(asc(diningAreas.sort_order), asc(diningAreas.name));
        return ok({ areas, tables });
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // ---- Areas ----
  .post(
    '/areas',
    async ({ body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('table.manage')) throw Errors.forbidden();
        const [created] = await db
          .insert(diningAreas)
          .values({ store_id: auth.storeId, name: body.name, sort_order: body.sort_order ?? 0 })
          .returning();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_DINING_AREA',
          entityType: 'dining_area',
          entityId: created.id,
          metadata: { name: created.name },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(created);
      } catch (e) {
        if (String(e).includes('dining_areas_store_name_uq')) return handleRouteError(Errors.conflict('Nama area sudah ada'));
        return handleRouteError(e);
      }
    },
    { body: t.Object({ name: t.String({ minLength: 1, maxLength: 60 }), sort_order: t.Optional(t.Number()) }) },
  )
  .delete(
    '/areas/:id',
    async ({ params, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('table.manage')) throw Errors.forbidden();
        // Tables keep existing (area_id → NULL via FK set null).
        const [deleted] = await db
          .delete(diningAreas)
          .where(and(eq(diningAreas.id, params.id), eq(diningAreas.store_id, auth.storeId)))
          .returning({ id: diningAreas.id });
        if (!deleted) throw Errors.notFound('Area tidak ditemukan');
        return ok({ deleted: true, id: params.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ---- Tables ----
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('table.manage')) throw Errors.forbidden();
        const [created] = await db
          .insert(restoTables)
          .values({
            store_id: auth.storeId,
            area_id: body.area_id ?? null,
            code: body.code.trim(),
            seats: body.seats ?? 4,
          })
          .returning();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_TABLE',
          entityType: 'resto_table',
          entityId: created.id,
          metadata: { code: created.code, seats: created.seats },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(created);
      } catch (e) {
        if (String(e).includes('resto_tables_store_code_uq')) return handleRouteError(Errors.conflict('Kode meja sudah dipakai'));
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        code: t.String({ minLength: 1, maxLength: 20 }),
        seats: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
        area_id: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('table.manage')) throw Errors.forbidden();
        const patch: Record<string, unknown> = {};
        if (body.code !== undefined) patch.code = body.code.trim();
        if (body.seats !== undefined) patch.seats = body.seats;
        if (body.area_id !== undefined) patch.area_id = body.area_id;
        if (body.status !== undefined) {
          // Direct status change is only legal for FREE ↔ RESERVED (the validation
          // schema only accepts those). OCCUPIED is derived from the OPEN order
          // lifecycle (open/close bill), never manual.
          const [openOrder] = await db
            .select({ id: restoOrders.id })
            .from(restoOrders)
            .where(and(eq(restoOrders.table_id, params.id), eq(restoOrders.status, 'OPEN')))
            .limit(1);
          if (openOrder) throw Errors.validation('Meja sedang terisi order — tutup bill dulu');
          patch.status = body.status;
        }
        const [updated] = await db
          .update(restoTables)
          .set(patch)
          .where(and(eq(restoTables.id, params.id), eq(restoTables.store_id, auth.storeId)))
          .returning();
        if (!updated) throw Errors.notFound('Meja tidak ditemukan');
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_TABLE',
          entityType: 'resto_table',
          entityId: updated.id,
          metadata: { fields: Object.keys(body) },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(updated);
      } catch (e) {
        if (String(e).includes('resto_tables_store_code_uq')) return handleRouteError(Errors.conflict('Kode meja sudah dipakai'));
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        code: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
        seats: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
        area_id: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
        status: t.Optional(t.Union([t.Literal('FREE'), t.Literal('RESERVED')])),
      }),
    },
  )
  .delete(
    '/:id',
    async ({ params, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('table.manage')) throw Errors.forbidden();
        const [openOrder] = await db
          .select({ id: restoOrders.id })
          .from(restoOrders)
          .where(and(eq(restoOrders.table_id, params.id), eq(restoOrders.status, 'OPEN')))
          .limit(1);
        if (openOrder) throw Errors.validation('Meja sedang terisi order — tutup bill dulu');
        const [deleted] = await db
          .delete(restoTables)
          .where(and(eq(restoTables.id, params.id), eq(restoTables.store_id, auth.storeId)))
          .returning({ id: restoTables.id });
        if (!deleted) throw Errors.notFound('Meja tidak ditemukan');
        return ok({ deleted: true, id: params.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
