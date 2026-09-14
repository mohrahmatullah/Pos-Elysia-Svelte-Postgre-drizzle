/** Permission engine: compile-time typed codes, DB-backed runtime checks (PRD 25). */
export type { PermissionCode } from '../db/schema';

import { ROLE_PERMISSION_CODES, type PermissionCode } from '../db/schema';

/**
 * Role -> permission codes defaults. Used ONLY to seed the DB and as a fallback for
 * legacy access tokens issued before role_id existed in the JWT. The DB is the
 * runtime source of truth — edit permissions via the Role & Permission UI, not here.
 */
export const ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  owner: ROLE_PERMISSION_CODES,
  manager: [
    'dashboard.view',
    'product.view',
    'product.create',
    'product.update',
    'product.delete',
    'category.view',
    'category.create',
    'category.update',
    'category.delete',
    'inventory.view',
    'inventory.adjust',
    'inventory.opname',
    'sales.view',
    'sales.create',
    'sales.cancel',
    'sales.return',
    'customer.view',
    'customer.create',
    'customer.update',
    'customer.delete',
    'settings.manage',
    'report.view',
    // channel access: both POS types (hybrid stores)
    'retail.manage',
    'resto.view',
    'resto.order',
    'resto.settle',
    'kitchen.view',
    'table.manage',
  ] as const,
  cashier: [
    'dashboard.view',
    'product.view',
    'category.view',
    'inventory.view',
    'sales.view',
    'sales.create',
    'sales.return',
    'customer.view',
    'customer.create',
    'customer.update',
    'report.view',
    // channel access: retail POS + resto order taking (no settle — kasir only pays)
    'retail.manage',
    'resto.view',
    'resto.order',
  ] as const,
};
