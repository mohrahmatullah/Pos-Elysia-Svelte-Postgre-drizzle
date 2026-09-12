import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://pos:pos_password@localhost:5432/pos',
});

try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('✅ migrations applied');
} catch (err) {
  console.error('❌ migration failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
