/** Resto order flow (Fase 3): open bill → add/edit items → (kitchen later) → settle.
 * Kitchen sending lives in kitchen.routes.ts; settlement delegates to the SHARED
 * sales checkout so stock/invoice/payments stay single-sourced with retail. */
import Elysia, { t } from 'elysia';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { products, restoOrderItems, restoOrders, restoTables, sales, stores } from '../../../db/schema';
import { ok, handleRouteError } from '../../../lib/response';
import { Errors } from '../../../lib/errors';
import { writeAudit } from '../../../lib/audit';
import { requireBusinessType, getBusinessType } from '../guards';
import { checkout, getSaleDetail, computeDisplayTotals, type CheckoutInput } from '../../sales/service';
import { toCents, fromCents } from '../../../lib/money';
import { auth } from '../../../middleware/auth';

const itemSelect = {
  id: restoOrderItems.id,
  product_id: restoOrderItems.product_id,
  product_name: restoOrderItems.product_name,
  sku: restoOrderItems.sku,
  quantity: restoOrderItems.quantity,
  unit_price: restoOrderItems.unit_price,
  discount: restoOrderItems.discount,
  notes: restoOrderItems.notes,
  kitchen_status: restoOrderItems.kitchen_status,
  sent_at: restoOrderItems.sent_at,
};

/** Bill preview helpers: subtotal in cents + discount resolution mirroring the
 * checkout rules (explicit input wins, else the store's general default). */
function computeSubtotalCents(lines: { unitPriceCents: number; quantity: number; discountCents: number }[]): number {
  return lines.reduce((a, l) => a + l.unitPriceCents * l.quantity - l.discountCents, 0);
}
function resolveDiscountPreview(
  explicit: { discount: number; discount_type: 'PERCENT' | 'NOMINAL' } | undefined,
  subtotalCents: number,
  store: { default_discount_type: 'PERCENT' | 'NOMINAL'; default_discount_value: string },
): number {
  if (explicit) return explicit.discount_type === 'PERCENT' ? Math.round((subtotalCents * Math.min(explicit.discount, 100)) / 100) : toCents(explicit.discount);
  const dv = Number.parseFloat(store.default_discount_value);
  if (dv > 0) return store.default_discount_type === 'PERCENT' ? Math.round((subtotalCents * Math.min(dv, 100)) / 100) : toCents(dv);
  return 0;
}

/** Load an OPEN order of this store with its items, or throw. */
async function loadOpenOrder(orderId: string, storeId: string) {
  const [order] = await db
    .select()
    .from(restoOrders)
    .where(and(eq(restoOrders.id, orderId), eq(restoOrders.store_id, storeId)))
    .limit(1);
  if (!order) throw Errors.notFound('Order tidak ditemukan');
  if (order.status !== 'OPEN') throw Errors.validation('Order sudah ditutup');
  const items = await db.select(itemSelect).from(restoOrderItems).where(eq(restoOrderItems.order_id, orderId)).orderBy(asc(restoOrderItems.created_at));
  return { ...order, items };
}

export const orderRoutes = new Elysia({ prefix: '/resto/orders' })
  .use(auth)
  // Open orders list (e.g. order panel / active bills)
  .get(
    '/',
    async ({ user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.view')) throw Errors.forbidden();
        const rows = await db
          .select({
            id: restoOrders.id,
            table_id: restoOrders.table_id,
            table_code: restoTables.code,
            guests: restoOrders.guests,
            opened_at: restoOrders.opened_at,
            items: sql<number>`(SELECT COALESCE(SUM(roi.quantity), 0)::int FROM resto_order_items roi WHERE roi.order_id = ${restoOrders.id})`,
            sent_items: sql<number>`(SELECT COALESCE(SUM(roi.quantity), 0)::int FROM resto_order_items roi WHERE roi.order_id = ${restoOrders.id} AND roi.kitchen_status <> 'QUEUED')`,
            served_items: sql<number>`(SELECT COALESCE(SUM(roi.quantity), 0)::int FROM resto_order_items roi WHERE roi.order_id = ${restoOrders.id} AND roi.kitchen_status = 'SERVED')`,
            subtotal: sql<string>`(SELECT COALESCE(SUM(roi.quantity * roi.unit_price), 0)::text FROM resto_order_items roi WHERE roi.order_id = ${restoOrders.id})`,
          })
          .from(restoOrders)
          .innerJoin(restoTables, eq(restoTables.id, restoOrders.table_id))
          .where(and(eq(restoOrders.store_id, auth.storeId), eq(restoOrders.status, 'OPEN')))
          .orderBy(desc(restoOrders.opened_at));
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  .get(
    '/:id',
    async ({ params, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.view')) throw Errors.forbidden();
        return ok(await loadOpenOrder(params.id, auth.storeId));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ---- Open bill: create an order on a FREE table ----
  .post(
    '/open',
    async ({ body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.order')) throw Errors.forbidden();
        const result = await db.transaction(async (tx) => {
          const [table] = await tx
            .select({ id: restoTables.id, code: restoTables.code, status: restoTables.status })
            .from(restoTables)
            .where(and(eq(restoTables.id, body.table_id), eq(restoTables.store_id, auth.storeId)))
            .for('update')
            .limit(1);
          if (!table) throw Errors.notFound('Meja tidak ditemukan');
          if (table.status === 'OCCUPIED') throw Errors.conflict('Meja sedang terisi');
          const [order] = await tx
            .insert(restoOrders)
            .values({
              store_id: auth.storeId,
              table_id: table.id,
              guests: body.guests ?? 1,
              opened_by: auth.userId,
              notes: body.notes ?? null,
            })
            .returning();
          await tx.update(restoTables).set({ status: 'OCCUPIED' }).where(eq(restoTables.id, table.id));
          return { order, table_code: table.code };
        });
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'OPEN_RESTO_BILL',
          entityType: 'resto_order',
          entityId: result.order.id,
          metadata: { table: result.table_code, guests: result.order.guests },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ ...result.order, table_code: result.table_code, items: [] });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        table_id: t.String({ format: 'uuid' }),
        guests: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  // ---- Add items (QUEUED until sent to kitchen) ----
  .post(
    '/:id/items',
    async ({ params, body, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.order')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);

        // Validate products belong to this store and are resto-available.
        const items: { product_id: string; quantity: number; notes?: string | null }[] = body.items;
        const productIds: string[] = [...new Set<string>(items.map((i) => i.product_id))];
        const rows = await db
          .select({ id: products.id, name: products.name, sku: products.sku, price: products.selling_price, available_resto: products.available_resto, active: products.active })
          .from(products)
          .where(and(eq(products.store_id, auth.storeId), inArray(products.id, productIds)));
        const byId = new Map(rows.map((r) => [r.id, r]));

        for (const item of items) {
          const p = byId.get(item.product_id);
          if (!p || !p.active || !p.available_resto) throw Errors.validation(`Produk tidak tersedia untuk resto: ${item.product_id}`);
          await db.insert(restoOrderItems).values({
            order_id: order.id,
            product_id: p.id,
            product_name: p.name,
            sku: p.sku,
            quantity: item.quantity,
            unit_price: p.price,
            notes: item.notes ?? null,
          });
        }
        return ok(await loadOpenOrder(order.id, auth.storeId));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        items: t.Array(
          t.Object({
            product_id: t.String({ format: 'uuid' }),
            quantity: t.Integer({ minimum: 1 }),
            notes: t.Optional(t.Nullable(t.String())),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )
  // ---- Send to kitchen: all QUEUED items → SENT (KDS picks them up) ----
  .post(
    '/:id/send',
    async ({ params, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.order')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        const queued = order.items.filter((i) => i.kitchen_status === 'QUEUED');
        if (queued.length === 0) throw Errors.validation('Tidak ada item baru untuk dikirim ke dapur');
        const now = new Date();
        await db
          .update(restoOrderItems)
          .set({ kitchen_status: 'SENT', sent_at: now })
          .where(and(eq(restoOrderItems.order_id, order.id), eq(restoOrderItems.kitchen_status, 'QUEUED')));
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'SEND_TO_KITCHEN',
          entityType: 'resto_order',
          entityId: order.id,
          metadata: { items: queued.length },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok(await loadOpenOrder(order.id, auth.storeId));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ---- Edit an item (qty/notes) — only while QUEUED (not yet in kitchen) ----
  .patch(
    '/:id/items/:itemId',
    async ({ params, body, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.order')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        const item = order.items.find((i) => i.id === params.itemId);
        if (!item) throw Errors.notFound('Item tidak ditemukan');
        if (item.kitchen_status !== 'QUEUED') throw Errors.validation('Item sudah dikirim ke dapur — tidak bisa diubah (gunakan VOID via kasir)');

        const patch: Record<string, unknown> = {};
        if (body.quantity !== undefined) {
          if (body.quantity < 1) throw Errors.validation('Quantity minimal 1 (hapus dengan endpoint DELETE)');
          patch.quantity = body.quantity;
        }
        if (body.notes !== undefined) patch.notes = body.notes;
        await db.update(restoOrderItems).set(patch).where(eq(restoOrderItems.id, item.id));
        return ok(await loadOpenOrder(order.id, auth.storeId));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }), itemId: t.String({ format: 'uuid' }) }),
      body: t.Object({
        quantity: t.Optional(t.Integer({ minimum: 1 })),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .delete(
    '/:id/items/:itemId',
    async ({ params, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.order')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        const item = order.items.find((i) => i.id === params.itemId);
        if (!item) throw Errors.notFound('Item tidak ditemukan');
        if (item.kitchen_status !== 'QUEUED') throw Errors.validation('Item sudah dikirim ke dapur — tidak bisa dihapus');
        await db.delete(restoOrderItems).where(eq(restoOrderItems.id, item.id));
        return ok(await loadOpenOrder(order.id, auth.storeId));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }), itemId: t.String({ format: 'uuid' }) }) },
  )
  // ---- Bill preview: exact payment math (discount/tax/rounding) — what the
  // settle endpoint will charge. Optional body lets the cashier preview a discount.
  .get(
    '/:id/bill',
    async ({ params, query, user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.view')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        const [store] = await db
          .select({ tax_rate: stores.tax_rate, default_discount_type: stores.default_discount_type, default_discount_value: stores.default_discount_value })
          .from(stores)
          .where(eq(stores.id, auth.storeId))
          .limit(1);
        const storeTaxRate = Number.parseFloat(store?.tax_rate ?? '0');
        const lines = order.items.map((i) => ({
          unitPriceCents: toCents(i.unit_price),
          quantity: i.quantity,
          discountCents: toCents(i.discount),
          taxRatePercent: 0,
        }));
        const explicitDiscount =
          query.discount !== undefined && Number.parseFloat(query.discount) > 0
            ? { discount: Number.parseFloat(query.discount), discount_type: (query.discount_type as 'PERCENT' | 'NOMINAL') ?? 'NOMINAL' }
            : undefined;
        const orderDiscountCents = store
          ? resolveDiscountPreview(explicitDiscount, computeSubtotalCents(lines), store)
          : 0;
        const totals = computeDisplayTotals(lines, orderDiscountCents, storeTaxRate);
        const tableCode = (await db.select({ code: restoTables.code }).from(restoTables).where(eq(restoTables.id, order.table_id)).limit(1))[0]?.code;
        return ok({
          order_id: order.id,
          table_code: tableCode,
          guests: order.guests,
          opened_at: order.opened_at,
          items: order.items,
          subtotal: fromCents(totals.subtotal),
          discount: fromCents(totals.discount),
          tax: fromCents(totals.tax),
          tax_rate: storeTaxRate,
          rounding: fromCents(totals.rounding),
          grand_total: fromCents(totals.grandTotal),
        });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Optional(t.Object({ discount: t.Optional(t.String()), discount_type: t.Optional(t.String()) })),
    },
  )
  // ---- Settlement: delegates to the SHARED checkout (stock + invoice + payments) ----
  .post(
    '/:id/settle',
    async ({ params, body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.settle')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        if (order.items.length === 0) throw Errors.validation('Order kosong — tidak bisa di-settle');

        const input: CheckoutInput = {
          items: order.items.map((i) => ({ product_id: i.product_id!, quantity: i.quantity })),
          customer_id: order.customer_id ?? body.customer_id ?? null,
          discount: body.discount,
          discount_type: body.discount_type,
          payment: { method: body.method, amount_paid: body.amount_paid, reference_number: body.reference_number },
          idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
          // Guests already consumed what was served: never let stock (or a product
          // deactivated after ordering) block closing the bill — that is exactly
          // the "bill ngegantung" failure mode. Stock is still written (may go
          // negative) so inventory keeps a truthful record.
          allowNegativeStock: true,
          // Order (SETTLED) + table (FREE) updates run INSIDE the checkout
          // transaction, so a crash between payment and table-freeing is impossible
          // (previously they ran after checkout and could be skipped by a restart).
          finalize: async (tx, saleId) => {
            await tx
              .update(restoOrders)
              .set({ status: 'SETTLED', sale_id: saleId, closed_at: new Date() })
              .where(and(eq(restoOrders.id, order.id), eq(restoOrders.status, 'OPEN')));
            await tx.update(restoTables).set({ status: 'FREE' }).where(eq(restoTables.id, order.table_id));
          },
        };
        const result = await checkout(input, { userId: auth.userId, storeId: auth.storeId });
        const detail = await getSaleDetail(result.saleId, auth.storeId);

        // Order/table finalization now happens atomically inside checkout (finalize hook).

        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'SETTLE_RESTO_ORDER',
          entityType: 'resto_order',
          entityId: order.id,
          metadata: {
            sale_id: result.saleId,
            invoice_number: 'invoiceNumber' in result ? result.invoiceNumber : null,
            grand_total: 'grandTotal' in result ? result.grandTotal : null,
          },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ order_id: order.id, sale_id: result.saleId, sale: detail });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        method: t.Union([t.Literal('CASH'), t.Literal('TRANSFER'), t.Literal('CARD'), t.Literal('QRIS')]),
        amount_paid: t.Number({ minimum: 0 }),
        discount: t.Optional(t.Number({ minimum: 0 })),
        discount_type: t.Optional(t.Union([t.Literal('PERCENT'), t.Literal('NOMINAL')])),
        reference_number: t.Optional(t.String()),
        customer_id: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  // ---- Recovery: relink a stuck order to its already-paid sale ----
  // For orders left OPEN by a pre-fix settle crash (sale was created but the
  // order/table were never finalized). Staff enters the invoice number from the
  // receipt; the sale must belong to this store, be completed, and not already
  // be linked to another order. Then the order is closed and the table freed.
  .post(
    '/:id/relink',
    async ({ params, body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.settle')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);

        const [sale] = await db
          .select({ id: sales.id, status: sales.status, invoice_number: sales.invoice_number })
          .from(sales)
          .where(and(eq(sales.store_id, auth.storeId), eq(sales.invoice_number, body.invoice_number.trim())))
          .limit(1);
        if (!sale) throw Errors.notFound('Invoice tidak ditemukan di toko ini');
        if (sale.status !== 'completed') throw Errors.validation('Invoice bukan transaksi completed');

        const [dupe] = await db
          .select({ id: restoOrders.id })
          .from(restoOrders)
          .where(and(eq(restoOrders.sale_id, sale.id), eq(restoOrders.status, 'SETTLED')))
          .limit(1);
        if (dupe) throw Errors.conflict('Invoice sudah terhubung ke order lain');

        await db.transaction(async (tx) => {
          await tx
            .update(restoOrders)
            .set({ status: 'SETTLED', sale_id: sale.id, closed_at: new Date() })
            .where(and(eq(restoOrders.id, order.id), eq(restoOrders.status, 'OPEN')));
          await tx.update(restoTables).set({ status: 'FREE' }).where(eq(restoTables.id, order.table_id));
        });
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'RELINK_RESTO_ORDER',
          entityType: 'resto_order',
          entityId: order.id,
          metadata: { sale_id: sale.id, invoice_number: sale.invoice_number },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ relinked: true, order_id: order.id, sale_id: sale.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ invoice_number: t.String({ minLength: 3 }) }),
    },
  )
  // ---- Cancel (before settlement; QUEUED items dropped, sent items must be voided) ----
  .post(
    '/:id/cancel',
    async ({ params, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.settle')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        const unsent = order.items.filter((i) => i.kitchen_status === 'QUEUED').length;
        if (unsent < order.items.length) {
          throw Errors.validation('Ada item yang sudah dikirim dapur — batalkan lewat settlement/retur setelah bill dibayar');
        }
        await db.transaction(async (tx) => {
          await tx.update(restoOrders).set({ status: 'CANCELLED', closed_at: new Date() }).where(eq(restoOrders.id, order.id));
          await tx.update(restoTables).set({ status: 'FREE' }).where(eq(restoTables.id, order.table_id));
        });
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CANCEL_RESTO_ORDER',
          entityType: 'resto_order',
          entityId: order.id,
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ cancelled: true, id: order.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  // ---- Void (force close an OPEN order) — escape hatch when guests leave without
  // paying, bill lost, or mis-opened bill. Requires manager-level `sales.cancel` +
  // a reason; the order is closed as CANCELLED and the table is freed.
  .post(
    '/:id/void',
    async ({ params, body, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('sales.cancel')) throw Errors.forbidden();
        const order = await loadOpenOrder(params.id, auth.storeId);
        await db.transaction(async (tx) => {
          await tx
            .update(restoOrders)
            .set({ status: 'CANCELLED', closed_at: new Date(), notes: body.reason })
          	.where(eq(restoOrders.id, order.id));
          await tx.update(restoTables).set({ status: 'FREE' }).where(eq(restoTables.id, order.table_id));
        });
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'VOID_RESTO_ORDER',
          entityType: 'resto_order',
          entityId: order.id,
          metadata: { reason: body.reason, items: order.items.length },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ voided: true, id: order.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ reason: t.String({ minLength: 3 }) }),
    },
  )
  // History (settled/cancelled) for the resto report later
  .get(
    '/history',
    async ({ user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('resto.view')) throw Errors.forbidden();
        const rows = await db
          .select({
            id: restoOrders.id,
            table_code: restoTables.code,
            status: restoOrders.status,
            guests: restoOrders.guests,
            opened_at: restoOrders.opened_at,
            closed_at: restoOrders.closed_at,
            sale_id: restoOrders.sale_id,
            invoice_number: sales.invoice_number,
            grand_total: sales.grand_total,
          })
          .from(restoOrders)
          .innerJoin(restoTables, eq(restoTables.id, restoOrders.table_id))
          .leftJoin(sales, eq(sales.id, restoOrders.sale_id))
          .where(and(eq(restoOrders.store_id, auth.storeId), inArray(restoOrders.status, ['SETTLED', 'CANCELLED'])))
          .orderBy(desc(restoOrders.opened_at))
          .limit(100);
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  );
