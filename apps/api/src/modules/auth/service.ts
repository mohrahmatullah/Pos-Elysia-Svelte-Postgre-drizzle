/** Auth service (PRD 5.1): login, refresh rotation, logout, session revocation. */
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { roles, sessions, users } from '../../db/schema';
import { verifyPassword } from '../../lib/password';
import { signAccessToken, generateRefreshToken, hashToken } from '../../lib/jwt';
import { Errors } from '../../lib/errors';
import { config } from '../../config';

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
    { sub: row.id, sid: session.id, role: row.role, store_id: row.store_id },
    config.jwtSecret,
    config.accessTokenTtlMin,
  );

  return {
    accessToken,
    refreshToken,
    user: { id: row.id, name: row.name, email: row.email, role: row.role, storeId: row.store_id },
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const tokenHash = await hashToken(refreshToken);
  const [session] = await db
    .select({ id: sessions.id, user_id: sessions.user_id, expires_at: sessions.expires_at })
    .from(sessions)
    .where(
      and(eq(sessions.refresh_token_hash, tokenHash), isNull(sessions.revoked_at), gt(sessions.expires_at, new Date())),
    )
    .limit(1);
  if (!session) throw Errors.unauthorized('Refresh token invalid or expired');

  const [user] = await db
    .select({ id: users.id, status: users.status, store_id: users.store_id, role: roles.name })
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
    });
  });

  const accessToken = await signAccessToken(
    { sub: user.id, sid: session.id, role: user.role, store_id: user.store_id },
    config.jwtSecret,
    config.accessTokenTtlMin,
  );

  return { accessToken, refreshToken: newRefresh };
}

export async function logout(refreshToken: string | null, sessionId?: string): Promise<void> {
  if (refreshToken) {
    const tokenHash = await hashToken(refreshToken);
    await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.refresh_token_hash, tokenHash));
  } else if (sessionId) {
    await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, sessionId));
  }
}
