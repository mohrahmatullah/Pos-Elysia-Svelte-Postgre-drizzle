/** Role & Permission management API (PRD 25).
 * Endpoints:
 * - GET  /            -> catalog grouped by resource + labels + my permissions
 * - GET  /roles       -> roles for the left column
 * - GET  /role/:id    -> currently granted codes for a role
 * - PUT  /role/:id    -> replace the role's permission set (audited)
 * Mutations require 'user.manage'. No runtime `if role === owner` shortcut: the owner's
 * own permission set lives in the DB too (seeded with all codes).
 */
import Elysia, { t } from 'elysia';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requireUser, invalidatePermissionCache } from '../../middleware/auth';
import { writeAudit } from '../../lib/audit';
import { Errors } from '../../lib/errors';
import { PERMISSION_LABEL, ROLE_PERMISSION_CODES, type PermissionCode } from '../../db/schema';
import { getRolePermissionCodes } from '../../db/permission';

/** Catalog grouped by resource: { product: ['product.view', ...], ... } */
const resourceGroup: Record<string, string[]> = {};
for (const code of ROLE_PERMISSION_CODES) {
  const [resource] = code.split('.');
  resourceGroup[resource] ??= [];
  resourceGroup[resource].push(code);
}

/** Mutations require 'user.manage' (owner has it via seed; other roles can be granted it too). */
const canManagePermissions = (set: ReadonlySet<string>): boolean => set.has('user.manage');

export const permissionRoutes = new Elysia({ prefix: '/permissions' })
  .use(auth)
  // Catalog for the checkbox matrix
  .get(
    '/',
    async ({ user }) => {
      try {
        const me = requireUser(user);
        return ok({
          resources: resourceGroup,
          labels: PERMISSION_LABEL,
          selected: [...me.permissions],
        });
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // Roles for the left column
  .get(
    '/roles',
    async ({ user }) => {
      try {
        requireUser(user);
        const rows = await db
          .select({ id: schema.roles.id, name: schema.roles.name })
          .from(schema.roles)
          .orderBy(asc(schema.roles.name));
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // Current grants for one role
  .get(
    '/role/:roleId',
    async ({ params, user }) => {
      try {
        const me = requireUser(user);
        if (!canManagePermissions(me.permissions)) throw Errors.forbidden();
        const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, params.roleId) });
        if (!role) throw Errors.notFound('Role tidak ditemukan');
        const codes = await getRolePermissionCodes(params.roleId);
        return ok({ role: { id: role.id, name: role.name }, codes: [...codes] });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ roleId: t.String({ format: 'uuid' }) }) },
  )
  // Replace the full permission set of a role
  .put(
    '/role/:roleId',
    async ({ params, body, user, request }) => {
      try {
        const me = requireUser(user);
        if (!canManagePermissions(me.permissions)) throw Errors.forbidden();

        const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, params.roleId) });
        if (!role) throw Errors.notFound('Role tidak ditemukan');
        // Owner's own set is seeded with all codes; editing it via UI is blocked to
        // prevent accidental lockout, which keeps the DB authoritative without a
        // runtime `owner => allow all` rule.
        if (role.name === 'owner') throw Errors.forbidden('Owner permissions are locked (seeded with all codes)');

        // Validate all codes against the catalog (role_permissions has FK to permissions.code)
        const validCodes = new Set<string>(ROLE_PERMISSION_CODES);
        const invalid = body.codes.filter((c) => !validCodes.has(c));
        if (invalid.length > 0) throw Errors.validation(`Permission tidak valid: ${invalid.join(', ')}`);
        const codes = [...new Set(body.codes)] as PermissionCode[];

        await db.transaction(async (tx) => {
          await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.role_id, params.roleId));
          if (codes.length > 0) {
            await tx
              .insert(schema.rolePermissions)
              .values(codes.map((code) => ({ role_id: params.roleId, permission_code: code })));
          }
          await writeAudit(
            {
              storeId: me.storeId,
              userId: me.userId,
              action: 'UPDATE_ROLE_PERMISSIONS',
              entityType: 'role',
              entityId: params.roleId,
              metadata: { role: role.name, permissions: codes },
              ip: request.headers.get('x-forwarded-for'),
              userAgent: request.headers.get('user-agent'),
            },
            tx,
          );
        });

        // The role's permission set changed -> drop cache so guards see it immediately
        invalidatePermissionCache(params.roleId);
        return ok({ role: { id: role.id, name: role.name }, codes });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ roleId: t.String({ format: 'uuid' }) }),
      body: t.Object({ codes: t.Array(t.String()) }),
    },
  );
