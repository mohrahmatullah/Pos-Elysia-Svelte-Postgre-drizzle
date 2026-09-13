/** Seed data: store, roles, users, permissions, categories, products, customers.
 * Passwords are hashed with Argon2id at seed time.
 *
 * IDEMPOTENT: safe to re-run. Existing rows are reused, only missing rows are inserted.
 * Decisions implemented here:
 *  - Permission catalog synced from code definitions into `permissions` table (explicit rows)
 *  - Role permissions seeded from ROLE_PERMISSIONS defaults into `role_permissions`,
 *    but only for roles that have no permission rows yet (re-runs never overwrite UI edits)
 *  - Owner gets the full set via seed, not a runtime `if role === owner` rule
 */
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import * as s from './schema';
import { ROLE_PERMISSIONS } from '../lib/permissions';
import { upsertPermissionCatalog } from './permission';
import { db, pool } from './index';

const DEFAULT_PASSWORD = 'Passw0rd!';

async function main() {
  console.log('Seeding...');

  // ----------------------------- Store (reuse first) -----------------------------
  let [store] = await db.select().from(s.stores).limit(1);
  if (!store) {
    [store] = await db
      .insert(s.stores)
      .values({
        name: 'Toko Maju Jaya',
        address: 'Jl. Merdeka No. 123, Jakarta',
        phone: '021-555-0123',
        currency: 'IDR',
        timezone: 'Asia/Jakarta',
        receipt_footer: 'Terima kasih telah berbelanja!',
        invoice_prefix: 'INV',
        tax_rate: '11.00',
      })
      .returning();
    console.log('   Store created');
  } else {
    console.log('   Store reused');
  }

  // ------------------------- Roles (upsert by unique name) -----------------------
  await db.insert(s.roles).values([{ name: 'owner' }, { name: 'manager' }, { name: 'cashier' }]).onConflictDoNothing();
  const roleRows = await db.select().from(s.roles);
  const roleByName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  // ------------- Permission catalog: explicit rows in `permissions` table --------
  await upsertPermissionCatalog();
  console.log('   Permission catalog synced');

  // ---- Role permissions: seed defaults ONLY for roles with no rows (no UI clobber) ----
  for (const [roleName, roleId] of Object.entries(roleByName)) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.rolePermissions)
      .where(eq(s.rolePermissions.role_id, roleId));
    if (count > 0) continue;
    const codes = ROLE_PERMISSIONS[roleName] ?? [];
    if (!codes.length) continue;
    await db
      .insert(s.rolePermissions)
      .values(codes.map((code) => ({ role_id: roleId, permission_code: code })))
      .onConflictDoNothing();
  }
  console.log('   Role permissions ensured');

  // ------------------------------- Users (by email) ------------------------------
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const demoUsers = [
    { store_id: store.id, role_id: roleByName.owner, name: 'Owner', email: 'owner@pos.local', password_hash: passwordHash },
    { store_id: store.id, role_id: roleByName.manager, name: 'Manager', email: 'manager@pos.local', password_hash: passwordHash },
    { store_id: store.id, role_id: roleByName.cashier, name: 'Kasir Satu', email: 'cashier@pos.local', password_hash: passwordHash },
  ];
  await db.insert(s.users).values(demoUsers).onConflictDoNothing(); // users_email_uq
  const [firstUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, 'owner@pos.local')).limit(1);
  console.log('   Users ensured (owner@pos.local | manager@pos.local | cashier@pos.local)');

  // ----------------------------- Categories (by name) ----------------------------
  const existingCats = await db.select({ name: s.categories.name }).from(s.categories).where(eq(s.categories.store_id, store.id));
  const haveCat = new Set(existingCats.map((c) => c.name));
  const wantedCats = ['Makanan', 'Minuman', 'Kebersihan'].filter((n) => !haveCat.has(n));
  if (wantedCats.length) {
    await db.insert(s.categories).values(wantedCats.map((name) => ({ store_id: store.id, name }))).onConflictDoNothing();
  }
  const categoryRows = await db.select().from(s.categories).where(eq(s.categories.store_id, store.id));
  const cat = (name: string) => categoryRows.find((c) => c.name === name)!.id;

  // ------------------------------- Products (by sku) -----------------------------
  const wantedProducts = [
    { category_id: cat('Makanan'), sku: 'SKU-001', barcode: '899100210001', name: 'Indomie Goreng', unit: 'pcs', cost_price: '2800', selling_price: '3500', minimum_stock: 50, tax_rate: '0' },
    { category_id: cat('Makanan'), sku: 'SKU-002', barcode: '899100210002', name: 'Chitato Sapi Panggang', unit: 'pcs', cost_price: '8000', selling_price: '11000', minimum_stock: 20, tax_rate: '0' },
    { category_id: cat('Makanan'), sku: 'SKU-003', barcode: '899100210003', name: 'Beras Premium 5kg', unit: 'sak', cost_price: '62000', selling_price: '72000', minimum_stock: 5, tax_rate: '0' },
    { category_id: cat('Minuman'), sku: 'SKU-004', barcode: '899100210004', name: 'Aqua 600ml', unit: 'botol', cost_price: '2500', selling_price: '4000', minimum_stock: 48, tax_rate: '0' },
    { category_id: cat('Minuman'), sku: 'SKU-005', barcode: '899100210005', name: 'Teh Pucuk 350ml', unit: 'botol', cost_price: '3000', selling_price: '4500', minimum_stock: 24, tax_rate: '0' },
    { category_id: cat('Minuman'), sku: 'SKU-006', barcode: '899100210006', name: 'Kopi Kapal Api', unit: 'pcs', cost_price: '1500', selling_price: '2000', minimum_stock: 30, tax_rate: '0' },
    { category_id: cat('Kebersihan'), sku: 'SKU-007', barcode: '899100210007', name: 'Sabun Lifebuoy', unit: 'pcs', cost_price: '3500', selling_price: '5000', minimum_stock: 20, tax_rate: '0' },
    { category_id: cat('Kebersihan'), sku: 'SKU-008', barcode: '899100210008', name: 'Rinso Anti Noda 770g', unit: 'pcs', cost_price: '17000', selling_price: '21500', minimum_stock: 10, tax_rate: '0' },
  ];
  const existingSkus = new Set(
    (await db.select({ sku: s.products.sku }).from(s.products).where(eq(s.products.store_id, store.id))).map((p) => p.sku),
  );
  const newProducts = wantedProducts.filter((p) => !existingSkus.has(p.sku));
  const productRows = newProducts.length
    ? await db.insert(s.products).values(newProducts.map((p) => ({ ...p, store_id: store.id }))).returning()
    : [];
  console.log(`   Products ensured (${newProducts.length} baru, ${existingSkus.size} sudah ada)`);

  // ------------------- Initial stock movements for new products ------------------
  if (productRows.length && firstUser) {
    await db.insert(s.stockMovements).values(
      productRows.map((p) => ({
        store_id: store.id,
        product_id: p.id,
        movement_type: 'INITIAL' as const,
        quantity_in: 100,
        quantity_out: 0,
        reference_type: 'INITIAL' as const,
        note: 'Stok awal',
        created_by: firstUser.id,
      })),
    );
  }

  // ------------------------------ Customers (by name) ----------------------------
  const existingCust = new Set(
    (await db.select({ name: s.customers.name }).from(s.customers).where(eq(s.customers.store_id, store.id))).map((c) => c.name),
  );
  const wantedCustomers = [
    { store_id: store.id, name: 'Budi Santoso', phone: '081234567890', email: 'budi@example.com' },
    { store_id: store.id, name: 'Siti Aminah', phone: '082198765432' },
    { store_id: store.id, name: 'Walk-in', notes: 'Pelanggan umum (placeholder)' },
  ].filter((c) => !existingCust.has(c.name));
  if (wantedCustomers.length) {
    await db.insert(s.customers).values(wantedCustomers);
  }

  console.log('✅ Seed complete');
  console.log(`   Store: ${store.name} (${store.id})`);
  console.log(`   Login: owner@pos.local | manager@pos.local | cashier@pos.local — password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
