/** Standard pagination + response helpers (PRD 19). */
import { sql, type SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { AppError } from './errors';

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [k: string]: unknown;
}

export interface PaginationParams {
  page?: unknown;
  limit?: unknown;
  maxLimit?: number;
}

export const parsePagination = ({ page, limit, maxLimit = 100 }: PaginationParams) => {
  const p = Math.max(1, Number.parseInt(String(page ?? '1'), 10) || 1);
  const l = Math.min(maxLimit, Math.max(1, Number.parseInt(String(limit ?? '20'), 10) || 20));
  return { page: p, limit: l, offset: (p - 1) * l };
};

export const paginationMeta = (page: number, limit: number, total: number): Meta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** Portable COUNT(*) over the same where clause used for the page query. */
export async function countWhere(table: PgTable, where: SQL | undefined): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
  return rows[0]?.count ?? 0;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const ok = (data: unknown, meta?: Meta): Response =>
  json(meta ? { success: true, data, meta } : { success: true, data });

export const fail = (error: AppError): Response =>
  json({ success: false, error: { code: error.code, message: error.message } }, error.status);

export const failRaw = (code: string, message: string, status = 400): Response =>
  json({ success: false, error: { code, message } }, status);

/** Never leak stack traces in production (PRD 20). */
export function handleRouteError(err: unknown): Response {
  if (err instanceof AppError) return fail(err);
  if (err instanceof Response) return err;
  console.error('[unhandled]', err);
  const isProd = process.env.NODE_ENV === 'production';
  return failRaw('INTERNAL_ERROR', isProd ? 'Terjadi kesalahan internal' : `Internal error: ${String(err)}`, 500);
}
