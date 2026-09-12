import { describe, expect, test } from 'bun:test';
import { hasPermission } from '../../src/lib/permissions';
import { validateCart } from '@pos/shared';
import { sanitizeMetadata } from '../../src/lib/audit';

describe('permissions', () => {
  test('cashier can create sale and read product (PRD 25)', () => {
    expect(hasPermission('cashier', 'CREATE_SALE')).toBe(true);
    expect(hasPermission('cashier', 'READ_PRODUCT')).toBe(true);
  });

  test('cashier can access dashboard and reports but not user management', () => {
    expect(hasPermission('cashier', 'READ_DASHBOARD')).toBe(true);
    expect(hasPermission('cashier', 'VIEW_REPORTS')).toBe(true);
    expect(hasPermission('cashier', 'STOCK_ADJUSTMENT')).toBe(false);
    expect(hasPermission('cashier', 'MANAGE_USERS')).toBe(false);
    expect(hasPermission('cashier', 'VIEW_AUDIT_LOG')).toBe(false);
    expect(hasPermission('cashier', 'SYSTEM_SETTINGS')).toBe(false);
  });

  test('manager can manage products and adjust stock but not manage users', () => {
    expect(hasPermission('manager', 'MANAGE_PRODUCT')).toBe(true);
    expect(hasPermission('manager', 'STOCK_ADJUSTMENT')).toBe(true);
    expect(hasPermission('manager', 'MANAGE_USERS')).toBe(false);
    expect(hasPermission('manager', 'SYSTEM_SETTINGS')).toBe(false);
  });

  test('owner can do everything', () => {
    expect(hasPermission('owner', 'MANAGE_USERS')).toBe(true);
    expect(hasPermission('owner', 'SYSTEM_SETTINGS')).toBe(true);
    expect(hasPermission('owner', 'VIEW_AUDIT_LOG')).toBe(true);
  });
});

describe('shared validation', () => {
  test('valid cart passes', () => {
    const errors = validateCart({ items: [{ product_id: 'x', quantity: 2 }] });
    expect(errors).toHaveLength(0);
  });

  test('empty cart and duplicate items rejected', () => {
    expect(validateCart({ items: [] }).length).toBeGreaterThan(0);
    const dup = validateCart({ items: [{ product_id: 'x', quantity: 1 }, { product_id: 'x', quantity: 1 }] });
    expect(dup.length).toBeGreaterThan(0);
  });
});

describe('audit metadata sanitization', () => {
  test('redacts sensitive keys (PRD 11)', () => {
    const clean = sanitizeMetadata({ password: 'secret', token: 'abc', name: 'Budi', grand_total: 100 })!;
    expect(clean['password']).toBe('[REDACTED]');
    expect(clean['token']).toBe('[REDACTED]');
    expect(clean['name']).toBe('Budi');
  });
});
