/** Inventory (PRD 5.5, 5.6): stock list, movements, adjustments. */
import Elysia, { t } from 'elysia';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { products, stockMovements, users } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

const stockExpr = sql<number>`COALESCE((
  SELECT SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out})
  FROM ${stockMovements} WHERE ${stockMovements.product_id} = ${products.id}
), 0)`;

const VALID_ADJUSTMENT_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'STOCK_OPNAME'] as const;
type AdjustmentType = (typeof VALID_ADJUSTMENT_TYPES)[number];

export const inventoryRoutes = new Elysia({ prefix: '/inventory' })
  .use(auth)
  // Stock overview (PRD 10.4 style list)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'inventory.view');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(products.store_id, auth.storeId)];
        if (query.active === 'true') conditions.push(eq(products.active, true));
        if (query.search) conditions.push(sql`${products.name} ILIKE ${'%' + query.search + '%'}`);
        const where = and(...conditions);
        const rows = await db
          .select({
            product_id: products.id,
            sku: products.sku,
            name: products.name,
            unit: products.unit,
            minimum_stock: products.minimum_stock,
            stock: stockExpr,
          })
          .from(products)
          .where(where)
          .orderBy(asc(products.name))
          .limit(limit)
          .offset(offset);
        const count = await countWhere(products, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ search: t.Optional(t.String()), active: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  // Movement history for one product
  .get(
    '/:productId',
    async ({ params, query, user }) => {
      try {
        const auth = requirePerm(user, 'inventory.view');
        const { page, limit, offset } = parsePagination(query);
        const where = and(eq(stockMovements.product_id, params.productId), eq(stockMovements.store_id, auth.storeId));
        const rows = await db
          .select({
            id: stockMovements.id,
            movement_type: stockMovements.movement_type,
            quantity_in: stockMovements.quantity_in,
            quantity_out: stockMovements.quantity_out,
            reference_type: stockMovements.reference_type,
            reference_id: stockMovements.reference_id,
            note: stockMovements.note,
            created_by_name: users.name,
            created_at: stockMovements.created_at,
          })
          .from(stockMovements)
          .innerJoin(users, eq(stockMovements.created_by, users.id))
          .where(where)
          .orderBy(desc(stockMovements.created_at))
          .limit(limit)
          .offset(offset);
        const count = await countWhere(stockMovements, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ productId: t.String({ format: 'uuid' }) }), query: t.Optional(t.Object({ page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  // All movements (filterable)
  .get(
    '/movements/all',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'inventory.view');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(stockMovements.store_id, auth.storeId)];
        if (query.product_id) conditions.push(eq(stockMovements.product_id, query.product_id));
        if (query.movement_type) conditions.push(sql`${stockMovements.movement_type}::text = ${query.movement_type}`);
        const where = and(...conditions);
        const rows = await db
          .select({
            id: stockMovements.id,
            product_id: stockMovements.product_id,
            product_name: products.name,
            sku: products.sku,
            movement_type: stockMovements.movement_type,
            quantity_in: stockMovements.quantity_in,
            quantity_out: stockMovements.quantity_out,
            note: stockMovements.note,
            created_by_name: users.name,
            created_at: stockMovements.created_at,
          })
          .from(stockMovements)
          .innerJoin(products, eq(stockMovements.product_id, products.id))
          .innerJoin(users, eq(stockMovements.created_by, users.id))
          .where(where)
          .orderBy(desc(stockMovements.created_at))
          .limit(limit)
          .offset(offset);
        const count = await countWhere(stockMovements, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ product_id: t.Optional(t.String()), movement_type: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) })) },
  )
  // Stock adjustment (PRD 5.6) — always produces a movement, audited.
  // Granular: generic adjustments need inventory.adjust, stock opname needs inventory.opname.
  .post(
    '/adjustments',
    async ({ body, user, request }) => {
      try {
        const auth = requirePerm(user, body.movement_type === 'STOCK_OPNAME' ? 'inventory.opname' : 'inventory.adjust');
        if (!VALID_ADJUSTMENT_TYPES.includes(body.movement_type as AdjustmentType)) {
          throw Errors.validation(`movement_type harus salah dari: ${VALID_ADJUSTMENT_TYPES.join(', ')}`);
        }
        if (body.quantity <= 0) throw Errors.validation('Quantity harus lebih dari 0');
        if (!body.reason || body.reason.trim().length === 0) throw Errors.validation('Alasan adjustment wajib diisi');

        const result = await db.transaction(async (tx) => {
          // Lock product row to serialize concurrent adjustments (PRD 26)
          const [product] = await tx
            .select({ id: products.id, store_id: products.store_id, name: products.name, active: products.active })
            .from(products)
            .where(eq(products.id, body.product_id))
            .for('update')
            .limit(1);
          if (!product || product.store_id !== auth.storeId) throw Errors.productNotFound();

          let qtyIn = 0;
          let qtyOut = 0;
          if (body.movement_type === 'ADJUSTMENT_IN') qtyIn = body.quantity;
          else if (body.movement_type === 'ADJUSTMENT_OUT' || body.movement_type === 'DAMAGE') qtyOut = body.quantity;
          else {
            // STOCK_OPNAME: set absolute counted stock via delta movement
            const [{ current }] = await tx
              .select({ current: sql<number>`COALESCE(SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out}), 0)` })
              .from(stockMovements)
              .where(eq(stockMovements.product_id, body.product_id));
            const delta = body.quantity - Number(current);
            if (delta > 0) qtyIn = delta;
            else if (delta < 0) qtyOut = -delta;
            else return { product_id: product.id, movement: null, delta: 0 };
          }

          const [movement] = await tx
            .insert(stockMovements)
            .values({
              store_id: auth.storeId,
              product_id: product.id,
              movement_type: body.movement_type as AdjustmentType,
              quantity_in: qtyIn,
              quantity_out: qtyOut,
              reference_type: 'ADJUSTMENT',
              note: body.reason,
              created_by: auth.userId,
            })
            .returning();
          return { product_id: product.id, movement, delta: qtyIn - qtyOut };
        });

        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'STOCK_ADJUSTMENT',
          entityType: 'product',
          entityId: result.product_id,
          metadata: { movement_type: body.movement_type, quantity: body.quantity, reason: body.reason, delta: result.delta },
          ip: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        });
        return ok(result);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        product_id: t.String({ format: 'uuid' }),
        movement_type: t.Union([
          t.Literal('ADJUSTMENT_IN'),
          t.Literal('ADJUSTMENT_OUT'),
          t.Literal('DAMAGE'),
          t.Literal('STOCK_OPNAME'),
        ]),
        quantity: t.Number({ minimum: 1 }),
        reason: t.String({ minLength: 1 }),
      }),
    },
  );
