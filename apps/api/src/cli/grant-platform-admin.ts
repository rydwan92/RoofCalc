import '../environment';
import { eq } from 'drizzle-orm';
import { createCatalogDatabase } from '../db/client';
import { describeDatabaseTarget, isLoopbackHost } from '../db/config';
import { authUsers, platformAdmins } from '../db/workspace-schema';

/**
 * Private operator command: grants the RoofCalc platform-admin authority to
 * an existing account (for databases whose first owner predates it).
 *   pnpm platform:grant-admin -- --email owner@example.com --apply
 * A remote database additionally needs ROOFCALC_DB_ENV=shared-dev.
 */
function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = valueAfter('--email')?.trim().toLowerCase();
  if (!email) throw new Error('Usage: --email <address> --apply');
  const connection = createCatalogDatabase();
  if (!connection) throw new Error('DATABASE_URL is required.');
  try {
    if (
      !isLoopbackHost(connection.options.host) &&
      process.env.ROOFCALC_DB_ENV !== 'shared-dev'
    )
      throw new Error('Remote target requires ROOFCALC_DB_ENV=shared-dev.');
    const [user] = await connection.db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, email));
    if (!user) throw new Error('No account with that email.');
    console.log(`Target: ${describeDatabaseTarget(connection.options)}`);
    if (!process.argv.includes('--apply')) {
      console.log('Dry run: add --apply to grant platform admin.');
      return;
    }
    await connection.db
      .insert(platformAdmins)
      .values({ userId: user.id, active: true, createdAt: new Date() })
      .onDuplicateKeyUpdate({ set: { active: true } });
    console.log('Platform admin granted.');
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Grant failed.');
  process.exitCode = 1;
});
