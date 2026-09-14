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
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import * as s from './schema';
import { ROLE_PERMISSIONS } from '../lib/permissions';
import { upsertPermissionCatalog } from './permission';
import { grantMissingPermissionsToOwner } from './permission-catalog';
import { db, pool } from './index';
// (userStores used via s.userStores below)

const DEFAULT_PASSWORD = 'Passw0rd!';

async function main() {
  console.log('Seeding...');

  // ----------------------------- Store (reuse first) -----------------------------
  // Deterministic: the OLDEST store is the original (limit(1) alone is unordered and
  // can drift between runs when extra stores exist).
  let [store] = await db.select().from(s.stores).orderBy(asc(s.stores.created_at)).limit(1);
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

  // ---------------- Second store (multi-store demo, HYBRID) ----------------------
  // Created once; owner gets a membership so they can switch between stores.
  // HYBRID so the resto module (tables/orders/kitchen) is demo-able here too.
  let [store2] = await db.select().from(s.stores).where(eq(s.stores.name, 'Toko Cabang Kelapa Gading')).limit(1);
  if (!store2) {
    [store2] = await db
      .insert(s.stores)
      .values({
        name: 'Toko Cabang Kelapa Gading',
        address: 'Jl. Boulevard Raya No. 45, Jakarta Utara',
        phone: '021-555-0456',
        invoice_prefix: 'CGD',
        tax_rate: '11.00',
        business_type: 'HYBRID',
      })
      .returning();
    console.log('   Second store created (HYBRID)');
  } else if (store2.business_type !== 'HYBRID') {
    // Older seeds created it as RETAIL before the resto module existed.
    await db.update(s.stores).set({ business_type: 'HYBRID' }).where(eq(s.stores.id, store2.id));
    console.log('   Second store upgraded to HYBRID');
  }

  // -------------------- User-store memberships (multi-store) ---------------------
  // Owner manages ALL stores; staff stay bound to their home store. New memberships
  // are additive (onConflictDoNothing) so re-runs and UI edits are never clobbered.
  const [ownerUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, 'owner@pos.local')).limit(1);
  if (ownerUser) {
    await db
      .insert(s.userStores)
      .values([
        { user_id: ownerUser.id, store_id: store.id },
        { user_id: ownerUser.id, store_id: store2.id },
      ])
      .onConflictDoNothing();
  }
  const [managerUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, 'manager@pos.local')).limit(1);
  if (managerUser) {
    await db
      .insert(s.userStores)
      .values([{ user_id: managerUser.id, store_id: store.id }, { user_id: managerUser.id, store_id: store2.id }])
      .onConflictDoNothing();
  }
  const [cashierUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, 'cashier@pos.local')).limit(1);
  if (cashierUser) {
    await db.insert(s.userStores).values([{ user_id: cashierUser.id, store_id: store.id }]).onConflictDoNothing();
  }
  console.log('   User-store memberships ensured (owner: all stores)');

  // ------------------------- Roles (upsert by unique name) -----------------------
  await db.insert(s.roles).values([{ name: 'owner' }, { name: 'manager' }, { name: 'cashier' }]).onConflictDoNothing();
  const roleRows = await db.select().from(s.roles);
  const roleByName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  // ------------- Permission catalog: explicit rows in `permissions` table --------
  await upsertPermissionCatalog();
  // Catalog codes added later (e.g. menu.*) are granted to the owner here so a
  // re-seed keeps the owner complete without a runtime owner rule.
  await grantMissingPermissionsToOwner();
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

  // ---- Channel role gap-fix: roles seeded BEFORE the channel permissions miss
  // them. Grants are additive (never revokes what the UI configured) and re-run
  // safely on every re-seed.
  for (const [roleName, gapCodes] of [
    ['manager', ['retail.manage', 'resto.view', 'resto.order', 'resto.settle', 'kitchen.view'] as const],
    ['cashier', ['retail.manage', 'resto.view', 'resto.order'] as const],
  ] as const) {
    const roleId = roleByName[roleName];
    if (!roleId) continue;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.rolePermissions)
      .where(and(eq(s.rolePermissions.role_id, roleId), inArray(s.rolePermissions.permission_code, [...gapCodes])));
    if (count >= gapCodes.length) continue;
    await db
      .insert(s.rolePermissions)
      .values(gapCodes.map((permission_code) => ({ role_id: roleId, permission_code })))
      .onConflictDoNothing();
    console.log(`   Resto gap-fix: ${roleName} granted ${[...gapCodes].join(', ')}`);
  }

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

  async function ensureGroup(label: string, icon: string | null, sortOrder: number, businessScope: 'RETAIL' | 'RESTO' | null = null): Promise<string> {
    const existingRow = groupByLabel.get(label);
    if (existingRow) {
      if (existingRow.icon !== icon || existingRow.sort_order !== sortOrder || existingRow.business_scope !== businessScope) {
        await db
          .update(s.menus)
          .set({ icon, sort_order: sortOrder, business_scope: businessScope, updated_at: new Date() })
          .where(eq(s.menus.id, existingRow.id));
      }
      return existingRow.id;
    }
    const [row] = await db
      .insert(s.menus)
      .values({ label, href: null, icon, sort_order: sortOrder, business_scope: businessScope })
      .returning({ id: s.menus.id });
    return row.id;
  }

  async function ensureItem(input: {
    label: string;
    href: string;
    icon: string | null;
    permission_code: string;
    parent_id: string | null;
    sort_order: number;
    business_scope?: 'RETAIL' | 'RESTO' | null;
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
          business_scope: input.business_scope ?? null,
          updated_at: new Date(),
        })
        .where(eq(s.menus.id, existingRow.id));
      return;
    }
    await db.insert(s.menus).values({ ...input, business_scope: input.business_scope ?? null }).onConflictDoNothing();
  }

  // Top-level standalone
  await ensureItem({ label: 'Dashboard', href: '/', icon: 'mdi:view-dashboard-outline', permission_code: 'dashboard.view', parent_id: null, sort_order: 10 });
  await ensureItem({ label: 'Toko', href: '/stores', icon: 'mdi:store-cog-outline', permission_code: 'store.view', parent_id: null, sort_order: 15 });

  // Group: Resto (business_scope RESTO — hidden for RETAIL stores; the GROUP itself
  // is scoped so custom child menus cannot leak the whole group into retail).
  const restoId = await ensureGroup('Resto', 'mdi:silverware-fork-knife', 35, 'RESTO');
  await ensureItem({ label: 'POS Resto', href: '/resto', icon: 'mdi:food-outline', permission_code: 'resto.view', parent_id: restoId, sort_order: 36, business_scope: 'RESTO' });
  await ensureItem({ label: 'Meja', href: '/resto/tables', icon: 'mdi:table-furniture', permission_code: 'table.manage', parent_id: restoId, sort_order: 37, business_scope: 'RESTO' });
  await ensureItem({ label: 'Kitchen Display', href: '/kitchen', icon: 'mdi:chef-hat', permission_code: 'kitchen.view', parent_id: restoId, sort_order: 38, business_scope: 'RESTO' });

  // Group: Master Data
  const masterId = await ensureGroup('Master Data', 'mdi:database-outline', 20);
  await ensureItem({ label: 'Products', href: '/products', icon: 'mdi:package-variant-closed', permission_code: 'product.view', parent_id: masterId, sort_order: 21 });
  await ensureItem({ label: 'Categories', href: '/categories', icon: 'mdi:tag-multiple-outline', permission_code: 'category.view', parent_id: masterId, sort_order: 24 });
  await ensureItem({ label: 'Inventory', href: '/inventory', icon: 'mdi:warehouse', permission_code: 'inventory.view', parent_id: masterId, sort_order: 22 });
  await ensureItem({ label: 'Customers', href: '/customers', icon: 'mdi:account-group-outline', permission_code: 'customer.view', parent_id: masterId, sort_order: 23 });

  // Group: Transaksi (POS Kasir is retail-scope; history is shared)
  const trxId = await ensureGroup('Transaksi', 'mdi:briefcase-outline', 30);
  // Retail POS is scoped RETAIL + gated by its own channel permission, so a resto
  // store never sees the retail kasir menu even if the role has sales.create.
  await ensureItem({ label: 'POS / Kasir', href: '/pos', icon: 'mdi:point-of-sale', permission_code: 'retail.manage', parent_id: trxId, sort_order: 31, business_scope: 'RETAIL' });
  await ensureItem({ label: 'Riwayat Sales', href: '/sales', icon: 'mdi:receipt-text-outline', permission_code: 'sales.view', parent_id: trxId, sort_order: 32 });

  // Group: Laporan (group-gated: the header carries report.view for its children)
  const reportId = await ensureGroup('Laporan', 'mdi:chart-box-outline', 40);
  await db.update(s.menus).set({ permission_code: 'report.view', updated_at: new Date() }).where(eq(s.menus.id, reportId));
  await ensureItem({ label: 'Reports', href: '/reports', icon: 'mdi:file-chart-outline', permission_code: 'report.view', parent_id: reportId, sort_order: 41 });

  // Group: Sistem
  const sysId = await ensureGroup('Sistem', 'mdi:cog-outline', 50);
  await ensureItem({ label: 'Users', href: '/users', icon: 'mdi:account-key-outline', permission_code: 'user.view', parent_id: sysId, sort_order: 51 });
  await ensureItem({ label: 'Role & Permission', href: '/roles', icon: 'mdi:shield-account-outline', permission_code: 'user.manage', parent_id: sysId, sort_order: 52 });
  await ensureItem({ label: 'Menus', href: '/menus', icon: 'mdi:compass-outline', permission_code: 'menu.view', parent_id: sysId, sort_order: 53 });
  await ensureItem({ label: 'Audit Log', href: '/audit', icon: 'mdi:text-box-search-outline', permission_code: 'audit.view', parent_id: sysId, sort_order: 54 });
  await ensureItem({ label: 'Store Settings', href: '/settings', icon: 'mdi:cog-outline', permission_code: 'settings.manage', parent_id: sysId, sort_order: 55 });

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

  // ------------------- Resto floor plan demo (areas + tables) --------------------
  // Only for stores with resto features; additive, so user edits are never clobbered.
  {
    const businessType = await db
      .select({ t: s.stores.business_type })
      .from(s.stores)
      .where(eq(s.stores.id, store.id))
      .limit(1)
      .then((r) => r[0]?.t);
    if (businessType === 'RESTO' || businessType === 'HYBRID') {
      const haveAreas = await db.select({ name: s.diningAreas.name }).from(s.diningAreas).where(eq(s.diningAreas.store_id, store.id));
      const areaNames = ['Indoor', 'Teras'];
      const missing = areaNames.filter((n) => !haveAreas.some((a) => a.name === n));
      if (missing.length) {
        await db
          .insert(s.diningAreas)
          .values(missing.map((name, i) => ({ store_id: store.id, name, sort_order: i })))
          .onConflictDoNothing();
      }
      const areaRows = await db.select().from(s.diningAreas).where(eq(s.diningAreas.store_id, store.id));
      const area = (name: string) => areaRows.find((a) => a.name === name)?.id ?? null;
      const existingTables = await db.select({ code: s.restoTables.code }).from(s.restoTables).where(eq(s.restoTables.store_id, store.id));
      const haveTable = new Set(existingTables.map((t) => t.code));
      const wantedTables = [
        { code: 'T1', seats: 2, area_id: area('Indoor') },
        { code: 'T2', seats: 4, area_id: area('Indoor') },
        { code: 'T3', seats: 4, area_id: area('Indoor') },
        { code: 'T4', seats: 6, area_id: area('Indoor') },
        { code: 'R1', seats: 2, area_id: area('Teras') },
        { code: 'R2', seats: 4, area_id: area('Teras') },
      ].filter((t) => !haveTable.has(t.code));
      if (wantedTables.length) {
        await db.insert(s.restoTables).values(wantedTables.map((t) => ({ ...t, store_id: store.id })));
      }
      console.log(`   Resto floor ensured (areas: ${areaNames.join(', ')})`);
    }
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
