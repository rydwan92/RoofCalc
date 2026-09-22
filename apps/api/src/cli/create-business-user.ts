import '../environment';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { businessRoleSchema } from '@cieslacalc/business-core';
import { createCatalogDatabase } from '../db/client';
import { authUsers, authAccounts, organizationMemberships } from '../db/workspace-schema';
import { organizations } from '../db/business-schema';

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply required. Credentials are read from private environment variables, never command arguments.');
  const input = z.object({
    email: z.string().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128), name: z.string().trim().min(1).max(240),
    organizationId: z.string().min(1).max(128), role: businessRoleSchema,
  }).safeParse({ email: process.env.ROOFCALC_USER_EMAIL, password: process.env.ROOFCALC_USER_PASSWORD,
    name: process.env.ROOFCALC_USER_NAME, organizationId: process.env.ROOFCALC_USER_ORGANIZATION, role: process.env.ROOFCALC_USER_ROLE });
  if (!input.success) throw new Error('Invalid provisioning configuration. Supply email, name, 12–128 character password, organization ID and role in ROOFCALC_USER_* variables.');
  const connection = createCatalogDatabase();
  if (!connection) throw new Error('Database is not configured.');
  try {
    const password = await hashPassword(input.data.password), now = new Date(), id = crypto.randomUUID();
    await connection.db.transaction(async (tx) => {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.data.organizationId));
      if (!org) throw new Error('Organization does not exist.');
      const [existing] = await tx.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, input.data.email));
      if (existing) throw new Error('Account exists. Provisioning never overwrites an account or changes its membership.');
      await tx.insert(authUsers).values({ id, email: input.data.email, name: input.data.name, emailVerified: false, createdAt: now, updatedAt: now });
      await tx.insert(authAccounts).values({ id: crypto.randomUUID(), userId: id, accountId: id, providerId: 'credential', password, createdAt: now, updatedAt: now });
      await tx.insert(organizationMemberships).values({ organizationId: input.data.organizationId, userId: id, role: input.data.role });
    });
    console.log('Business account and membership created. No credentials are printed.');
  } finally { await connection.close(); }
}
void main().catch(() => { console.error('Business account provisioning failed. Verify private inputs, database availability, organization and duplicate email. No account was partially created.'); process.exitCode = 1; });
