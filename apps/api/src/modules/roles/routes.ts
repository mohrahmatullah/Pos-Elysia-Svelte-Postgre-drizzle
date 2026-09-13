/** Dynamic Role CRUD (PRD 25): create, rename, delete — roles are fully DB-driven.
 * - Roles can be created freely (schema `roles.name` is text).
 * - DELETE cascades to `role_permissions` (FK ON DELETE CASCADE) and unlinks users first.
 * - 'owner' is protected: cannot be renamed or deleted (system role).
 * Users whose role is deleted must be reassigned first (sentinel check).
 * Mutations are gated by role.create / role.update / role.delete; the list endpoint
 * stays open to any authenticated user (role pickers in other pages need it).
 */
import Elysia, { t } from 'elysia';
import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../../db';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requireUser, requirePerm, invalidatePermissionCache } from '../../middleware/auth';
import { writeAudit } from '../../lib/audit';
import { Errors } from '../../lib/errors';
import { PROTECTED_ROLE } from '../../db/schema';

export const roleRoutes = new Elysia({ prefix: '/roles' })
  .use(auth)
  // All roles + how many users and permissions each has (left column + safe-delete hints)
  .get(
    '/',
    async ({ user }) => {
      try {
        requireUser(user);
        const [roles, userCounts, permCounts] = await Promise.all([
          db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).orderBy(asc(schema.roles.name)),
          db
            .select({ role_id: schema.users.role_id, count: sql<number>`count(*)::int` })
            .from(schema.users)
            .groupBy(schema.users.role_id),
          db
            .select({ role_id: schema.rolePermissions.role_id, count: sql<number>`count(*)::int` })
            .from(schema.rolePermissions)
            .groupBy(schema.rolePermissions.role_id),
        ]);
        const usersByRole = new Map(userCounts.map((r) => [r.role_id, r.count]));
        const permsByRole = new Map(permCounts.map((r) => [r.role_id, r.count]));
        return ok(
          roles.map((r) => ({
            ...r,
            users_count: usersByRole.get(r.id) ?? 0,
            permissions_count: permsByRole.get(r.id) ?? 0,
          })),
        );
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const me = requirePerm(user, 'role.create');
        const name = body.name.trim().toLowerCase();
        if (!name) throw Errors.validation('Nama role wajib diisi');

        const [created] = await db
          .insert(schema.roles)
          .values({ name })
          .onConflictDoNothing({ target: schema.roles.name })
          .returning({ id: schema.roles.id, name: schema.roles.name });
        if (!created) throw Errors.conflict(`Role "${name}" sudah ada`);

        // New roles start with no permissions; optionally clone an existing role's set.
        if (body.clone_from_role_id) {
          const source = await db.query.roles.findFirst({ where: eq(schema.roles.id, body.clone_from_role_id) });
          if (source) {
            const sourcePerms = await db
              .select({ code: schema.rolePermissions.permission_code })
              .from(schema.rolePermissions)
              .where(eq(schema.rolePermissions.role_id, source.id));
            if (sourcePerms.length) {
              await db
                .insert(schema.rolePermissions)
                .values(sourcePerms.map((p) => ({ role_id: created.id, permission_code: p.code })))
                .onConflictDoNothing();
            }
          }
        }

        await writeAudit({
          storeId: me.storeId,
          userId: me.userId,
          action: 'CREATE_ROLE',
          entityType: 'role',
          entityId: created.id,
          metadata: { name, clone_from_role_id: body.clone_from_role_id ?? null },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });

        invalidatePermissionCache(created.id);
        return ok(created);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 50 }),
        clone_from_role_id: t.Optional(t.String({ format: 'uuid' })),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const me = requirePerm(user, 'role.update');
        const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, params.id) });
        if (!role) throw Errors.notFound('Role tidak ditemukan');
        if (role.name === PROTECTED_ROLE) throw Errors.forbidden('Role owner tidak dapat diubah');

        const name = body.name.trim().toLowerCase();
        if (!name) throw Errors.validation('Nama role wajib diisi');

        const [updated] = await db
          .update(schema.roles)
          .set({ name, updated_at: new Date() })
          .where(eq(schema.roles.id, params.id))
          .returning({ id: schema.roles.id, name: schema.roles.name });
        if (!updated) throw Errors.notFound('Role tidak ditemukan');

        await writeAudit({
          storeId: me.storeId,
          userId: me.userId,
          action: 'RENAME_ROLE',
          entityType: 'role',
          entityId: params.id,
          metadata: { from: role.name, to: name },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });

        invalidatePermissionCache(params.id);
        return ok(updated);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 50 }) }),
    },
  )
  .delete(
    '/:id',
    async ({ params, user, request }) => {
      try {
        const me = requirePerm(user, 'role.delete');
        const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, params.id) });
        if (!role) throw Errors.notFound('Role tidak ditemukan');
        if (role.name === PROTECTED_ROLE) throw Errors.forbidden('Role owner tidak dapat dihapus');

        // Users must be reassigned first — never orphan a user.
        const [{ count: usersOnRole }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(eq(schema.users.role_id, params.id));
        if (usersOnRole > 0) {
          throw Errors.conflict(`Role masih dipakai ${usersOnRole} user. Pindahkan user terlebih dahulu.`);
        }

        await db.transaction(async (tx) => {
          // Explicit delete for clarity; FK cascade would handle it too.
          await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.role_id, params.id));
          await tx.delete(schema.roles).where(eq(schema.roles.id, params.id));
          await writeAudit(
            {
              storeId: me.storeId,
              userId: me.userId,
              action: 'DELETE_ROLE',
              entityType: 'role',
              entityId: params.id,
              metadata: { name: role.name },
              ip: request.headers.get('x-forwarded-for'),
              userAgent: request.headers.get('user-agent'),
            },
            tx,
          );
        });

        invalidatePermissionCache(params.id);
        return ok({ deleted: true, id: params.id, name: role.name });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
