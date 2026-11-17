import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

async function main(): Promise<void> {
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
  void pool.end();
});
