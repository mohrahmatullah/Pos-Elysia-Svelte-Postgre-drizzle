/**
 * Money math using integer cents (rupiah has no subunit in practice, but we keep
 * 2-decimal precision to be safe). All pricing runs server-side per PRD 29/42.
 * Never use floating point arithmetic for money.
 */

export const toCents = (amount: number | string): number => {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${amount}`);
  return Math.round(n * 100);
};

export const fromCents = (cents: number): string => (cents / 100).toFixed(2);

/** Format IDR for display, e.g. "Rp 25.000" (PRD 30) */
export const formatIDR = (amount: number | string): string => {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const rounded = Math.round(n);
  return `Rp ${rounded.toLocaleString('id-ID')}`;
};

export interface LineCalc {
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
  taxRatePercent: number;
}

/** item_subtotal = unit_price x quantity - item discount (PRD 29) */
export const lineSubtotalCents = ({ unitPriceCents, quantity, discountCents }: Omit<LineCalc, 'taxRatePercent'>): number =>
  unitPriceCents * quantity - discountCents;

/**
 * Full pricing pipeline (PRD 29):
 *   subtotal = SUM(item_subtotal)
 *   taxable  = subtotal - order discount
 *   tax      = taxable x tax_rate
 *   grand    = taxable + tax
 */
export function computeTotals(
  lines: Omit<LineCalc, 'taxRatePercent'>[],
  orderDiscountCents: number,
  defaultTaxRatePercent: number,
) {
  let subtotal = 0;
  let hasLineRates = false;
  for (const line of lines) {
    subtotal += lineSubtotalCents(line);
    if ('taxRatePercent' in line && (line as LineCalc).taxRatePercent > 0) hasLineRates = true;
  }
  const discount = Math.min(orderDiscountCents, subtotal);
  const taxable = subtotal - discount;
  let tax = 0;
  if (hasLineRates) {
    // Per-line tax mode: order discount must already be prorated into lines by the caller.
    for (const line of lines) {
      const lineTotal = lineSubtotalCents(line);
      const rate = 'taxRatePercent' in line ? (line as LineCalc).taxRatePercent : defaultTaxRatePercent;
      if (rate > 0 && lineTotal > 0) tax += Math.round((lineTotal * rate) / 100);
    }
  } else if (defaultTaxRatePercent > 0 && taxable > 0) {
    // Aggregate single-rate mode (PRD 29): tax on subtotal - discount.
    tax = Math.round((taxable * defaultTaxRatePercent) / 100);
  }
  const grandTotal = taxable + tax;
  return { subtotal, discount, tax, grandTotal };
}

/** change = amount_paid - grand_total (PRD 6.4) */
export const changeCents = (amountPaidCents: number, grandTotalCents: number): number =>
  amountPaidCents - grandTotalCents;

/** Prorates an order-level discount across lines proportional to line value. */
export function prorateDiscount(orderDiscountCents: number, lineTotals: number[]): number[] {
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (sum <= 0 || orderDiscountCents <= 0) return lineTotals.map(() => 0);
  let allocated = 0;
  const result = lineTotals.map((v, i) => {
    if (i === lineTotals.length - 1) return orderDiscountCents - allocated;
    const share = Math.round((v / sum) * orderDiscountCents);
    allocated += share;
    return share;
  });
  return result;
}
