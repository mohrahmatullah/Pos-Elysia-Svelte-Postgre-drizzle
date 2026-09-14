/** Kitchen Display System (KDS) API — Fase 4.
 * Resto/Hybrid only. The board shows EVERY open bill (so a bill never "disappears"
 * while it is still unpaid): kitchen staff work active items through the pipeline
 * QUEUED → SENT → PREPARING → READY → SERVED, and fully-served-but-unpaid bills
 * stay visible as a pickup/cashier handoff signal.
 *
 * Scope note: `kitchen.view` lets staff MOVE items through the pipeline; opening
 * bills / editing items stays behind `resto.order` in orders.routes.ts.
 */
import Elysia, { t } from 'elysia';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db';
import { restoOrderItems, restoOrders, restoTables } from '../../../db/schema';
import { ok, handleRouteError } from '../../../lib/response';
import { Errors } from '../../../lib/errors';
import { writeAudit } from '../../../lib/audit';
import { requireBusinessType } from '../guards';
import { auth } from '../../../middleware/auth';

/** Lifecycle transitions allowed per current kitchen_status. */
const NEXT_STATUS: Record<string, 'PREPARING' | 'READY' | 'SERVED'> = {
  SENT: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
};

export const kitchenRoutes = new Elysia({ prefix: '/resto/kitchen' })
  .use(auth)
  // ---- KDS board: ALL open bills with their kitchen state ----
  // kitchen_state: 'COOKING' = has active (SENT/PREPARING/READY) items,
  // 'ALL_SERVED' = every sent item already SERVED (waiting for payment),
  // 'IDLE' = nothing sent yet (waiter still composing the order).
  .get(
    '/',
    async ({ user }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('kitchen.view')) throw Errors.forbidden();

        const orders = await db
          .select({
            order_id: restoOrders.id,
            table_code: restoTables.code,
            guests: restoOrders.guests,
            opened_at: restoOrders.opened_at,
            paid: restoOrders.sale_id,
          })
          .from(restoOrders)
          .innerJoin(restoTables, eq(restoTables.id, restoOrders.table_id))
          .where(and(eq(restoOrders.store_id, auth.storeId), eq(restoOrders.status, 'OPEN')))
          .orderBy(asc(restoOrders.opened_at));

        if (orders.length === 0) return ok([]);

        // ALL items of the open orders (kitchen-relevant + served + queued) so the
        // board can show counts and the bill subtotal without disappearing.
        const items = await db
          .select({
            id: restoOrderItems.id,
            order_id: restoOrderItems.order_id,
            product_name: restoOrderItems.product_name,
            quantity: restoOrderItems.quantity,
            unit_price: restoOrderItems.unit_price,
            notes: restoOrderItems.notes,
            kitchen_status: restoOrderItems.kitchen_status,
            sent_at: restoOrderItems.sent_at,
            ready_at: restoOrderItems.ready_at,
            created_at: restoOrderItems.created_at,
          })
          .from(restoOrderItems)
          .where(
            inArray(
              restoOrderItems.order_id,
              orders.map((o) => o.order_id),
            ),
          )
          .orderBy(asc(restoOrderItems.sent_at), asc(restoOrderItems.created_at));

        const byOrder = new Map<string, typeof items>();
        for (const item of items) {
          byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]);
        }

        const board = orders.map((o) => {
          const list = byOrder.get(o.order_id) ?? [];
          const active = list.filter((i) => ['SENT', 'PREPARING', 'READY'].includes(i.kitchen_status));
          const servedCount = list.filter((i) => i.kitchen_status === 'SERVED').length;
          const queuedCount = list.filter((i) => i.kitchen_status === 'QUEUED').length;
          const subtotal = list.reduce((a, i) => a + Number(i.unit_price) * i.quantity, 0);

          const kitchen_state = active.length > 0 ? 'COOKING' : list.length > 0 ? 'ALL_SERVED' : 'IDLE';
          const oldestActive = active.reduce<number | null>((min, i) => {
            const ts = i.sent_at ? new Date(i.sent_at).getTime() : new Date(i.created_at).getTime();
            return min === null || ts < min ? ts : min;
          }, null);

          return {
            order_id: o.order_id,
            table_code: o.table_code,
            guests: o.guests,
            opened_at: o.opened_at,
            paid: o.paid !== null,
            kitchen_state,
            subtotal: subtotal.toFixed(2),
            items_total: list.reduce((a, i) => a + i.quantity, 0),
            served_count: servedCount,
            queued_count: queuedCount,
            active_count: active.reduce((a, i) => a + i.quantity, 0),
            elapsed_seconds:
              oldestActive !== null
                ? Math.floor((Date.now() - oldestActive) / 1000)
                : Math.floor((Date.now() - new Date(o.opened_at).getTime()) / 1000),
            items: active.map((i) => ({
              id: i.id,
              product_name: i.product_name,
              quantity: i.quantity,
              notes: i.notes,
              kitchen_status: i.kitchen_status,
              sent_at: i.sent_at,
              ready_at: i.ready_at,
            })),
          };
        });

        return ok(board);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // ---- Advance one item one step along the pipeline ----
  .patch(
    '/items/:itemId',
    async ({ params, user, request }) => {
      try {
        const auth = await requireBusinessType(user, ['RESTO', 'HYBRID']);
        if (!auth.permissions.has('kitchen.view')) throw Errors.forbidden();

        // Join through orders + tables so store scoping holds even for the item update.
        const [item] = await db
          .select({
            id: restoOrderItems.id,
            kitchen_status: restoOrderItems.kitchen_status,
            order_id: restoOrderItems.order_id,
            product_name: restoOrderItems.product_name,
          })
          .from(restoOrderItems)
          .innerJoin(restoOrders, eq(restoOrders.id, restoOrderItems.order_id))
          .where(and(eq(restoOrderItems.id, params.itemId), eq(restoOrders.store_id, auth.storeId)))
          .limit(1);
        if (!item) throw Errors.notFound('Item dapur tidak ditemukan');

        const next = NEXT_STATUS[item.kitchen_status];
        if (!next) {
          throw Errors.validation(
            item.kitchen_status === 'QUEUED'
              ? 'Item belum dikirim ke dapur (masih QUEUED)'
              : `Status ${item.kitchen_status} sudah final`,
          );
        }

        const now = new Date();
        await db
          .update(restoOrderItems)
          .set(next === 'READY' ? { kitchen_status: next, ready_at: now } : { kitchen_status: next })
          .where(eq(restoOrderItems.id, item.id));

        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'KITCHEN_ITEM_ADVANCE',
          entityType: 'resto_order_item',
          entityId: item.id,
          metadata: { from: item.kitchen_status, to: next, product: item.product_name },
          ip: request.headers.get('x-forwarded-for'),
        });
        return ok({ id: item.id, kitchen_status: next });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ itemId: t.String({ format: 'uuid' }) }) },
  );
