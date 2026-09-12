/** Elysia auth plugin: JWT verification + permission guard (PRD 5.1 / 25). */
import Elysia from 'elysia';
import { verifyAccessToken } from '../lib/jwt';
import { config } from '../config';
import { hasPermission, type Permission } from '../lib/permissions';
import { Errors } from '../lib/errors';

export interface AuthUser {
  userId: string;
  storeId: string;
  role: string;
  sessionId: string;
}

/** Shared auth plugin — global scope so `user` propagates to every instance that uses it. */
export const auth = new Elysia({ name: 'auth' }).derive({ as: 'global' }, async ({ request }) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return { user: null };
  const payload = await verifyAccessToken(header.slice(7), config.jwtSecret);
  if (!payload) return { user: null };
  return {
    user: {
      userId: payload.sub,
      storeId: payload.store_id,
      role: payload.role,
      sessionId: payload.sid,
    } satisfies AuthUser,
  };
});

/** Throw-on-failure guards. */
export const requireUser = (user: AuthUser | null): AuthUser => {
  if (!user) throw Errors.unauthorized();
  return user;
};

export const requirePerm = (user: AuthUser | null, permission: Permission): AuthUser => {
  const u = requireUser(user);
  if (!hasPermission(u.role, permission)) throw Errors.forbidden();
  return u;
};
