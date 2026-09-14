/** Elysia auth plugin: JWT verification + permission guard (PRD 5.1 / 25).
 * Permissions are resolved from the DB (source of truth) on every request via role_id
 * from the JWT. The static ROLE_PERMISSIONS map is only a fallback for legacy tokens
 * without role_id (until their access token expires).
 */
import Elysia from 'elysia';
import { and, eq } from 'drizzle-orm';
import { verifyAccessToken, type AccessPayload } from '../lib/jwt';
import { config } from '../config';
import { Errors } from '../lib/errors';
import { buildPermissionSet } from '../db/permission';
import { ROLE_PERMISSIONS, type PermissionCode } from '../lib/permissions';
import { db, schema } from '../db';

export interface AuthUser {
  userId: string;
  storeId: string;
  role: string;
  roleId: string;
  sessionId: string;
  permissions: ReadonlySet<string>;
}

/** Small TTL cache: role_id -> permission codes. Keeps request overhead to one query
 * per role per 60s even with many concurrent requests. Invalidated on permission save. */
const PERM_CACHE_TTL_MS = 60_000;
const permCache = new Map<string, { set: ReadonlySet<string>; expiresAt: number }>();

export async function loadPermissionsForRole(roleId: string, roleName: string): Promise<ReadonlySet<string>> {
  const cached = permCache.get(roleId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.set;

  let set: ReadonlySet<string>;
  try {
    // DB is the source of truth — an empty set means the role truly has no permissions
    // (e.g. every checkbox was unchecked in the UI).
    set = await buildPermissionSet(roleId);
  } catch {
    // DB unavailable: prefer stale cache, then static seed defaults.
    if (cached) return cached.set;
    set = new Set(ROLE_PERMISSIONS[roleName] ?? []);
  }

  permCache.set(roleId, { set, expiresAt: now + PERM_CACHE_TTL_MS });
  return set;
}

/** Called after permission mutations so role changes take effect immediately. */
export function invalidatePermissionCache(roleId?: string): void {
  if (roleId) permCache.delete(roleId);
  else permCache.clear();
}

/** Shared auth plugin — global scope so `user` propagates to every instance that uses it. */
export const auth = new Elysia({ name: 'auth' }).derive({ as: 'global' }, async ({ request }) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return { user: null };

  const payload: AccessPayload | null = await verifyAccessToken(header.slice(7), config.jwtSecret);
  if (!payload) return { user: null };

  // Legacy tokens (issued before role_id existed) fall back to static role defaults.
  const permissions = payload.role_id
    ? await loadPermissionsForRole(payload.role_id, payload.role)
    : new Set(ROLE_PERMISSIONS[payload.role] ?? []);

  // Multi-store: the effective store is the token's active store when it is still a
  // valid membership; otherwise fall back to the user's home store. Keeps old tokens
  // working and blocks switching to a store the user does not belong to.
  let storeId = payload.store_id;
  if (payload.active_store_id && payload.active_store_id !== payload.store_id) {
    const [member] = await db
      .select({ id: schema.userStores.id })
      .from(schema.userStores)
      .where(
        and(
          eq(schema.userStores.user_id, payload.sub),
          eq(schema.userStores.store_id, payload.active_store_id),
        ),
      )
      .limit(1);
    if (member) storeId = payload.active_store_id;
  }

  return {
    user: {
      userId: payload.sub,
      storeId,
      role: payload.role,
      roleId: payload.role_id,
      sessionId: payload.sid,
      permissions,
    },
  };
});

/** Throw-on-failure guards. */
export const requireUser = (user: AuthUser | null): AuthUser => {
  if (!user) throw Errors.unauthorized();
  return user;
};

export const requirePerm = (user: AuthUser | null, permission: PermissionCode): AuthUser => {
  const u = requireUser(user);
  if (!u.permissions.has(permission)) throw Errors.forbidden();
  return u;
};

/** Check if user has a permission (returns boolean, doesn't throw). */
export const hasRolePermission = (user: AuthUser | null, permission: PermissionCode): boolean => {
  if (!user) return false;
  return user.permissions.has(permission);
};

/** Stores the user belongs to (for the switcher + login/me payload).
 * Users without explicit memberships (e.g. created before multi-store, or via the
 * Users UI) fall back to their home store so the store name always shows. */
export async function loadUserStores(userId: string) {
  const rows = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      active: schema.stores.active,
    })
    .from(schema.userStores)
    .innerJoin(schema.stores, eq(schema.userStores.store_id, schema.stores.id))
    .where(eq(schema.userStores.user_id, userId))
    .orderBy(schema.stores.name);
  if (rows.length > 0) return rows;

  const [home] = await db
    .select({ id: schema.stores.id, name: schema.stores.name, active: schema.stores.active })
    .from(schema.users)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.users.store_id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  return home ? [home] : [];
}
