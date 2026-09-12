/** Auth routes (PRD 18): login, logout, refresh, me. Rate limited (PRD 25). */
import Elysia, { t } from 'elysia';
import { login, logout, refresh } from './service';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requireUser } from '../../middleware/auth';
import { writeAudit } from '../../lib/audit';

/** Simple in-memory rate limiter for auth endpoints (PRD 25). */
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function rateLimit(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    throw new Response(JSON.stringify({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak percobaan. Coba lagi nanti.' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  }
}

export const authRoutes = new Elysia({ prefix: '/auth', tags: ['auth'] })
  .use(auth)
  .post(
    '/login',
    async ({ body, request }) => {
      const ip = request.headers.get('x-forwarded-for') ?? 'local';
      rateLimit(ip);
      try {
        const result = await login(body.email, body.password);
        await writeAudit({
          storeId: result.user.storeId,
          userId: result.user.id,
          action: 'LOGIN',
          entityType: 'user',
          entityId: result.user.id,
          ip,
          userAgent: request.headers.get('user-agent'),
        });
        return ok(result);
      } catch (err) {
        if ((err as Error).message?.includes('salah')) {
          await writeAudit({
            storeId: '',
            userId: null,
            action: 'LOGIN_FAILED',
            entityType: 'user',
            metadata: { email: body.email },
            ip,
            userAgent: request.headers.get('user-agent'),
          }).catch(() => undefined);
        }
        throw err;
      }
    },
    {
      body: t.Object({ email: t.String({ format: 'email' }), password: t.String({ minLength: 1 }) }),
    },
  )
  .post(
    '/refresh',
    async ({ body }) => {
      const result = await refresh(body.refresh_token);
      return ok(result);
    },
    { body: t.Object({ refresh_token: t.String() }) },
  )
  .post(
    '/logout',
    async ({ body, user, request }) => {
      const auth = requireUser(user);
      await logout(body?.refresh_token ?? null, auth.sessionId);
      await writeAudit({
        storeId: auth.storeId,
        userId: auth.userId,
        action: 'LOGOUT',
        entityType: 'user',
        entityId: auth.userId,
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return ok({ logged_out: true });
    },
    { body: t.Optional(t.Object({ refresh_token: t.Optional(t.String()) })) },
  )
  .get('/me', ({ user }) => {
    const auth = requireUser(user);
    return ok({
      user_id: auth.userId,
      store_id: auth.storeId,
      role: auth.role,
      session_id: auth.sessionId,
    });
  });
