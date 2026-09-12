/** Category management (PRD 5.4). */
import Elysia, { t } from 'elysia';
import { and, asc, eq, ilike } from 'drizzle-orm';
import { db } from '../../db';
import { categories } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

export const categoryRoutes = new Elysia({ prefix: '/categories' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'READ_PRODUCT');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(categories.store_id, auth.storeId)];
        if (query.search) conditions.push(ilike(categories.name, `%${query.search}%`));
        if (query.active === 'true') conditions.push(eq(categories.active, true));
        if (query.active === 'false') conditions.push(eq(categories.active, false));
        const where = and(...conditions);
        const rows = await db.select().from(categories).where(where).orderBy(asc(categories.name)).limit(limit).offset(offset);
        const count = await countWhere(categories, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ search: t.Optional(t.String()), active: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, 'MANAGE_CATEGORY');
        const [created] = await db
          .insert(categories)
          .values({
            store_id: auth.storeId,
            name: body.name,
            description: body.description ?? null,
            active: true,
          })
          .returning();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_CATEGORY',
          entityType: 'category',
          entityId: created.id,
          metadata: { name: created.name },
        });
        return ok(created);
      } catch (e) {
        if (String(e).includes('categories_store_name_uq')) return handleRouteError(Errors.conflict('Nama kategori sudah ada'));
        return handleRouteError(e);
      }
    },
    { body: t.Object({ name: t.String({ minLength: 1 }), description: t.Optional(t.String()) }) },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'MANAGE_CATEGORY');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.description !== undefined) patch.description = body.description;
        if (body.active !== undefined) patch.active = body.active;
        const [updated] = await db
          .update(categories)
          .set(patch)
          .where(and(eq(categories.id, params.id), eq(categories.store_id, auth.storeId)))
          .returning();
        if (!updated) throw Errors.notFound('Kategori tidak ditemukan');
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_CATEGORY',
          entityType: 'category',
          entityId: updated.id,
          metadata: { fields: Object.keys(body) },
        });
        return ok(updated);
      } catch (e) {
        if (String(e).includes('categories_store_name_uq')) return handleRouteError(Errors.conflict('Nama kategori sudah ada'));
        return handleRouteError(e);
      }
    },
    { body: t.Object({ name: t.Optional(t.String()), description: t.Optional(t.String()), active: t.Optional(t.Boolean()) }) },
  )
  .delete(
    '/:id',
    async ({ params, user, request }) => {
      try {
        const auth = requirePerm(user, 'MANAGE_CATEGORY');
        // Soft-delete: deactivate to preserve historical references (PRD 42 principle 9)
        const [updated] = await db
          .update(categories)
          .set({ active: false, updated_at: new Date() })
          .where(and(eq(categories.id, params.id), eq(categories.store_id, auth.storeId)))
          .returning();
        if (!updated) throw Errors.notFound('Kategori tidak ditemukan');
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'DEACTIVATE_CATEGORY',
          entityType: 'category',
          entityId: updated.id,
        });
        return ok({ deactivated: true, id: updated.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
