import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import type { CatalogDatabase } from '../../db/client';
import { organizations } from '../../db/business-schema';
import {
  authAccounts,
  authRateLimits,
  authUsers,
  organizationMemberships,
} from '../../db/workspace-schema';

const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
    confirmPassword: z.string(),
    token: z.string().min(1).max(512),
    companyName: z.string().trim().max(240).optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
  });

export type BootstrapError =
  | 'bootstrap-closed'
  | 'bootstrap-organization-ambiguous'
  | 'bootstrap-invalid-request'
  | 'bootstrap-invalid-token'
  | 'bootstrap-rate-limited';

export interface SetupStatus {
  database: 'connected' | 'unavailable';
  auth: 'configured' | 'unconfigured';
  firstOwner: 'required' | 'configured';
  bootstrap: 'available' | 'unavailable';
  organization: 'existing' | 'new' | 'ambiguous' | 'unknown';
}

export const bootstrapEnabled = (token?: string) =>
  !!token && token.length >= 32;

async function activeOwnerExists(db: CatalogDatabase): Promise<boolean> {
  const rows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.organizationId),
    )
    .where(
      and(
        eq(organizationMemberships.role, 'owner'),
        eq(organizationMemberships.active, true),
        eq(organizations.active, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function readSetupStatus(
  db: CatalogDatabase | undefined,
  authConfigured: boolean,
  token?: string,
): Promise<SetupStatus> {
  if (!db)
    return {
      database: 'unavailable',
      auth: authConfigured ? 'configured' : 'unconfigured',
      firstOwner: 'required',
      bootstrap: 'unavailable',
      organization: 'unknown',
    };
  const [owner, activeOrganizations] = await Promise.all([
    activeOwnerExists(db),
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.active, true))
      .limit(2),
  ]);
  const organization =
    activeOrganizations.length > 1
      ? 'ambiguous'
      : activeOrganizations.length === 1
        ? 'existing'
        : 'new';
  return {
    database: 'connected',
    auth: authConfigured ? 'configured' : 'unconfigured',
    firstOwner: owner ? 'configured' : 'required',
    bootstrap:
      !owner &&
      authConfigured &&
      bootstrapEnabled(token) &&
      organization !== 'ambiguous'
        ? 'available'
        : 'unavailable',
    organization,
  };
}

async function tokenMatches(supplied: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left),
    b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

/** The reserved rate-limit row serializes competing first-owner transactions. */
export async function bootstrapFirstOwner(
  db: CatalogDatabase,
  expectedToken: string,
  raw: unknown,
): Promise<
  | { status: 201; body: { created: true } }
  | { status: number; body: { error: { code: BootstrapError } } }
> {
  const parsed = inputSchema.safeParse(raw);
  const reject = (status: number, code: BootstrapError) => ({
    status,
    body: { error: { code } },
  });
  return db.transaction(async (tx) => {
    const marker = 'roofcalc:first-owner-bootstrap';
    await tx
      .insert(authRateLimits)
      .values({ id: marker, key: marker, count: 0, lastRequest: 0 })
      .onDuplicateKeyUpdate({ set: { id: sql`${authRateLimits.id}` } });
    const [attempts] = await tx
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.key, marker))
      .for('update');
    if (!attempts) return reject(503, 'bootstrap-invalid-request');
    if (await activeOwnerExists(tx as CatalogDatabase))
      return reject(409, 'bootstrap-closed');
    if (!parsed.success) return reject(400, 'bootstrap-invalid-request');
    const now = Math.floor(Date.now() / 1000);
    const count = now - attempts.lastRequest < 60 ? attempts.count + 1 : 1;
    await tx
      .update(authRateLimits)
      .set({ count, lastRequest: now })
      .where(eq(authRateLimits.key, marker));
    if (count > 10) return reject(429, 'bootstrap-rate-limited');
    if (!(await tokenMatches(parsed.data.token, expectedToken)))
      return reject(403, 'bootstrap-invalid-token');
    const activeOrganizations = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.active, true))
      .limit(2);
    if (activeOrganizations.length > 1)
      return reject(409, 'bootstrap-organization-ambiguous');
    const [existing] = await tx
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, parsed.data.email))
      .limit(1);
    if (existing) return reject(400, 'bootstrap-invalid-request');
    let organizationId = activeOrganizations[0]?.id;
    if (!organizationId) {
      if (!parsed.data.companyName)
        return reject(400, 'bootstrap-invalid-request');
      organizationId = crypto.randomUUID();
      await tx.insert(organizations).values({
        id: organizationId,
        slug: `company-${organizationId}`,
        name: parsed.data.companyName,
        currencyCode: 'PLN',
      });
    }
    const userId = crypto.randomUUID();
    const timestamp = new Date();
    await tx.insert(authUsers).values({
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      emailVerified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(authAccounts).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: await hashPassword(parsed.data.password),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(organizationMemberships).values({
      organizationId,
      userId,
      role: 'owner',
    });
    return { status: 201 as const, body: { created: true as const } };
  });
}
