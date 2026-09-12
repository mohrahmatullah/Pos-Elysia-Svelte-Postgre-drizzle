/** Audit log read API (PRD 11) — owner only, cashier cannot view or modify. */
import Elysia, { t } from 'elysia';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { auditLogs, users } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';

export const auditRoutes = new Elysia({ prefix: '/audit-logs' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_AUDIT_LOG');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(auditLogs.store_id, auth.storeId)];
        if (query.action) conditions.push(eq(auditLogs.action, query.action));
        if (query.user_id) conditions.push(eq(auditLogs.user_id, query.user_id));
        if (query.from) conditions.push(gte(auditLogs.created_at, new Date(`${query.from}T00:00:00`)));
        const where = and(...conditions);
        const rows = await db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entity_type: auditLogs.entity_type,
            entity_id: auditLogs.entity_id,
            metadata: auditLogs.metadata,
            ip_address: auditLogs.ip_address,
            user_agent: auditLogs.user_agent,
            created_at: auditLogs.created_at,
            user_name: users.name,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.user_id, users.id))
          .where(where)
          .orderBy(desc(auditLogs.created_at))
          .limit(limit)
          .offset(offset);
        const count = await countWhere(auditLogs, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      query: t.Optional(
        t.Object({
          action: t.Optional(t.String()),
          user_id: t.Optional(t.String()),
          from: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      ),
    },
  );
