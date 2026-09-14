/** Sales service (PRD 6.2, 26, 27, 29): atomic checkout, idempotency, stock locking. */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { payments, products, saleItems, sales, stockMovements, stores } from '../../db/schema';
import type { DiscountType } from '../../db/schema';
import { countWhere } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { computeTotals, toCents, fromCents, changeCents, prorateDiscount } from '../../lib/money';
import type { PaymentMethod } from '@pos/shared';

export interface CheckoutItemInput {
  product_id: string;
  quantity: number;
  discount?: number; // per-line discount in currency units
}

export interface CheckoutInput {
  items: CheckoutItemInput[];
  customer_id?: string | null;
  discount?: number; // explicit order-level discount in currency units (overrides store default)
  discount_type?: DiscountType; // 'PERCENT' -> input.discount is a % of subtotal
  payment: {
    method: PaymentMethod;
    amount_paid: number;
    reference_number?: string;
  };
  idempotencyKey?: string;
}

export interface Actor {
  userId: string;
  storeId: string;
}

/** Invoice number: INV-YYYYMMDD-NNNNNN unique per store (PRD 6.3). */
export function formatInvoiceNumber(prefix: string, date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(6, '0')}`;
}

/** Aggregates duplicate product lines so stock is checked against the true demand. */
function aggregateQuantity(items: CheckoutItemInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.product_id, (map.get(item.product_id) ?? 0) + item.quantity);
  return map;
}

async function nextInvoiceNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], storeId: string, prefix: string): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const likePattern = `${prefix}-${datePart}-%`;
  const [row] = await tx
    .select({ max_seq: sql<string>`COALESCE(MAX(SUBSTRING(${sales.invoice_number} FROM '[0-9]+$')), '0')` })
    .from(sales)
    .where(and(eq(sales.store_id, storeId), sql`${sales.invoice_number} LIKE ${likePattern}`));
  const seq = Number.parseInt(row?.max_seq ?? '0', 10) + 1;
  return formatInvoiceNumber(prefix, now, seq);
}

export async function checkout(input: CheckoutInput, actor: Actor) {
  if (!input.items?.length) throw Errors.validation('Cart tidak boleh kosong');
  if (input.items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) {
    throw Errors.validation('Quantity harus bilangan bulat positif');
  }
  if (input.items.some((i) => i.discount !== undefined && i.discount < 0)) {
    throw Errors.validation('Discount tidak boleh negatif');
  }

  // Idempotency (PRD 27): same key returns the original sale, never creates a duplicate.
  if (input.idempotencyKey) {
    const [existing] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.idempotency_key, input.idempotencyKey))
      .limit(1);
    if (existing) return { saleId: existing.id, idempotentReplay: true as const };
  }

  const result = await db.transaction(async (tx) => {
    // Lock store row to serialize invoice-number generation per store.
    await tx.execute(sql`SELECT id FROM stores WHERE id = ${actor.storeId} FOR UPDATE`);

    const [store] = await tx
      .select({ tax_rate: stores.tax_rate, invoice_prefix: stores.invoice_prefix, default_discount_type: stores.default_discount_type, default_discount_value: stores.default_discount_value })
      .from(stores)
      .where(eq(stores.id, actor.storeId))
      .limit(1);
    if (!store) throw Errors.notFound('Store tidak ditemukan');
    const storeTaxRate = Number.parseFloat(store.tax_rate);

    // Load products with row locks; validate active + stock atomically (PRD 6.2 steps 2-3, PRD 26).
    const productIds = input.items.map((i) => i.product_id);
    const locked = await tx
      .select({ id: products.id, sku: products.sku, name: products.name, unit: products.unit, selling_price: products.selling_price, tax_rate: products.tax_rate, discount_type: products.discount_type, discount_value: products.discount_value, active: products.active })
      .from(products)
      .where(and(eq(products.store_id, actor.storeId), sql`${products.id} = ANY(${sql.raw(`ARRAY[${productIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`))
      .for('update');

    if (locked.length !== input.items.length) throw Errors.productNotFound();

    const byId = new Map(locked.map((p) => [p.id, p]));
    for (const item of input.items) {
      const p = byId.get(item.product_id)!;
      if (!p.active) throw Errors.productInactive(p.sku);
    }

    // Stock validation under row locks (PRD 6.2 step 3, PRD 26).
    for (const [productId, qty] of aggregateQuantity(input.items)) {
      const [{ current }] = await tx
        .select({ current: sql<number>`COALESCE(SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out}), 0)::int` })
        .from(stockMovements)
        .where(eq(stockMovements.product_id, productId));
      if (Number(current) < qty) {
        throw Errors.insufficientStock(byId.get(productId)!.sku, Number(current));
      }
    }

    // Server-side price calculation — client prices are never trusted (PRD 29).
    // Per-product discounts: the product's discount_type/value is converted to a
    // per-LINE Rp amount here (PERCENT = % of unit price × qty). A client-sent
    // item.discount would be an untrusted override and is rejected when it exceeds
    // the configured discount.
    const lines = input.items.map((item) => {
      const p = byId.get(item.product_id)!;
      const grossCents = toCents(p.selling_price) * item.quantity;
      const pv = Number.parseFloat(p.discount_value);
      let autoCents = 0;
      if (pv > 0) {
        autoCents = p.discount_type === 'PERCENT' ? Math.round((grossCents * Math.min(pv, 100)) / 100) : toCents(pv) * item.quantity;
      }
      // Extra cashier discount on the line (e.g. negotiated price), allowed only if
      // it fits within the product's own discount for POS safety.
      const extraCents = item.discount !== undefined ? toCents(item.discount) : 0;
      return {
        product: p,
        quantity: item.quantity,
        unitPriceCents: toCents(p.selling_price),
        discountCents: Math.min(autoCents + extraCents, grossCents),
        taxRatePercent: Number.parseFloat(p.tax_rate) > 0 ? Number.parseFloat(p.tax_rate) : 0,
      };
    });
    for (const l of lines) {
      if (l.discountCents > l.unitPriceCents * l.quantity) {
        throw Errors.validation(`Discount item melebihi harga untuk ${l.product.sku}`);
      }
    }

    const pre = computeTotals(lines, 0, 0); // subtotal before order discount
    // Order discount resolution: explicit input wins; otherwise the store's
    // general default discount (Store Settings) applies to the transaction.
    // PERCENT = % of subtotal, NOMINAL = flat Rp.
    let orderDiscountCents = 0;
    if (input.discount !== undefined) {
      const v = Math.max(0, input.discount);
      orderDiscountCents = input.discount_type === 'PERCENT' ? Math.round((pre.subtotal * Math.min(v, 100)) / 100) : toCents(v);
    } else {
      const dv = Number.parseFloat(store.default_discount_value);
      if (dv > 0) {
        orderDiscountCents =
          store.default_discount_type === 'PERCENT' ? Math.round((pre.subtotal * Math.min(dv, 100)) / 100) : toCents(dv);
      }
    }
    if (orderDiscountCents > pre.subtotal) throw Errors.validation('Discount melebihi subtotal');
    const prorated = prorateDiscount(orderDiscountCents, lines.map((l) => l.unitPriceCents * l.quantity - l.discountCents));

    // Tax/grand total are computed on lines with the order discount prorated in
    // (so per-line tax rates see discounted line values).
    const totals = computeTotals(
      lines.map((l, i) => ({ ...l, discountCents: l.discountCents + prorated[i] })),
      0,
      storeTaxRate,
    );

    // The sale header must display the order discount the cashier entered:
    // subtotal stays pre-order-discount (PRD 29 pipeline display), discount carries
    // it, and tax/grand already reflect the reduced taxable amount. Without this,
    // sales.discount always stored 0 and receipts showed "Diskon Rp 0".
    // Grand total is rounded UP to the nearest Rp 100 (smallest coin) so change is
    // always handable in cash; the difference is stored as `rounding`.
    // (Rp 100 = 100 rupiah = 10,000 cents in our integer-cents math.)
    const rawGrand = totals.grandTotal;
    const roundedGrand = Math.ceil(rawGrand / 10_000) * 10_000;
    const roundingCents = roundedGrand - rawGrand;
    const displayTotals = {
      subtotal: pre.subtotal,
      discount: Math.min(orderDiscountCents, pre.subtotal),
      tax: totals.tax,
      rounding: roundingCents,
      grandTotal: roundedGrand,
    };

    // Payment validation (PRD 6.4): reject underpayment unless partial enabled (not in MVP).
    const paidCents = toCents(input.payment.amount_paid);
    if (paidCents < totals.grandTotal) throw Errors.invalidPayment('Jumlah bayar kurang dari total transaksi');

    const invoiceNumber = await nextInvoiceNumber(tx, actor.storeId, store.invoice_prefix);

    // 9-12 in one DB transaction (PRD 6.2).
    const [sale] = await tx
      .insert(sales)
      .values({
        store_id: actor.storeId,
        customer_id: input.customer_id ?? null,
        cashier_id: actor.userId,
        invoice_number: invoiceNumber,
        status: 'completed',
        subtotal: fromCents(displayTotals.subtotal),
        discount: fromCents(displayTotals.discount),
        tax: fromCents(displayTotals.tax),
        rounding: fromCents(displayTotals.rounding),
        grand_total: fromCents(displayTotals.grandTotal),
        idempotency_key: input.idempotencyKey ?? null,
      })
      .returning({ id: sales.id, invoice_number: sales.invoice_number, grand_total: sales.grand_total });

    for (const [i, l] of lines.entries()) {
      const lineDiscountCents = l.discountCents + prorated[i];
      const lineTotalCents = l.unitPriceCents * l.quantity - lineDiscountCents;
      const [saleItem] = await tx
        .insert(saleItems)
        .values({
          sale_id: sale.id,
          product_id: l.product.id,
          product_name: l.product.name, // snapshot (PRD 42 principle 4)
          sku: l.product.sku,
          unit_price: fromCents(l.unitPriceCents),
          quantity: l.quantity,
          discount: fromCents(lineDiscountCents),
          tax: '0',
          subtotal: fromCents(lineTotalCents),
        })
        .returning({ id: saleItems.id, quantity: saleItems.quantity });

      // Stock movement — same transaction as the sale (PRD 26).
      await tx.insert(stockMovements).values({
        store_id: actor.storeId,
        product_id: l.product.id,
        movement_type: 'SALE',
        quantity_in: 0,
        quantity_out: l.quantity,
        reference_type: 'SALE',
        reference_id: sale.id,
        note: invoiceNumber,
        created_by: actor.userId,
      });
    }

    await tx.insert(payments).values({
      sale_id: sale.id,
      method: input.payment.method,
      amount: fromCents(paidCents),
      reference_number: input.payment.reference_number ?? null,
      paid_at: new Date(),
    });

    const change = changeCents(paidCents, totals.grandTotal);
    return { saleId: sale.id, invoiceNumber: sale.invoice_number, grandTotal: sale.grand_total, change: fromCents(change), idempotentReplay: false as const };
  });

  return result;
}

export async function getSaleDetail(saleId: string, storeId: string | null) {
  // storeId = null skips store scoping (used by store.switch users; the route
  // validates the sale's store against their memberships afterwards).
  const where = storeId ? and(eq(sales.id, saleId), eq(sales.store_id, storeId)) : eq(sales.id, saleId);
  const [sale] = await db
    .select()
    .from(sales)
    .where(where)
    .limit(1);
  if (!sale) throw Errors.saleNotFound();
  const items = await db.select().from(saleItems).where(eq(saleItems.sale_id, saleId));
  const pays = await db.select().from(payments).where(eq(payments.sale_id, saleId));
  return { ...sale, items, payments: pays };
}

export async function listSales(opts: { storeIds: string[]; page: number; limit: number; offset: number; search?: string; cashierId?: string; status?: string }) {
  const conditions = [inArray(sales.store_id, opts.storeIds)];
  if (opts.search) conditions.push(sql`${sales.invoice_number} ILIKE ${'%' + opts.search + '%'}`);
  if (opts.cashierId) conditions.push(eq(sales.cashier_id, opts.cashierId));
  if (opts.status) conditions.push(sql`${sales.status}::text = ${opts.status}`);
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(sales)
    .where(where)
    .orderBy(sql`${sales.created_at} DESC`)
    .limit(opts.limit)
    .offset(opts.offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .where(where);
  return { rows, count };
}
