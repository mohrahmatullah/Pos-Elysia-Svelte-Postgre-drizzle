/** DB-backed permission helpers (PRD 25): source of truth after seeding. */
import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { permissions, rolePermissions } from './schema';
import type { PermissionCode } from './schema';
import { ROLE_PERMISSION_CODES, PERMISSION_LABEL } from './schema';
export const permissionsSelect = {
  code: permissions.code,
  resource: permissions.resource,
  action: permissions.action,
  label: permissions.label,
};
export const rolePermissionsSelect = {
  id: rolePermissions.id,
  permission_code: rolePermissions.permission_code,
};
export async function listPermissions() {
  return db.select().from(permissions).orderBy(permissions.resource, permissions.action);
}

/**
 * Sync the static permission catalog (schema ROLE_PERMISSION_CODES + PERMISSION_LABEL)
 * into the `permissions` table. Idempotent: inserts missing codes, updates label/resource
 * of existing ones. The DB stays the runtime source of truth; this only keeps the catalog
 * complete so role_permissions FKs resolve.
 */
export async function upsertPermissionCatalog(): Promise<void> {
  const rows = ROLE_PERMISSION_CODES.map((code) => {
    const [resource, action] = code.split('.');
    return { code, resource, action, label: PERMISSION_LABEL[code] };
  });
  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({
      target: permissions.code,
      set: { label: sql`excluded.label`, resource: sql`excluded.resource`, action: sql`excluded.action` },
    });
}
/** Permission codes granted to a role, read straight from the DB.
 * Returned as a plain string set: dynamic menus can create new codes at runtime,
 * so the set is not limited to the compile-time seed catalog. */
export async function buildPermissionSet(roleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ code: permissions.code })
    .from(permissions)
    .innerJoin(rolePermissions, eq(rolePermissions.permission_code, permissions.code))
    .where(eq(rolePermissions.role_id, roleId));
  return new Set(rows.map((r) => r.code));
}
export async function getRolePermissionCodes(roleId: string): Promise<Set<string>> {
  return buildPermissionSet(roleId);
}
