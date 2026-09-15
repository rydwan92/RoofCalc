import { createCatalogDatabase } from '../db/client';

/**
 * First-run bootstrap step (V35): a fresh Docker Compose MariaDB container
 * accepts TCP connections before its `healthcheck.sh --innodb_initialized`
 * condition is actually true, so a bare `db:migrate` right after `db:up`
 * can race a not-yet-ready server. Retries a plain `SELECT 1` with backoff
 * instead of trusting Compose's own healthcheck timing.
 */
const MAX_ATTEMPTS = 30;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

async function main() {
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required to wait for the database.');
  try {
    let attempt = 0;
    let delayMs = INITIAL_DELAY_MS;
    for (;;) {
      attempt += 1;
      try {
        await connection.pool.query('SELECT 1');
        console.log(JSON.stringify({ status: 'ready', attempts: attempt }));
        return;
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        console.error(JSON.stringify({ status: 'waiting', attempt, delayMs }));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 1.5, MAX_DELAY_MS);
      }
    }
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: {
        code: 'db-not-ready',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }),
  );
  process.exitCode = 1;
});
