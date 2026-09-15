import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCatalogDatabase } from '../db/client';
import { databaseFailureReason, diagnoseDatabase } from '../db/doctor';
import { findWorkspaceRoot } from '../environment';

async function main() {
  const journal = JSON.parse(
    await readFile(
      resolve(
        findWorkspaceRoot() ?? process.cwd(),
        'migrations/meta/_journal.json',
      ),
      'utf8',
    ),
  ) as { entries: unknown[] };
  const connection = createCatalogDatabase();
  try {
    const lines = await diagnoseDatabase(
      connection?.pool,
      journal.entries.length,
    );
    console.log(lines.join('\n'));
    if (connection && lines.includes('Database: unavailable'))
      process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}

main().catch((error: unknown) => {
  console.error(databaseFailureReason(error));
  process.exitCode = 1;
});
