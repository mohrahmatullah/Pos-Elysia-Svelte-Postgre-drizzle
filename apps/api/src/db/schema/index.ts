import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ---------------------------------- enums --------------------------------- */

export const roleNameEnum = pgEnum('role_name', ['owner', 'manager', 'cashier']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);
export const saleStatusEnum = pgEnum('sale_status', [
  'completed',
  'cancelled',
  'partially_returned',
  'returned',
]);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'TRANSFER', 'CARD', 'QRIS']);
export const movementTypeEnum = pgEnum('movement_type', [
  'INITIAL',
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'STOCK_OPNAME',
]);
export const referenceTypeEnum = pgEnum('reference_type', [
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT',
  'INITIAL',
]);

/* --------------------------------- stores --------------------------------- */

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  currency: text('currency').notNull().default('IDR'),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  receipt_footer: text('receipt_footer'),
  invoice_prefix: text('invoice_prefix').notNull().default('INV'),
  tax_rate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------- auth ---------------------------------- */

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: roleNameEnum('name').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('roles_name_uq').on(t.name)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    password_hash: text('password_hash').notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    index('users_store_idx').on(t.store_id),
    index('users_role_idx').on(t.role_id),
  ],
);

/** Refresh-token sessions: revocable (PRD 5.1 / 25). */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refresh_token_hash: text('refresh_token_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_refresh_hash_uq').on(t.refresh_token_hash),
    index('sessions_user_idx').on(t.user_id),
  ],
);

/* ------------------------------ master data ------------------------------- */

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_store_name_uq').on(t.store_id, t.name),
    index('categories_store_idx').on(t.store_id),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    category_id: uuid('category_id').references(() => categories.id),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('pcs'),
    cost_price: numeric('cost_price', { precision: 18, scale: 2 }).notNull().default('0'),
    selling_price: numeric('selling_price', { precision: 18, scale: 2 }).notNull().default('0'),
    minimum_stock: integer('minimum_stock').notNull().default(0),
    tax_rate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_store_sku_uq').on(t.store_id, t.sku),
    uniqueIndex('products_store_barcode_uq').on(t.store_id, t.barcode),
    index('products_store_idx').on(t.store_id),
    index('products_store_category_idx').on(t.store_id, t.category_id),
    index('products_store_active_idx').on(t.store_id, t.active),
    index('products_name_idx').on(t.name),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customers_store_phone_idx').on(t.store_id, t.phone), index('customers_store_idx').on(t.store_id)],
);

/* ---------------------------------- sales --------------------------------- */

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    customer_id: uuid('customer_id').references(() => customers.id),
    cashier_id: uuid('cashier_id')
      .notNull()
      .references(() => users.id),
    invoice_number: text('invoice_number').notNull(),
    status: saleStatusEnum('status').notNull().default('completed'),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 18, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 18, scale: 2 }).notNull().default('0'),
    grand_total: numeric('grand_total', { precision: 18, scale: 2 }).notNull(),
    idempotency_key: text('idempotency_key'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sales_store_invoice_uq').on(t.store_id, t.invoice_number),
    uniqueIndex('sales_idempotency_uq').on(t.idempotency_key),
    index('sales_store_created_idx').on(t.store_id, t.created_at),
    index('sales_store_cashier_idx').on(t.store_id, t.cashier_id),
    index('sales_customer_idx').on(t.customer_id),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sale_id: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    product_id: uuid('product_id').references(() => products.id),
    product_name: text('product_name').notNull(), // snapshot (PRD 6.1 / 42)
    sku: text('sku'),
    unit_price: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),
    discount: numeric('discount', { precision: 18, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 18, scale: 2 }).notNull().default('0'),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    returned_quantity: integer('returned_quantity').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_items_sale_idx').on(t.sale_id),
    index('sale_items_product_idx').on(t.product_id),
    check('sale_items_qty_positive_chk', sql`${t.quantity} > 0`),
    check(
      'sale_items_price_nonneg_chk',
      sql`${t.unit_price} >= 0 AND ${t.subtotal} >= 0 AND ${t.discount} >= 0`,
    ),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sale_id: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum('method').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    reference_number: text('reference_number'),
    paid_at: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_sale_idx').on(t.sale_id), check('payments_amount_positive_chk', sql`${t.amount} > 0`)],
);

/* -------------------------------- inventory ------------------------------- */

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id),
    movement_type: movementTypeEnum('movement_type').notNull(),
    quantity_in: integer('quantity_in').notNull().default(0),
    quantity_out: integer('quantity_out').notNull().default(0),
    reference_type: referenceTypeEnum('reference_type').notNull(),
    reference_id: uuid('reference_id'),
    note: text('note'),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_store_product_created_idx').on(t.store_id, t.product_id, t.created_at),
    index('stock_movements_reference_idx').on(t.reference_type, t.reference_id),
    check(
      'stock_movements_qty_chk',
      sql`(${t.quantity_in} > 0 AND ${t.quantity_out} = 0) OR (${t.quantity_out} > 0 AND ${t.quantity_in} = 0)`,
    ),
  ],
);

/* --------------------------------- audit ---------------------------------- */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    user_id: uuid('user_id').references(() => users.id),
    action: text('action').notNull(),
    entity_type: text('entity_type'),
    entity_id: text('entity_id'),
    metadata: jsonb('metadata'),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_store_created_idx').on(t.store_id, t.created_at),
    index('audit_logs_user_idx').on(t.user_id),
    index('audit_logs_action_idx').on(t.action),
  ],
);

/* -------------------------------- inference ------------------------------- */

export type Store = typeof stores.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
