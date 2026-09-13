/** Dynamic permission catalog management.
 * New permission codes (e.g. from a new menu) are created here and auto-granted to the
 * owner role so the admin who created the menu can actually use it immediately.
 */
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from './index';
import { PROTECTED_ROLE } from './schema';

/** Ensure a permission code exists in the catalog and is granted to the owner role.
 * Returns true if the code was newly created. */
export async function ensurePermission(code: string, label: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error('Permission code is required');

  const [created] = await db
    .insert(schema.permissions)
    .values({ code: trimmed, resource: 'menu', action: trimmed, label })
    .onConflictDoNothing({ target: schema.permissions.code })
    .returning({ id: schema.permissions.id });

  if (!created) return false;

  // Auto-grant to owner: keep the owner usable without a runtime `owner => allow all` rule.
  const [owner] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.name, PROTECTED_ROLE)).limit(1);
  if (owner) {
    await db
      .insert(schema.rolePermissions)
      .values({ role_id: owner.id, permission_code: trimmed })
      .onConflictDoNothing();
  }
  return true;
}

/**
 * Remove a menu-generated permission code (resource='menu') once NO menu uses it
 * anymore — e.g. after a menu was deleted or moved to another code. This keeps the
 * Role & Permission page free of leftover codes like `testfitur.view`.
 * Core (non-menu) codes are never touched by this cleanup.
 */
export async function removeOrphanedMenuPermission(code: string | null | undefined, excludeMenuId?: string): Promise<boolean> {
  const trimmed = code?.trim();
  if (!trimmed) return false;

  // Still referenced by another menu? Then it is not orphaned.
  const conditions = excludeMenuId
    ? and(eq(schema.menus.permission_code, trimmed), ne(schema.menus.id, excludeMenuId))
    : eq(schema.menus.permission_code, trimmed);
  const [inUse] = await db.select({ id: schema.menus.id }).from(schema.menus).where(conditions).limit(1);
  if (inUse) return false;

  // Only auto-created menu codes are removed (core catalog codes are protected).
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.permission_code, trimmed));
  await db.delete(schema.permissions).where(and(eq(schema.permissions.code, trimmed), eq(schema.permissions.resource, 'menu')));
  return true;
}

/**
 * Grant every catalog code the owner role does not have yet. Used by the seed after
 * the catalog is synced, so codes added in later releases (e.g. menu.*) reach the
 * owner without touching roles the admin has customized via the UI.
 */
export async function grantMissingPermissionsToOwner(): Promise<void> {
  const [owner] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.name, PROTECTED_ROLE)).limit(1);
  if (!owner) return;
  const codes = await allPermissionCodes();
  const have = await db
    .select({ code: schema.rolePermissions.permission_code })
    .from(schema.rolePermissions)
    .where(eq(schema.rolePermissions.role_id, owner.id));
  const missing = [...codes].filter((c) => !have.some((h) => h.code === c));
  if (missing.length === 0) return;
  await db
    .insert(schema.rolePermissions)
    .values(missing.map((code) => ({ role_id: owner.id, permission_code: code })))
    .onConflictDoNothing();
}

/** Validate codes exist (for bulk replace operations). */
export async function allPermissionCodes(): Promise<Set<string>> {
  const rows = await db.select({ code: schema.permissions.code }).from(schema.permissions);
  return new Set(rows.map((r) => r.code));
}
