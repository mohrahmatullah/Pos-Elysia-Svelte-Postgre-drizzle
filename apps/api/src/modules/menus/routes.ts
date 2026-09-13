/** Dynamic menu management (DB-driven sidebar, grouped two levels deep).
 * - Parent rows (href null) are GROUP HEADERS: no link, visible when >=1 child visible.
 * - Children carry a permission; children of permission-less group headers inherit the
 *   group's permission as their gate.
 * - Mutations require granular codes (menu.view / menu.create / menu.update /
 *   menu.delete). New permission codes are auto-created in the catalog and
 *   auto-granted to the owner role.
 */
import Elysia, { t } from 'elysia';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requireUser, requirePerm } from '../../middleware/auth';
import { writeAudit } from '../../lib/audit';
import { Errors } from '../../lib/errors';
import { ensurePermission, removeOrphanedMenuPermission } from '../../db/permission-catalog';
import { buildPermissionSet } from '../../db/permission';

/** A menu with a link must carry a permission (group headers without links may omit it). */
function validateMenu(input: { href?: string | null; permission_code?: string | null }, existing?: { href: string | null; permission_code: string | null }): void {
  const href = input.href !== undefined ? input.href : existing?.href;
  const perm = input.permission_code !== undefined ? input.permission_code : existing?.permission_code;
  const hasLink = Boolean(href && href.trim());
  const hasPerm = Boolean(perm && perm.trim());
  if (hasLink && !hasPerm) {
    throw Errors.validation('Menu dengan link wajib punya permission_code (atau jadikan group header tanpa link)');
  }
}

export const menuRoutes = new Elysia({ prefix: '/menus' })
  .use(auth)
  // Sidebar payload: ordered groups with permission-filtered children. Permissions
  // resolve fresh from the DB so brand-new menus appear without re-login.
  .get(
    '/my',
    async ({ user }) => {
      try {
      const me = requireUser(user);
      const fresh = await buildPermissionSet(me.roleId);

        const rows = await db
          .select({
            id: schema.menus.id,
            label: schema.menus.label,
            href: schema.menus.href,
            icon: schema.menus.icon,
            parent_id: schema.menus.parent_id,
            permission_code: schema.menus.permission_code,
            sort_order: schema.menus.sort_order,
          })
          .from(schema.menus)
          .where(eq(schema.menus.active, true))
          .orderBy(asc(schema.menus.sort_order), asc(schema.menus.label));

        const byParent = new Map<string | null, typeof rows>();
        for (const row of rows) {
          const key = row.parent_id ?? null;
          byParent.set(key, [...(byParent.get(key) ?? []), row]);
        }

        const canSee = (code: string | null): boolean => Boolean(code && fresh.has(code));

        const groups: {
          id: string;
          label: string;
          icon: string | null;
          href: string | null;
          children: { id: string; label: string; href: string; icon: string | null }[];
        }[] = [];

        for (const parent of byParent.get(null) ?? []) {
          const children = (byParent.get(parent.id) ?? []).filter((c) => {
            // Child is gated by its own permission, or falls back to the group's.
            return canSee(c.permission_code) || canSee(parent.permission_code);
          });

          if (parent.href) {
            // Link-bearing parent: standalone item that may nest children beneath it.
            if (!canSee(parent.permission_code) && children.length === 0) continue;
            groups.push({
              id: parent.id,
              label: parent.label,
              icon: parent.icon,
              href: parent.href,
              children: children.map((c) => ({ id: c.id, label: c.label, href: c.href!, icon: c.icon })),
            });
          } else {
            // Pure group header: only visible when at least one child is visible.
            if (children.length === 0) continue;
            groups.push({
              id: parent.id,
              label: parent.label,
              icon: parent.icon,
              href: null,
              children: children.map((c) => ({ id: c.id, label: c.label, href: c.href!, icon: c.icon })),
            });
          }
        }

        return ok(groups);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // Admin list (including inactive)
  .get(
    '/',
    async ({ user }) => {
      try {
        requirePerm(user, 'menu.view');
        const rows = await db.select().from(schema.menus).orderBy(asc(schema.menus.sort_order), asc(schema.menus.label));
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
        const me = requirePerm(user, 'menu.create');
        validateMenu(body);

        let permission_code: string | null = null;
        if (body.permission_code?.trim()) {
          await ensurePermission(body.permission_code.trim(), `Menu: ${body.label.trim()}`);
          permission_code = body.permission_code.trim();
        }

        const [created] = await db
          .insert(schema.menus)
          .values({
            label: body.label.trim(),
            href: body.href?.trim() || null,
            icon: body.icon?.trim() || null,
            parent_id: body.parent_id ?? null,
            permission_code,
            sort_order: body.sort_order ?? 0,
            active: body.active ?? true,
          })
          .returning();
        if (!created) throw Errors.conflict(`Menu dengan href "${body.href}" sudah ada`);

        await writeAudit({
          storeId: me.storeId,
          userId: me.userId,
          action: 'CREATE_MENU',
          entityType: 'menu',
          entityId: created.id,
          metadata: { label: created.label, href: created.href, permission_code: created.permission_code, parent_id: created.parent_id },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });

        return ok(created);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        label: t.String({ minLength: 1, maxLength: 80 }),
        href: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
        icon: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        parent_id: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
        permission_code: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        sort_order: t.Optional(t.Number({ minimum: 0 })),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const me = requirePerm(user, 'menu.update');
        const [existing] = await db.select().from(schema.menus).where(eq(schema.menus.id, params.id)).limit(1);
        if (!existing) throw Errors.notFound('Menu tidak ditemukan');

        if (body.permission_code?.trim()) {
          await ensurePermission(body.permission_code.trim(), `Menu: ${body.label ?? existing.label}`);
        }
        validateMenu(body, existing);

        const oldCode = existing.permission_code;
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.label !== undefined) patch.label = body.label.trim();
        if (body.href !== undefined) patch.href = body.href?.trim() || null;
        if (body.icon !== undefined) patch.icon = body.icon?.trim() || null;
        if (body.parent_id !== undefined) patch.parent_id = body.parent_id;
        if (body.permission_code !== undefined) patch.permission_code = body.permission_code?.trim() || null;
        if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
        if (body.active !== undefined) patch.active = body.active;

        const [updated] = await db.update(schema.menus).set(patch).where(eq(schema.menus.id, params.id)).returning();
        if (!updated) throw Errors.notFound('Menu tidak ditemukan');

        // If the menu switched permission codes, drop the old code once no other
        // menu uses it — keeps the catalog free of orphaned test codes.
        if (oldCode && oldCode !== updated.permission_code) {
          await removeOrphanedMenuPermission(oldCode, updated.id);
        }

        await writeAudit({
          storeId: me.storeId,
          userId: me.userId,
          action: 'UPDATE_MENU',
          entityType: 'menu',
          entityId: params.id,
          metadata: { fields: Object.keys(body) },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });

        return ok(updated);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        label: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        href: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
        icon: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        parent_id: t.Optional(t.Nullable(t.String({ format: 'uuid' }))),
        permission_code: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        sort_order: t.Optional(t.Number({ minimum: 0 })),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    '/:id',
    async ({ params, user, request }) => {
      try {
        const me = requirePerm(user, 'menu.delete');
        // Deleting a group header cascades to its children (FK ON DELETE cascade).
        const [deleted] = await db
          .delete(schema.menus)
          .where(eq(schema.menus.id, params.id))
          .returning({ id: schema.menus.id, label: schema.menus.label, permission_code: schema.menus.permission_code });
        if (!deleted) throw Errors.notFound('Menu tidak ditemukan');

        // Drop the menu's permission code if no other menu uses it anymore.
        if (deleted.permission_code) {
          await removeOrphanedMenuPermission(deleted.permission_code);
        }

        await writeAudit({
          storeId: me.storeId,
          userId: me.userId,
          action: 'DELETE_MENU',
          entityType: 'menu',
          entityId: params.id,
          metadata: { label: deleted.label },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });

        return ok({ deleted: true, id: params.id, label: deleted.label });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
