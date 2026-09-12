import { describe, expect, test } from 'bun:test';
import { formatInvoiceNumber } from '../../src/modules/sales/service';

describe('invoice number (PRD 6.3)', () => {
  test('format INV-YYYYMMDD-NNNNNN', () => {
    const n = formatInvoiceNumber('INV', new Date(2026, 8, 12), 1);
    expect(n).toBe('INV-20260912-000001');
  });

  test('sequence is zero-padded to 6 digits', () => {
    expect(formatInvoiceNumber('INV', new Date(2026, 8, 12), 12345)).toBe('INV-20260912-012345');
  });
});
