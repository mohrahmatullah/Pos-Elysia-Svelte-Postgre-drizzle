/** Sales routes (PRD 6, 7, 18): list/detail/checkout/cancel/return. */
import Elysia, { t } from 'elysia';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { payments, products, saleItems, sales, stockMovements, users } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta } from '../../lib/response';
import { auth, requirePerm, hasRolePermission } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { checkout, getSaleDetail, listSales, type CheckoutInput } from './service';
import { toCents, fromCents } from '../../lib/money';

export const saleRoutes = new Elysia({ prefix: '/sales' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'sales.view');
        const { page, limit, offset } = parsePagination(query);
        // Permission-driven scoping (PRD 4.3): roles granted sales.cancel (owner/manager
        // by seed) manage sales and see all; others only see their own transactions.
        const isAll = hasRolePermission(user, 'sales.cancel');
        const result = await listSales({
          storeId: auth.storeId,
          page,
          limit,
          offset,
          search: query.search,
          cashierId: isAll ? query.cashier_id : auth.userId,
          status: query.status,
        });
        return ok(result.rows, paginationMeta(page, limit, result.count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      query: t.Optional(
        t.Object({
          search: t.Optional(t.String()),
          cashier_id: t.Optional(t.String()),
          status: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      ),
    },
  )
  .get(
    '/:id',
    async ({ params, user }) => {
      try {
        const auth = requirePerm(user, 'sales.view');
        const detail = await getSaleDetail(params.id, auth.storeId);
        // Without sales.cancel, users can only view their own sales (PRD 4.3).
        if (!hasRolePermission(user, 'sales.cancel') && detail.cashier_id !== auth.userId) throw Errors.forbidden();
        return ok(detail);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  )
  .post(
    '/',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, 'sales.create');
        const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;
        const input: CheckoutInput = {
          items: body.items,
          customer_id: body.customer_id ?? null,
          discount: body.discount,
          payment: { method: body.method, amount_paid: body.amount_paid, reference_number: body.reference_number },
          idempotencyKey,
        };
        const result = await checkout(input, { userId: auth.userId, storeId: auth.storeId });
        if (result.idempotentReplay) {
          const detail = await getSaleDetail(result.saleId, auth.storeId);
          return ok(detail);
        }
        const detail = await getSaleDetail(result.saleId, auth.storeId);
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_SALE',
          entityType: 'sale',
          entityId: result.saleId,
          metadata: { invoice_number: result.invoiceNumber, grand_total: result.grandTotal, change: result.change, method: body.method },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });
        return ok(detail);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        items: t.Array(
          t.Object({
            product_id: t.String({ format: 'uuid' }),
            quantity: t.Integer({ minimum: 1 }),
            discount: t.Optional(t.Number({ minimum: 0 })),
          }),
          { minItems: 1 },
        ),
        customer_id: t.Optional(t.Nullable(t.String())),
        discount: t.Optional(t.Number({ minimum: 0 })),
        method: t.Union([t.Literal('CASH'), t.Literal('TRANSFER'), t.Literal('CARD'), t.Literal('QRIS')]),
        amount_paid: t.Number({ minimum: 0 }),
        reference_number: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/:id/cancel',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'sales.cancel');
        await db.transaction(async (tx) => {
          const [sale] = await tx
            .select({ id: sales.id, status: sales.status, invoice_number: sales.invoice_number })
            .from(sales)
            .where(and(eq(sales.id, params.id), eq(sales.store_id, auth.storeId)))
            .for('update')
            .limit(1);
          if (!sale) throw Errors.saleNotFound();
          if (sale.status === 'cancelled') throw Errors.saleCancelled();

          const items = await tx.select({ product_id: saleItems.product_id, quantity: saleItems.quantity, returned_quantity: saleItems.returned_quantity }).from(saleItems).where(eq(saleItems.sale_id, sale.id));

          // Restock items net of any prior returns (SALE movement reversed).
          for (const item of items) {
            const netQty = item.quantity - item.returned_quantity;
            if (netQty > 0 && item.product_id) {
              await tx.insert(stockMovements).values({
                store_id: auth.storeId,
                product_id: item.product_id,
                movement_type: 'ADJUSTMENT_IN',
                quantity_in: netQty,
                quantity_out: 0,
                reference_type: 'ADJUSTMENT',
                reference_id: sale.id,
                note: `Pembatalan transaksi ${sale.invoice_number}`,
                created_by: auth.userId,
              });
            }
          }

          await tx.update(sales).set({ status: 'cancelled', updated_at: new Date() }).where(eq(sales.id, sale.id));
        });
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CANCEL_SALE',
          entityType: 'sale',
          entityId: params.id,
          metadata: { reason: body?.reason ?? null },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ cancelled: true, id: params.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
    },
  )
  .post(
    '/:id/return',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'sales.return');
        if (!body.items?.length) throw Errors.validation('Minimal satu item untuk diretur');

        const result = await db.transaction(async (tx) => {
          const [sale] = await tx
            .select({ id: sales.id, status: sales.status, invoice_number: sales.invoice_number })
            .from(sales)
            .where(and(eq(sales.id, params.id), eq(sales.store_id, auth.storeId)))
            .for('update')
            .limit(1);
          if (!sale) throw Errors.saleNotFound();
          if (sale.status === 'cancelled') throw Errors.saleCancelled();

          let refundTotalCents = 0;
          for (const ret of body.items) {
            const [item] = await tx
              .select({ id: saleItems.id, quantity: saleItems.quantity, returned_quantity: saleItems.returned_quantity, unit_price: saleItems.unit_price, discount: saleItems.discount, product_id: saleItems.product_id })
              .from(saleItems)
              .where(and(eq(saleItems.id, ret.sale_item_id), eq(saleItems.sale_id, sale.id)))
              .for('update')
              .limit(1);
            if (!item) throw Errors.notFound('Sale item tidak ditemukan');
            const returnable = item.quantity - item.returned_quantity;
            if (ret.quantity <= 0 || ret.quantity > returnable) {
              throw Errors.validation(`Quantity retur melebihi yang dapat diretur (tersisa ${returnable})`);
            }
            // Refund proportional per unit: (unit_price*qty - discount)/qty per unit
            const perUnitCents = Math.round((toCents(item.unit_price) * item.quantity - toCents(item.discount)) / item.quantity);
            refundTotalCents += perUnitCents * ret.quantity;

            await tx
              .update(saleItems)
              .set({ returned_quantity: item.returned_quantity + ret.quantity })
              .where(eq(saleItems.id, item.id));

            if (item.product_id) {
              await tx.insert(stockMovements).values({
                store_id: auth.storeId,
                product_id: item.product_id,
                movement_type: 'SALE_RETURN',
                quantity_in: ret.quantity,
                quantity_out: 0,
                reference_type: 'SALE_RETURN',
                reference_id: sale.id,
                note: `Retur ${sale.invoice_number}: ${body.reason}`,
                created_by: auth.userId,
              });
            }
          }

          // Update sale status
          const allItems = await tx.select({ quantity: saleItems.quantity, returned_quantity: saleItems.returned_quantity }).from(saleItems).where(eq(saleItems.sale_id, sale.id));
          const fullyReturned = allItems.every((i) => i.returned_quantity >= i.quantity);
          await tx
            .update(sales)
            .set({ status: fullyReturned ? 'returned' : 'partially_returned', updated_at: new Date() })
            .where(eq(sales.id, sale.id));

          return { refund: fromCents(refundTotalCents), invoice_number: sale.invoice_number };
        });

        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_RETURN',
          entityType: 'sale',
          entityId: params.id,
          metadata: { reason: body.reason, refund: result.refund, items: body.items.length },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ returned: true, refund_amount: result.refund, invoice_number: result.invoice_number });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        items: t.Array(t.Object({ sale_item_id: t.String({ format: 'uuid' }), quantity: t.Integer({ minimum: 1 }) }), { minItems: 1 }),
        reason: t.String({ minLength: 1 }),
      }),
    },
  );
