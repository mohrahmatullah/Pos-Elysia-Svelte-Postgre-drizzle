/** Dynamic permission catalog management.
 * New permission codes (e.g. from a new menu) are created here and auto-granted to the
 * owner role so the admin who created the menu can actually use it immediately.
 */
import { eq } from 'drizzle-orm';
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

/** Validate codes exist (for bulk replace operations). */
export async function allPermissionCodes(): Promise<Set<string>> {
  const rows = await db.select({ code: schema.permissions.code }).from(schema.permissions);
  return new Set(rows.map((r) => r.code));
}
