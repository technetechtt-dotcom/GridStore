import { migrate } from '../db/migrate.js';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for migration smoke test');
    process.exit(1);
  }
  await migrate();
  console.log('Migration smoke test passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
