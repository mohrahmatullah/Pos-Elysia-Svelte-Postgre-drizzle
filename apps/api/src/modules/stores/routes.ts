/** Multi-store management — the owner administers all stores and switches between
 * them (store.view/create/update/delete). Data scoping itself is unchanged: every
 * module filters by the session's active store (see middleware/auth). */
import Elysia, { t } from 'elysia';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { stores, userStores } from '../../db/schema';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

const storeSelect = {
  id: stores.id,
  name: stores.name,
  address: stores.address,
  phone: stores.phone,
  invoice_prefix: stores.invoice_prefix,
  tax_rate: stores.tax_rate,
  active: stores.active,
  created_at: stores.created_at,
};

export const storeRoutes = new Elysia({ prefix: '/stores' })
  .use(auth)
  .get(
    '/',
    async ({ user }) => {
      try {
        requirePerm(user, 'store.view');
        const rows = await db.select(storeSelect).from(stores).orderBy(asc(stores.name));
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const authUser = requirePerm(user, 'store.create');
        const [created] = await db
          .insert(stores)
          .values({
            name: body.name,
            address: body.address ?? null,
            phone: body.phone ?? null,
            invoice_prefix: body.invoice_prefix ?? 'INV',
            tax_rate: body.tax_rate ?? '0',
          })
          .returning(storeSelect);
        // The creator (owner) becomes a member so they can switch into the new store.
        await db
          .insert(userStores)
          .values({ user_id: authUser.userId, store_id: created.id })
          .onConflictDoNothing();
        await writeAudit({
          storeId: created.id,
          userId: authUser.userId,
          action: 'CREATE_STORE',
          entityType: 'store',
          entityId: created.id,
          metadata: { name: created.name },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(created);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        invoice_prefix: t.Optional(t.String({ minLength: 1 })),
        tax_rate: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const authUser = requirePerm(user, 'store.update');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.address !== undefined) patch.address = body.address;
        if (body.phone !== undefined) patch.phone = body.phone;
        if (body.invoice_prefix !== undefined) patch.invoice_prefix = body.invoice_prefix;
        if (body.tax_rate !== undefined) patch.tax_rate = body.tax_rate;
        if (body.active !== undefined) {
          if (!body.active && params.id === authUser.storeId) {
            throw Errors.validation('Tidak bisa menonaktifkan toko yang sedang aktif digunakan');
          }
          patch.active = body.active;
        }
        const [updated] = await db.update(stores).set(patch).where(eq(stores.id, params.id)).returning(storeSelect);
        if (!updated) throw Errors.notFound('Toko tidak ditemukan');
        await writeAudit({
          storeId: updated.id,
          userId: authUser.userId,
          action: 'UPDATE_STORE',
          entityType: 'store',
          entityId: updated.id,
          metadata: { fields: Object.keys(body) },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(updated);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        address: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        invoice_prefix: t.Optional(t.String({ minLength: 1 })),
        tax_rate: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    '/:id',
    async ({ params, user, request }) => {
      try {
        const authUser = requirePerm(user, 'store.delete');
        if (params.id === authUser.storeId) {
          throw Errors.validation('Tidak bisa menonaktifkan toko yang sedang aktif digunakan');
        }
        // Soft-delete: stores hold all business data — never hard-delete.
        const [updated] = await db
          .update(stores)
          .set({ active: false, updated_at: new Date() })
          .where(eq(stores.id, params.id))
          .returning(storeSelect);
        if (!updated) throw Errors.notFound('Toko tidak ditemukan');
        await writeAudit({
          storeId: updated.id,
          userId: authUser.userId,
          action: 'DEACTIVATE_STORE',
          entityType: 'store',
          entityId: updated.id,
          metadata: { name: updated.name },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ deactivated: true, id: updated.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
