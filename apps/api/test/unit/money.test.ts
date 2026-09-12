import { describe, expect, test } from 'bun:test';
import { computeTotals, toCents, fromCents, changeCents, prorateDiscount, formatIDR, lineSubtotalCents } from '../../src/lib/money';

describe('money', () => {
  test('toCents/fromCents round-trip without float drift', () => {
    expect(toCents('3500')).toBe(350000);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30 cents
    expect(fromCents(350000)).toBe('3500.00');
  });

  test('formatIDR uses Indonesian separators', () => {
    expect(formatIDR(25000)).toBe('Rp 25.000');
    expect(formatIDR('1234567.89')).toBe('Rp 1.234.568');
  });

  test('lineSubtotal: unit_price x qty - discount', () => {
    // 3500 x 3 - 500 = 10000 -> 1000000 cents
    expect(lineSubtotalCents({ unitPriceCents: toCents(3500), quantity: 3, discountCents: toCents(500) })).toBe(1000000);
  });

  test('computeTotals: PRD 29 formula', () => {
    // 2 lines: 3500x2, 4000x1 => subtotal 11000
    const lines = [
      { unitPriceCents: toCents(3500), quantity: 2, discountCents: 0 },
      { unitPriceCents: toCents(4000), quantity: 1, discountCents: 0 },
    ];
    const t = computeTotals(lines, 0, 0);
    expect(t.subtotal).toBe(toCents(11000));
    expect(t.grandTotal).toBe(toCents(11000));
  });

  test('computeTotals with discount and tax (PRD 29)', () => {
    // subtotal 11000, discount 1000 => taxable 10000, tax 11% => 1100, grand 11100
    const lines = [{ unitPriceCents: toCents(11000), quantity: 1, discountCents: 0 }];
    const t = computeTotals(lines, toCents(1000), 11);
    expect(t.subtotal).toBe(1100000);
    expect(t.discount).toBe(100000);
    expect(t.tax).toBe(110000);
    expect(t.grandTotal).toBe(1110000);
  });

  test('change = paid - total (PRD 6.4)', () => {
    expect(changeCents(toCents(50000), toCents(43500))).toBe(toCents(6500));
  });

  test('prorateDiscount distributes remainder on last line', () => {
    const shares = prorateDiscount(toCents(100), [toCents(10), toCents(10), toCents(10)]);
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBe(toCents(100)); // no cents lost
    // first two get equal share, last gets remainder
    expect(shares[0]).toBe(shares[1]);
  });

  test('prorateDiscount clamps to zero when discount is zero', () => {
    expect(prorateDiscount(0, [100, 200]).every((v) => v === 0)).toBe(true);
  });
});
