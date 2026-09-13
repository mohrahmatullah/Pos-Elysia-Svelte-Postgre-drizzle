import { describe, expect, test } from 'bun:test';
import { ROLE_PERMISSIONS } from '../../src/lib/permissions';
import { ROLE_PERMISSION_CODES } from '../../src/db/schema';

const set = (role: string) => new Set<string>(ROLE_PERMISSIONS[role] ?? []);

describe('permission seed defaults', () => {
  test('cashier: POS-focused set (PRD 25)', () => {
    const s = set('cashier');
    expect(s.has('sales.create')).toBe(true);
    expect(s.has('product.view')).toBe(true);
    expect(s.has('customer.view')).toBe(true);
    expect(s.has('report.view')).toBe(true);
  });

  test('cashier cannot manage users, settings, audit, or adjust stock', () => {
    const s = set('cashier');
    expect(s.has('user.manage')).toBe(false);
    expect(s.has('settings.manage')).toBe(false);
    expect(s.has('audit.view')).toBe(false);
    expect(s.has('inventory.adjust')).toBe(false);
    expect(s.has('inventory.opname')).toBe(false);
    expect(s.has('sales.cancel')).toBe(false);
  });

  test('manager: operational set, but no user management', () => {
    const s = set('manager');
    expect(s.has('product.create')).toBe(true);
    expect(s.has('product.update')).toBe(true);
    expect(s.has('product.delete')).toBe(true);
    expect(s.has('inventory.adjust')).toBe(true);
    expect(s.has('sales.cancel')).toBe(true);
    expect(s.has('sales.return')).toBe(true);
    expect(s.has('settings.manage')).toBe(true);
    expect(s.has('user.manage')).toBe(false);
    expect(s.has('audit.view')).toBe(false);
  });

  test('owner is seeded with every catalog permission (explicit rows, not a runtime rule)', () => {
    const s = set('owner');
    for (const code of ROLE_PERMISSION_CODES) {
      expect(s.has(code)).toBe(true);
    }
  });

  test('catalog contains all agreed resource.action codes', () => {
    const codes = new Set<string>(ROLE_PERMISSION_CODES);
    for (const code of [
      'product.view',
      'product.create',
      'product.update',
      'product.delete',
      'inventory.view',
      'inventory.adjust',
      'inventory.opname',
      'sales.view',
      'sales.create',
      'sales.cancel',
      'sales.return',
      'report.view',
      'user.manage',
      'settings.manage',
    ]) {
      expect(codes.has(code)).toBe(true);
    }
  });
});
