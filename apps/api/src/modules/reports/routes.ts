/** Reports + dashboard (PRD 9, 10). */
import Elysia, { t } from 'elysia';
import { and, eq, gte, lte, sql, desc, asc, type SQL } from 'drizzle-orm';import { db } from '../../db';
import { payments, products, saleItems, sales, stockMovements, users } from '../../db/schema';
import { ok, handleRouteError } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';

type Where = ReturnType<typeof and>;

function dateRange(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(sales.created_at, new Date(`${from}T00:00:00`)));
  if (to) conditions.push(lte(sales.created_at, new Date(`${to}T23:59:59.999`)));
  return conditions;
}

function completedSale(conditions: SQL[]) {
  return and(eq(sales.status, 'completed'), ...conditions) as SQL;
}

export const reportRoutes = new Elysia({ prefix: '/reports' })
  .use(auth)
  // 10.1 Sales report
  .get(
    '/sales',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_REPORTS');
        const conds = dateRange(query.from, query.to);
        if (query.cashier_id) conds.push(eq(sales.cashier_id, query.cashier_id));
        const where = completedSale(conds);
        const [totals] = await db
          .select({
            total_transactions: sql<number>`COUNT(*)`,
            gross_sales: sql<string>`COALESCE(SUM(${sales.subtotal}), 0)`,
            discount: sql<string>`COALESCE(SUM(${sales.discount}), 0)`,
            tax: sql<string>`COALESCE(SUM(${sales.tax}), 0)`,
            net_sales: sql<string>`COALESCE(SUM(${sales.grand_total}), 0)`,
          })
          .from(sales)
          .where(where);
        return ok({
          total_transactions: Number(totals.total_transactions),
          gross_sales: totals.gross_sales,
          discount: totals.discount,
          tax: totals.tax,
          net_sales: totals.net_sales,
        });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()), cashier_id: t.Optional(t.String()) })) },
  )
  // 10.2 Product sales report
  .get(
    '/products',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_REPORTS');
        const conds = dateRange(query.from, query.to);
        const where = completedSale(conds);
        const rows = await db
          .select({
            product_id: saleItems.product_id,
            product_name: saleItems.product_name,
            sku: saleItems.sku,
            quantity_sold: sql<number>`SUM(${saleItems.quantity})`,
            revenue: sql<string>`SUM(${saleItems.unit_price} * ${saleItems.quantity})`,
            discount: sql<string>`SUM(${saleItems.discount})`,
            net_revenue: sql<string>`SUM(${saleItems.subtotal})`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.sale_id, sales.id))
          .where(where)
          .groupBy(saleItems.product_id, saleItems.product_name, saleItems.sku)
          .orderBy(desc(sql`SUM(${saleItems.quantity})`))
          .limit(200);
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })) },
  )
  // 10.3 Payment report
  .get(
    '/payments',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_REPORTS');
        const conds = dateRange(query.from, query.to);
        const rows = await db
          .select({
            method: payments.method,
            total: sql<string>`SUM(${payments.amount})`,
            transactions: sql<number>`COUNT(*)`,
          })
          .from(payments)
          .innerJoin(sales, eq(payments.sale_id, sales.id))
          .where(completedSale(conds))
          .groupBy(payments.method);
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })) },
  )
  // 10.4 Stock report (also serves dashboard low-stock)
  .get(
    '/stock',
    async ({ user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_REPORTS');
        const stockExpr = sql<number>`COALESCE((
          SELECT SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out})
          FROM ${stockMovements} WHERE ${stockMovements.product_id} = ${products.id}
        ), 0)`;
        const rows = await db
          .select({
            product_id: products.id,
            sku: products.sku,
            name: products.name,
            stock: stockExpr,
            minimum_stock: products.minimum_stock,
            stock_status: sql<string>`CASE
              WHEN COALESCE((SELECT SUM(m.quantity_in) - SUM(m.quantity_out) FROM stock_movements m WHERE m.product_id = ${products.id}), 0) <= 0 THEN 'OUT_OF_STOCK'
              WHEN COALESCE((SELECT SUM(m.quantity_in) - SUM(m.quantity_out) FROM stock_movements m WHERE m.product_id = ${products.id}), 0) < ${products.minimum_stock} THEN 'LOW'
              ELSE 'OK'
            END`,
          })
          .from(products)
          .where(eq(products.store_id, auth.storeId))
          .orderBy(asc(products.name));
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
  )
  // 10.5 Cashier report
  .get(
    '/cashiers',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'VIEW_REPORTS');
        const conds = dateRange(query.from, query.to);
        const rows = await db
          .select({
            cashier_id: sales.cashier_id,
            cashier_name: users.name,
            transactions: sql<number>`COUNT(*)`,
            total_sales: sql<string>`COALESCE(SUM(${sales.grand_total}), 0)`,
            avg_transaction: sql<string>`COALESCE(AVG(${sales.grand_total}), 0)`,
          })
          .from(sales)
          .innerJoin(users, eq(sales.cashier_id, users.id))
          .where(completedSale(conds))
          .groupBy(sales.cashier_id, users.name)
          .orderBy(desc(sql`COUNT(*)`));
        return ok(rows);
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })) },
  )
  // Dashboard (PRD 9)
  .get(
    '/dashboard',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'READ_DASHBOARD');
        const conds = dateRange(query.from, query.to);
        const where = completedSale(conds);
        const [totals] = await db
          .select({
            sales_today: sql<string>`COALESCE(SUM(${sales.grand_total}), 0)`,
            transactions: sql<number>`COUNT(*)`,
            avg_transaction: sql<string>`COALESCE(AVG(${sales.grand_total}), 0)`,
            gross: sql<string>`COALESCE(SUM(${sales.subtotal}), 0)`,
            discount: sql<string>`COALESCE(SUM(${sales.discount}), 0)`,
            tax: sql<string>`COALESCE(SUM(${sales.tax}), 0)`,
            net: sql<string>`COALESCE(SUM(${sales.grand_total}), 0)`,
          })
          .from(sales)
          .where(where);

        // Low-stock products
        const stockExpr = sql<number>`COALESCE((
          SELECT SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out})
          FROM ${stockMovements} WHERE ${stockMovements.product_id} = ${products.id}
        ), 0)`;
        const lowStock = await db
          .select({ id: products.id, name: products.name, sku: products.sku, stock: stockExpr, minimum_stock: products.minimum_stock })
          .from(products)
          .where(and(eq(products.store_id, auth.storeId), eq(products.active, true), sql`${stockExpr} <= ${products.minimum_stock}`))
          .limit(10);

        // Top-selling products
        const topProducts = await db
          .select({
            product_name: saleItems.product_name,
            quantity: sql<number>`SUM(${saleItems.quantity})`,
            revenue: sql<string>`SUM(${saleItems.subtotal})`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.sale_id, sales.id))
          .where(where)
          .groupBy(saleItems.product_name)
          .orderBy(desc(sql`SUM(${saleItems.quantity})`))
          .limit(5);

        // Sales trend (last 14 days, daily)
        const trend = await db
          .select({
            date: sql<string>`TO_CHAR(${sales.created_at} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
            total: sql<string>`SUM(${sales.grand_total})`,
            transactions: sql<number>`COUNT(*)`,
          })
          .from(sales)
          .where(and(eq(sales.store_id, auth.storeId), eq(sales.status, 'completed')))
          .groupBy(sql`TO_CHAR(${sales.created_at} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`)
          .orderBy(sql`TO_CHAR(${sales.created_at} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') DESC`)
          .limit(14);

        return ok({
          summary: totals,
          low_stock: lowStock,
          top_products: topProducts,
          trend: trend.reverse(),
        });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { query: t.Optional(t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })) },
  );
