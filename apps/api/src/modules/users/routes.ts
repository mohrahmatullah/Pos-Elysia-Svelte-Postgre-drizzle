/** User management (PRD 5.2) — owner only. */
import Elysia, { t } from 'elysia';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db';
import { roles, users } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { hashPassword } from '../../lib/password';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

const userSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  status: users.status,
  role: roles.name,
  created_at: users.created_at,
};

export const userRoutes = new Elysia({ prefix: '/users' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'user.view');
        const { page, limit, offset } = parsePagination(query);
        const where = query.search
          ? and(
              eq(users.store_id, auth.storeId),
              or(ilike(users.name, `%${query.search}%`), ilike(users.email, `%${query.search}%`)),
            )
          : eq(users.store_id, auth.storeId);
        const rows = await db
          .select(userSelect)
          .from(users)
          .innerJoin(roles, eq(users.role_id, roles.id))
          .where(where)
          .orderBy(asc(users.name))
          .limit(limit)
          .offset(offset);
        const count = await countWhere(users, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ search: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, 'user.create');
        const [role] = await db.select().from(roles).where(eq(roles.name, body.role as 'owner')).limit(1);
        if (!role) throw Errors.validation('Role tidak valid');
        const passwordHash = await hashPassword(body.password);
        const [created] = await db
          .insert(users)
          .values({
            store_id: auth.storeId,
            role_id: role.id,
            name: body.name,
            email: body.email.toLowerCase().trim(),
            password_hash: passwordHash,
            status: body.status ?? 'active',
          })
          .returning(userSelect);
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_USER',
          entityType: 'user',
          entityId: created.id,
          metadata: { email: created.email, role: body.role },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(created);
      } catch (e) {
        if (String(e).includes('users_email_uq')) return handleRouteError(Errors.conflict('Email sudah digunakan'));
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 8 }),
        role: t.String({ minLength: 1 }),
        status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')])),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'user.update');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.status !== undefined) patch.status = body.status;
        if (body.role !== undefined) {
          const [role] = await db.select().from(roles).where(eq(roles.name, body.role as 'owner')).limit(1);
          if (!role) throw Errors.validation('Role tidak valid');
          patch.role_id = role.id;
        }
        if (body.password !== undefined) {
          if (body.password.length < 8) throw Errors.validation('Password minimal 8 karakter');
          patch.password_hash = await hashPassword(body.password);
        }
        const [updated] = await db
          .update(users)
          .set(patch)
          .where(and(eq(users.id, params.id), eq(users.store_id, auth.storeId)))
          .returning(userSelect);
        if (!updated) throw Errors.notFound('User tidak ditemukan');
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_USER',
          entityType: 'user',
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
        name: t.Optional(t.String()),
        role: t.Optional(t.String({ minLength: 1 })),
        status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')])),
        password: t.Optional(t.String()),
      }),
    },
  );
