import '../environment';
import { createCatalogDatabase } from '../db/client';
import {
  provisionBusinessUser,
  provisioningInputSchema,
} from '../business/auth/provision';

async function main() {
  if (!process.argv.includes('--apply')) {
    console.error(
      'Explicit --apply required. Supply ROOFCALC_USER_EMAIL, PASSWORD, NAME, ORGANIZATION and ROLE through private environment variables.',
    );
    process.exitCode = 1;
    return;
  }
  const input = provisioningInputSchema.safeParse({
    email: process.env.ROOFCALC_USER_EMAIL,
    password: process.env.ROOFCALC_USER_PASSWORD,
    name: process.env.ROOFCALC_USER_NAME,
    organizationId: process.env.ROOFCALC_USER_ORGANIZATION,
    role: process.env.ROOFCALC_USER_ROLE,
  });
  if (!input.success) {
    console.error(
      'Invalid provisioning fields: ' +
        input.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
    process.exitCode = 1;
    return;
  }
  const connection = createCatalogDatabase();
  if (!connection) throw new Error('Database unavailable.');
  try {
    const result = await provisionBusinessUser(connection.db, input.data);
    console.log(
      {
        'user-created': 'User created and membership added.',
        'membership-added':
          'Membership added to existing user. Credentials unchanged.',
        'already-exists':
          'User and membership already exist. Credentials and role unchanged.',
      }[result.status],
    );
  } finally {
    await connection.close();
  }
}
void main().catch(() => {
  console.error(
    'Provisioning failed. Check database access, active organization and duplicate email. Transaction rolled back; no credentials are printed.',
  );
  process.exitCode = 1;
});
