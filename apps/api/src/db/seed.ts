/**
 * Seed data: store, roles, users (owner/manager/cashier), categories, products, customers.
 * Passwords are hashed with Argon2id at seed time.
 * All actions after seeding are auditable through normal API flows.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import * as s from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://pos:pos_password@localhost:5432/pos',
});
const db = drizzle(pool);

const DEFAULT_PASSWORD = 'Passw0rd!';

async function main() {
  console.log('Seeding...');

  // Store
  const [store] = await db
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

  // Roles
  const roleRows = await db
    .insert(s.roles)
    .values([{ name: 'owner' }, { name: 'manager' }, { name: 'cashier' }])
    .returning();
  const roleByName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  // Users
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const userRows = await db
    .insert(s.users)
    .values([
      {
        store_id: store.id,
        role_id: roleByName.owner,
        name: 'Owner',
        email: 'owner@pos.local',
        password_hash: passwordHash,
      },
      {
        store_id: store.id,
        role_id: roleByName.manager,
        name: 'Manager',
        email: 'manager@pos.local',
        password_hash: passwordHash,
      },
      {
        store_id: store.id,
        role_id: roleByName.cashier,
        name: 'Kasir Satu',
        email: 'cashier@pos.local',
        password_hash: passwordHash,
      },
    ])
    .returning();
  const cashier = userRows.find((u) => u.email === 'cashier@pos.local')!;

  // Categories
  const categoryRows = await db
    .insert(s.categories)
    .values([
      { store_id: store.id, name: 'Makanan' },
      { store_id: store.id, name: 'Minuman' },
      { store_id: store.id, name: 'Kebersihan' },
    ])
    .returning();
  const cat = (name: string) => categoryRows.find((c) => c.name === name)!.id;

  // Products
  const productRows = await db
    .insert(s.products)
    .values([
      { store_id: store.id, category_id: cat('Makanan'), sku: 'SKU-001', barcode: '899100210001', name: 'Indomie Goreng', unit: 'pcs', cost_price: '2800', selling_price: '3500', minimum_stock: 50, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Makanan'), sku: 'SKU-002', barcode: '899100210002', name: 'Chitato Sapi Panggang', unit: 'pcs', cost_price: '8000', selling_price: '11000', minimum_stock: 20, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Makanan'), sku: 'SKU-003', barcode: '899100210003', name: 'Beras Premium 5kg', unit: 'sak', cost_price: '62000', selling_price: '72000', minimum_stock: 5, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Minuman'), sku: 'SKU-004', barcode: '899100210004', name: 'Aqua 600ml', unit: 'botol', cost_price: '2500', selling_price: '4000', minimum_stock: 48, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Minuman'), sku: 'SKU-005', barcode: '899100210005', name: 'Teh Pucuk 350ml', unit: 'botol', cost_price: '3000', selling_price: '4500', minimum_stock: 24, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Minuman'), sku: 'SKU-006', barcode: '899100210006', name: 'Kopi Kapal Api', unit: 'pcs', cost_price: '1500', selling_price: '2000', minimum_stock: 30, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Kebersihan'), sku: 'SKU-007', barcode: '899100210007', name: 'Sabun Lifebuoy', unit: 'pcs', cost_price: '3500', selling_price: '5000', minimum_stock: 20, tax_rate: '0' },
      { store_id: store.id, category_id: cat('Kebersihan'), sku: 'SKU-008', barcode: '899100210008', name: 'Rinso Anti Noda 770g', unit: 'pcs', cost_price: '17000', selling_price: '21500', minimum_stock: 10, tax_rate: '0' },
    ])
    .returning();

  // Initial stock movements
  await db.insert(s.stockMovements).values(
    productRows.map((p) => ({
      store_id: store.id,
      product_id: p.id,
      movement_type: 'INITIAL' as const,
      quantity_in: 100,
      quantity_out: 0,
      reference_type: 'INITIAL' as const,
      note: 'Stok awal',
      created_by: userRows[0].id,
    })),
  );

  // Customers
  await db.insert(s.customers).values([
    { store_id: store.id, name: 'Budi Santoso', phone: '081234567890', email: 'budi@example.com' },
    { store_id: store.id, name: 'Siti Aminah', phone: '082198765432' },
    { store_id: store.id, name: 'Walk-in', notes: 'Pelanggan umum (placeholder)' },
  ]);

  console.log('✅ Seed complete');
  console.log(`   Store: ${store.name} (${store.id})`);
  console.log(`   Login: owner@pos.local | manager@pos.local | cashier@pos.local — password: ${DEFAULT_PASSWORD}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await pool.end();
  process.exit(1);
});
