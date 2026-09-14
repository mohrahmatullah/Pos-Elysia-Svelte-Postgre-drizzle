/** Store settings (PRD 12) — owner only. */
import Elysia, { t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { stores } from '../../db/schema';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { writeAudit } from '../../lib/audit';

export const settingsRoutes = new Elysia({ prefix: '/settings' })
  .use(auth)
  .get(
    '/',
    async ({ user }) => {
      try {
        const auth = requirePerm(user, 'settings.manage');
        const [store] = await db.select().from(stores).where(eq(stores.id, auth.storeId)).limit(1);
        return ok(store);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  .patch(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, 'settings.manage');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        for (const key of ['name', 'address', 'phone', 'receipt_footer', 'invoice_prefix', 'currency', 'timezone'] as const) {
          if (body[key] !== undefined) patch[key] = body[key];
        }
        if (body.tax_rate !== undefined) patch.tax_rate = String(body.tax_rate);
        // General (store-wide default) discount applied to new POS transactions.
        if (body.default_discount_type !== undefined) patch.default_discount_type = body.default_discount_type;
        if (body.default_discount_value !== undefined) patch.default_discount_value = String(body.default_discount_value);
        const [updated] = await db.update(stores).set(patch).where(eq(stores.id, auth.storeId)).returning();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_SETTINGS',
          entityType: 'store',
          entityId: auth.storeId,
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
        name: t.Optional(t.String()),
        address: t.Optional(t.Nullable(t.String())),
        phone: t.Optional(t.Nullable(t.String())),
        receipt_footer: t.Optional(t.Nullable(t.String())),
        invoice_prefix: t.Optional(t.String()),
        currency: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        tax_rate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        default_discount_type: t.Optional(t.Union([t.Literal('PERCENT'), t.Literal('NOMINAL')])),
        default_discount_value: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  );
