/** Product management (PRD 5.3). */
import Elysia, { t } from 'elysia';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { categories, products, stockMovements } from '../../db/schema';
import { ok, handleRouteError, parsePagination, paginationMeta, countWhere } from '../../lib/response';
import { auth, requirePerm } from '../../middleware/auth';
import { Errors } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

/** current_stock = SUM(quantity_in) - SUM(quantity_out) over movements (PRD 5.5). */
const stockExpr = sql<number>`COALESCE((
  SELECT SUM(${stockMovements.quantity_in}) - SUM(${stockMovements.quantity_out})
  FROM ${stockMovements} WHERE ${stockMovements.product_id} = ${products.id}
), 0)`;

const productSelect = {
  id: products.id,
  sku: products.sku,
  barcode: products.barcode,
  name: products.name,
  description: products.description,
  unit: products.unit,
  category_id: products.category_id,
  category_name: categories.name,
  cost_price: products.cost_price,
  selling_price: products.selling_price,
  minimum_stock: products.minimum_stock,
  tax_rate: products.tax_rate,
  active: products.active,
  created_at: products.created_at,
  stock: stockExpr,
};

export const productRoutes = new Elysia({ prefix: '/products' })
  .use(auth)
  .get(
    '/',
    async ({ query, user }) => {
      try {
        const auth = requirePerm(user, 'product.view');
        const { page, limit, offset } = parsePagination(query);
        const conditions = [eq(products.store_id, auth.storeId)];
        if (query.search) {
          conditions.push(
            or(ilike(products.name, `%${query.search}%`), ilike(products.sku, `%${query.search}%`), ilike(products.barcode, `%${query.search}%`))!,
          );
        }
        if (query.category_id) conditions.push(eq(products.category_id, query.category_id));
        if (query.active === 'true') conditions.push(eq(products.active, true));
        if (query.active === 'false') conditions.push(eq(products.active, false));
        const where = and(...conditions);
        const orderBy = query.sort === 'stock' ? desc(stockExpr) : query.sort === 'oldest' ? asc(products.created_at) : desc(products.created_at);
        const rows = await db
          .select(productSelect)
          .from(products)
          .leftJoin(categories, eq(products.category_id, categories.id))
          .where(where)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset);
        const count = await countWhere(products, where);
        return ok(rows, paginationMeta(page, limit, count));
      } catch (e) {
        return handleRouteError(e);
      }
    },
    {
      query: t.Optional(
        t.Object({
          search: t.Optional(t.String()),
          category_id: t.Optional(t.String()),
          active: t.Optional(t.String()),
          sort: t.Optional(t.String()),
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
        const auth = requirePerm(user, 'product.view');
        const [row] = await db
          .select(productSelect)
          .from(products)
          .leftJoin(categories, eq(products.category_id, categories.id))
          .where(and(eq(products.id, params.id), eq(products.store_id, auth.storeId)))
          .limit(1);
        if (!row) throw Errors.productNotFound();
        return ok(row);
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
        const auth = requirePerm(user, 'product.create');
        const [created] = await db
          .insert(products)
          .values({
            store_id: auth.storeId,
            category_id: body.category_id ?? null,
            sku: body.sku,
            barcode: body.barcode ?? null,
            name: body.name,
            description: body.description ?? null,
            unit: body.unit ?? 'pcs',
            cost_price: String(body.cost_price ?? 0),
            selling_price: String(body.selling_price ?? 0),
            minimum_stock: body.minimum_stock ?? 0,
            tax_rate: String(body.tax_rate ?? 0),
            active: true,
          })
          .returning();
        // Optional initial stock movement
        if (body.initial_stock && body.initial_stock > 0) {
          await db.insert(stockMovements).values({
            store_id: auth.storeId,
            product_id: created.id,
            movement_type: 'INITIAL',
            quantity_in: body.initial_stock,
            quantity_out: 0,
            reference_type: 'INITIAL',
            note: 'Stok awal saat create produk',
            created_by: auth.userId,
          });
        }
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'CREATE_PRODUCT',
          entityType: 'product',
          entityId: created.id,
          metadata: { sku: created.sku, name: created.name },
        });
        return ok(created);
      } catch (e) {
        const msg = String(e);
        if (msg.includes('products_store_sku_uq')) return handleRouteError(Errors.duplicateSku(''));
        if (msg.includes('products_store_barcode_uq')) return handleRouteError(Errors.duplicateBarcode(''));
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        sku: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        barcode: t.Optional(t.String()),
        description: t.Optional(t.String()),
        category_id: t.Optional(t.String()),
        unit: t.Optional(t.String()),
        cost_price: t.Optional(t.Number({ minimum: 0 })),
        selling_price: t.Optional(t.Number({ minimum: 0 })),
        minimum_stock: t.Optional(t.Number({ minimum: 0 })),
        tax_rate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        initial_stock: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .patch(
    '/:id',
    async ({ params, body, user, request }) => {
      try {
        const auth = requirePerm(user, 'product.update');
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.description !== undefined) patch.description = body.description;
        if (body.category_id !== undefined) patch.category_id = body.category_id;
        if (body.barcode !== undefined) patch.barcode = body.barcode;
        if (body.unit !== undefined) patch.unit = body.unit;
        if (body.cost_price !== undefined) patch.cost_price = String(body.cost_price);
        if (body.selling_price !== undefined) patch.selling_price = String(body.selling_price);
        if (body.minimum_stock !== undefined) patch.minimum_stock = body.minimum_stock;
        if (body.tax_rate !== undefined) patch.tax_rate = String(body.tax_rate);
        if (body.active !== undefined) patch.active = body.active;
        const [updated] = await db
          .update(products)
          .set(patch)
          .where(and(eq(products.id, params.id), eq(products.store_id, auth.storeId)))
          .returning();
        if (!updated) throw Errors.productNotFound();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'UPDATE_PRODUCT',
          entityType: 'product',
          entityId: updated.id,
          metadata: { fields: Object.keys(body) },
        });
        return ok(updated);
      } catch (e) {
        const msg = String(e);
        if (msg.includes('products_store_barcode_uq')) return handleRouteError(Errors.duplicateBarcode(''));
        return handleRouteError(e);
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        category_id: t.Optional(t.Nullable(t.String())),
        barcode: t.Optional(t.Nullable(t.String())),
        unit: t.Optional(t.String()),
        cost_price: t.Optional(t.Number({ minimum: 0 })),
        selling_price: t.Optional(t.Number({ minimum: 0 })),
        minimum_stock: t.Optional(t.Number({ minimum: 0 })),
        tax_rate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        active: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    '/:id',
    async ({ params, user, request }) => {
      try {
        const auth = requirePerm(user, 'product.delete');
        // Soft-delete (PRD 5.3: menonaktifkan produk; historis tetap utuh)
        const [updated] = await db
          .update(products)
          .set({ active: false, updated_at: new Date() })
          .where(and(eq(products.id, params.id), eq(products.store_id, auth.storeId)))
          .returning({ id: products.id });
        if (!updated) throw Errors.productNotFound();
        await writeAudit({
          storeId: auth.storeId,
          userId: auth.userId,
          action: 'DEACTIVATE_PRODUCT',
          entityType: 'product',
          entityId: updated.id,
        });
        return ok({ deactivated: true, id: updated.id });
      } catch (e) {
        return handleRouteError(e);
      }
    },
    { params: t.Object({ id: t.String({ format: 'uuid' }) }) },
  );
