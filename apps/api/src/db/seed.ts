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

  // ------------------ Menus (DB-driven sidebar, grouped) ------------------------
  // Group headers have href = null; children carry permissions. The seed ENFORCES the
  // desired structure: existing rows (from older flat seeds) are re-parented/updated,
  // missing rows are inserted. User-created menus are never touched.
  const allMenus = await db.select().from(s.menus);
  const byHref = new Map(allMenus.filter((m) => m.href).map((m) => [m.href!, m]));
  const groupByLabel = new Map(allMenus.filter((m) => !m.href).map((m) => [m.label, m]));

  async function ensureGroup(label: string, icon: string | null, sortOrder: number): Promise<string> {
    const existingRow = groupByLabel.get(label);
    if (existingRow) {
      if (existingRow.icon !== icon || existingRow.sort_order !== sortOrder) {
        await db.update(s.menus).set({ icon, sort_order: sortOrder, updated_at: new Date() }).where(eq(s.menus.id, existingRow.id));
      }
      return existingRow.id;
    }
    const [row] = await db.insert(s.menus).values({ label, href: null, icon, sort_order: sortOrder }).returning({ id: s.menus.id });
    return row.id;
  }

  async function ensureItem(input: {
    label: string;
    href: string;
    icon: string | null;
    permission_code: string;
    parent_id: string | null;
    sort_order: number;
  }): Promise<void> {
    const existingRow = byHref.get(input.href);
    if (existingRow) {
      await db
        .update(s.menus)
        .set({
          label: input.label,
          icon: input.icon,
          permission_code: input.permission_code,
          parent_id: input.parent_id,
          sort_order: input.sort_order,
          updated_at: new Date(),
        })
        .where(eq(s.menus.id, existingRow.id));
      return;
    }
    await db.insert(s.menus).values(input).onConflictDoNothing();
  }

  // Top-level standalone
  await ensureItem({ label: 'Dashboard', href: '/', icon: 'mdi:view-dashboard-outline', permission_code: 'dashboard.view', parent_id: null, sort_order: 10 });

  // Group: Master Data
  const masterId = await ensureGroup('Master Data', 'mdi:database-outline', 20);
  await ensureItem({ label: 'Products', href: '/products', icon: 'mdi:package-variant-closed', permission_code: 'product.view', parent_id: masterId, sort_order: 21 });
  await ensureItem({ label: 'Inventory', href: '/inventory', icon: 'mdi:warehouse', permission_code: 'inventory.view', parent_id: masterId, sort_order: 22 });
  await ensureItem({ label: 'Customers', href: '/customers', icon: 'mdi:account-group-outline', permission_code: 'customer.view', parent_id: masterId, sort_order: 23 });

  // Group: Transaksi
  const trxId = await ensureGroup('Transaksi', 'mdi:briefcase-outline', 30);
  await ensureItem({ label: 'POS / Kasir', href: '/pos', icon: 'mdi:point-of-sale', permission_code: 'sales.create', parent_id: trxId, sort_order: 31 });
  await ensureItem({ label: 'Riwayat Sales', href: '/sales', icon: 'mdi:receipt-text-outline', permission_code: 'sales.view', parent_id: trxId, sort_order: 32 });

  // Group: Laporan (group-gated: the header carries report.view for its children)
  const reportId = await ensureGroup('Laporan', 'mdi:chart-box-outline', 40);
  await db.update(s.menus).set({ permission_code: 'report.view', updated_at: new Date() }).where(eq(s.menus.id, reportId));
  await ensureItem({ label: 'Reports', href: '/reports', icon: 'mdi:file-chart-outline', permission_code: 'report.view', parent_id: reportId, sort_order: 41 });

  // Group: Sistem
  const sysId = await ensureGroup('Sistem', 'mdi:cog-outline', 50);
  await ensureItem({ label: 'Users', href: '/users', icon: 'mdi:account-key-outline', permission_code: 'user.manage', parent_id: sysId, sort_order: 51 });
  await ensureItem({ label: 'Role & Permission', href: '/roles', icon: 'mdi:shield-account-outline', permission_code: 'user.manage', parent_id: sysId, sort_order: 52 });
  await ensureItem({ label: 'Menus', href: '/menus', icon: 'mdi:compass-outline', permission_code: 'user.manage', parent_id: sysId, sort_order: 53 });
  await ensureItem({ label: 'Audit Log', href: '/audit', icon: 'mdi:text-box-search-outline', permission_code: 'audit.view', parent_id: sysId, sort_order: 54 });
  await ensureItem({ label: 'Store Settings', href: '/settings', icon: 'mdi:cog-outline', permission_code: 'settings.manage', parent_id: sysId, sort_order: 55 });

  // Cleanup: stray row from an earlier partial grouped seed (no /categories page exists)
  await db.delete(s.menus).where(eq(s.menus.href, '/categories'));

  console.log('   Menus ensured (grouped: Master Data, Transaksi, Laporan, Sistem)');

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
