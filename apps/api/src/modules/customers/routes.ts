/** Customer management (PRD 8). */
import Elysia, { t } from 'elysia';
import { and, asc, eq, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { customers, sales } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

export const customerRoutes = new Elysia({ prefix: '/customers' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'customer.view');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(customers.store_id, auth.storeId)];
        if (query.search) {
          conditions.push(
            or(ilike(customers.name, `%${query.search}%`), ilike(customers.phone, `%${query.search}%`), ilike(customers.email, `%${query.search}%`))!,
          );
        }
        const where = and(...conditions);
        const rows = await db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(limit).offset(offset);
        const count = await countWhere(customers, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ search: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  .get(
    '/:id',
    async ({ params, user }) => {
      try {
        const auth = requirePerm(user, 'customer.view');
        const [row] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.id, params.id), eq(customers.store_id, auth.storeId)))
          .limit(1);
        if (!row) throw Errors.notFound('Customer tidak ditemukan');
        // Transaction history (PRD 8)
        const history = await db
          .select({
            id: sales.id,
            invoice_number: sales.invoice_number,
            grand_total: sales.grand_total,
            status: sales.status,
            created_at: sales.created_at,
          })
          .from(sales)
          .where(and(eq(sales.customer_id, params.id), eq(sales.store_id, auth.storeId)))
          .orderBy(desc(sales.created_at))
          .limit(50);
        const [agg] = await db
          .select({
            total_transactions: sql<number>`COUNT(*)`,
            total_spent: sql<string>`COALESCE(SUM(${sales.grand_total}), 0)`,
          })
          .from(sales)
          .where(and(eq(sales.customer_id, params.id), eq(sales.store_id, auth.storeId), eq(sales.status, 'completed')));
        return ok({ ...row, history, total_transactions: Number(agg?.total_transactions ?? 0), total_spent: agg?.total_spent ?? '0' });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, 'customer.create');
        const [created] = await db
          .insert(customers)
          .values({
            store_id: auth.storeId,
            name: body.name,
            phone: body.phone ?? null,
            email: body.email ?? null,
            address: body.address ?? null,
            notes: body.notes ?? null,
          })
          .returning();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_CUSTOMER',
          entityType: 'customer',
          entityId: created.id,
          metadata: { name: created.name },
        });
        return ok(created);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        address: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'customer.update');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        for (const key of ['name', 'phone', 'email', 'address', 'notes'] as const) {
          if (body[key] !== undefined) patch[key] = body[key];
        }
        const [updated] = await db
          .update(customers)
          .set(patch)
          .where(and(eq(customers.id, params.id), eq(customers.store_id, auth.storeId)))
          .returning();
        if (!updated) throw Errors.notFound('Customer tidak ditemukan');
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_CUSTOMER',
          entityType: 'customer',
          entityId: updated.id,
          metadata: { fields: Object.keys(body) },
        });
        return ok(updated);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        phone: t.Optional(t.Nullable(t.String())),
        email: t.Optional(t.Nullable(t.String())),
        address: t.Optional(t.Nullable(t.String())),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  );
