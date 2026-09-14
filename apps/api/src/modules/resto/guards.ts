/** Resto feature guards (Fase 1): gate API routes by the active store's business
 * type. Feature access is double-layered — menus are hidden client-side AND the
 * API rejects (the API is the security boundary, same principle as permissions). */
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { stores } from '../../db/schema';
import { Errors } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { requireUser } from '../../middleware/auth';
import type { BusinessType } from '../../db/schema';

/** Small TTL cache — business_type changes rarely and /menus/my + every resto call
 * would otherwise hit the stores table. Invalidated on settings update. */
const TTL_MS = 60_000;
const cache = new Map<string, { value: BusinessType; expiresAt: number }>();

export async function getBusinessType(storeId: string): Promise<BusinessType> {
  const hit = cache.get(storeId);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;
  const [row] = await db.select({ business_type: stores.business_type }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!row) throw Errors.notFound('Toko tidak ditemukan');
  cache.set(storeId, { value: row.business_type, expiresAt: now + TTL_MS });
  return row.business_type;
}

/** Called after Store Settings changes so type changes apply immediately. */
export function invalidateBusinessTypeCache(storeId?: string): void {
  if (storeId) cache.delete(storeId);
  else cache.clear();
}

export async function requireBusinessType(user: AuthUser | null, allowed: BusinessType[]): Promise<AuthUser> {
  const auth = requireUser(user);
  const type = await getBusinessType(auth.storeId);
  if (!allowed.includes(type)) {
    throw Errors.forbidden(`Fitur ini tidak tersedia untuk toko bertipe ${type}`);
  }
  return auth;
}
