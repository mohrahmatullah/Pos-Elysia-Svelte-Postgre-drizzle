/** Auth service (PRD 5.1): login, refresh rotation, logout, session revocation. */
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { roles, sessions, stores, userStores, users } from '../../db/schema';
import { verifyPassword } from '../../lib/password';
import { signAccessToken, generateRefreshToken, hashToken } from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { config } from '../../config';
import { buildPermissionSet } from '../../db/permission';
import { loadUserStores } from '../../middleware/auth';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    storeId: string;
  };
  role: string;
  roleId: string;
  /** Filled by the route handler after login (DB-backed permission codes). */
  permissions?: string[];
  /** Multi-store: stores the user can work in (switcher). */
  stores?: { id: string; name: string; active: boolean }[];
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      password_hash: users.password_hash,
      store_id: users.store_id,
      role: roles.name,
      role_id: roles.id,
    })
    .from(users)
    .innerJoin(roles, eq(users.role_id, roles.id))
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  // Uniform error to avoid user enumeration (PRD 5.1 acceptance)
  if (!row || row.status !== 'active') throw Errors.unauthorized('Email atau password salah');
  const valid = await verifyPassword(row.password_hash, password);
  if (!valid) throw Errors.unauthorized('Email atau password salah');

  const refreshToken = generateRefreshToken();
  const tokenHash = await hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  const [session] = await db
    .insert(sessions)
    .values({ user_id: row.id, refresh_token_hash: tokenHash, expires_at: expiresAt })
    .returning({ id: sessions.id });

  const accessToken = await signAccessToken(
    { sub: row.id, sid: session.id, role: row.role, role_id: row.role_id, store_id: row.store_id },
    config.jwtSecret,
    config.accessTokenTtlMin,
  );

  // Multi-store: memberships for the switcher (home store first, then alphabetical).
  const stores = await loadUserStores(row.id);

  return {
    accessToken,
    refreshToken,
    user: { id: row.id, name: row.name, email: row.email, role: row.role, storeId: row.store_id },
    role: row.role,
    roleId: row.role_id,
    stores,
  };
}

/** Load the user's store memberships (id/name/active), home store first. */
export { loadUserStores } from '../../middleware/auth';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const tokenHash = await hashToken(refreshToken);
  const [session] = await db
    .select({
      id: sessions.id,
      user_id: sessions.user_id,
      expires_at: sessions.expires_at,
      active_store_id: sessions.active_store_id,
    })
    .from(sessions)
    .where(
      and(eq(sessions.refresh_token_hash, tokenHash), isNull(sessions.revoked_at), gt(sessions.expires_at, new Date())),
    )
    .limit(1);
  if (!session) throw Errors.unauthorized('Refresh token invalid or expired');

  const [user] = await db
    .select({ id: users.id, status: users.status, store_id: users.store_id, role: roles.name, role_id: roles.id })
    .from(users)
    .innerJoin(roles, eq(users.role_id, roles.id))
    .where(eq(users.id, session.user_id))
    .limit(1);
  if (!user || user.status !== 'active') throw Errors.unauthorized('User inactive');

  // Rotate: revoke old, issue new (PRD 25 — refresh token must be revocable)
  const newRefresh = generateRefreshToken();
  const newHash = await hashToken(newRefresh);
  const newExpiry = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, session.id));
    await tx.insert(sessions).values({
      user_id: session.user_id,
      refresh_token_hash: newHash,
      expires_at: newExpiry,
      active_store_id: session.active_store_id ?? null,
    });
  });

  const accessToken = await signAccessToken(
    {
      sub: user.id,
      sid: session.id,
      role: user.role,
      role_id: user.role_id,
      store_id: user.store_id,
      active_store_id: session.active_store_id ?? undefined,
    },
    config.jwtSecret,
    config.accessTokenTtlMin,
  );

  return { accessToken, refreshToken: newRefresh };
}

/** Multi-store: switch the active store for the current session. Validates the
 * membership, persists it on the session (refresh tokens keep working — the
 * middleware re-validates membership on every request), and returns a fresh
 * access token carrying the new active store. */
export async function switchStore(
  sessionId: string,
  userId: string,
  storeId: string,
): Promise<{ accessToken: string; store: { id: string; name: string } }> {
  const [store] = await db
    .select({ id: stores.id, name: stores.name, active: stores.active })
    .from(userStores)
    .innerJoin(stores, eq(stores.id, userStores.store_id))
    .where(and(eq(userStores.user_id, userId), eq(userStores.store_id, storeId)))
    .limit(1);
  if (!store) throw Errors.forbidden('Anda tidak terdaftar di toko ini');
  if (!store.active) throw Errors.validation('Toko tidak aktif');

  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revoked_at), gt(sessions.expires_at, new Date())))
    .limit(1);
  if (!session) throw Errors.unauthorized('Sesi tidak valid');

  await db.update(sessions).set({ active_store_id: storeId }).where(eq(sessions.id, sessionId));

  const [u] = await db
    .select({ id: users.id, status: users.status, store_id: users.store_id, role: roles.name, role_id: roles.id })
    .from(users)
    .innerJoin(roles, eq(users.role_id, roles.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || u.status !== 'active') throw Errors.unauthorized('User inactive');

  const accessToken = await signAccessToken(
    { sub: u.id, sid: sessionId, role: u.role, role_id: u.role_id, store_id: u.store_id, active_store_id: storeId },
    config.jwtSecret,
    config.accessTokenTtlMin,
  );

  return { accessToken, store: { id: store.id, name: store.name } };
}

export async function logout(refreshToken: string | null, sessionId?: string): Promise<void> {
  if (refreshToken) {
    const tokenHash = await hashToken(refreshToken);
    await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.refresh_token_hash, tokenHash));
  } else if (sessionId) {
    await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, sessionId));
  }
}
