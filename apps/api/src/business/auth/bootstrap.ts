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
  platformAdmins,
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
  firstOwner: 'required' | 'configured' | 'unknown';
  bootstrap: 'available' | 'unavailable';
  organization: 'existing' | 'new' | 'ambiguous' | 'unknown';
}

export const bootstrapEnabled = (token?: string) =>
  !!token && token.length >= 32;
export const BOOTSTRAP_MARKER = 'roofcalc:first-owner-bootstrap';

async function anyOwnerExists(db: CatalogDatabase): Promise<boolean> {
  const rows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.role, 'owner'))
    .limit(1);
  return rows.length > 0;
}

/** The reserved row is the cross-transport serialization point. */
export async function lockBootstrapMarker(db: CatalogDatabase) {
  await db
    .insert(authRateLimits)
    .values({
      id: BOOTSTRAP_MARKER,
      key: BOOTSTRAP_MARKER,
      count: 0,
      lastRequest: 0,
    })
    .onDuplicateKeyUpdate({ set: { id: sql`${authRateLimits.id}` } });
  const [marker] = await db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, BOOTSTRAP_MARKER))
    .for('update');
  return marker;
}

/** A successful owner creation permanently closes browser bootstrap. */
export async function markBootstrapConsumed(
  db: CatalogDatabase,
): Promise<void> {
  await db
    .update(authRateLimits)
    .set({ count: -1 })
    .where(eq(authRateLimits.key, BOOTSTRAP_MARKER));
}

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
      firstOwner: 'unknown',
      bootstrap: 'unavailable',
      organization: 'unknown',
    };
  let owner: boolean;
  let previousOwner: boolean;
  let consumed: boolean;
  let activeOrganizations: Array<{ id: string }>;
  try {
    const [activeOwner, everOwner, markerRows, organizationsRows] =
      await Promise.all([
        activeOwnerExists(db),
        anyOwnerExists(db),
        db
          .select({ count: authRateLimits.count })
          .from(authRateLimits)
          .where(eq(authRateLimits.key, BOOTSTRAP_MARKER))
          .limit(1),
        db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.active, true))
          .limit(2),
      ]);
    owner = activeOwner;
    previousOwner = everOwner;
    consumed = markerRows[0]?.count === -1;
    activeOrganizations = organizationsRows;
  } catch {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      return {
        database: 'unavailable',
        auth: authConfigured ? 'configured' : 'unconfigured',
        firstOwner: 'unknown',
        bootstrap: 'unavailable',
        organization: 'unknown',
      };
    }
    return {
      database: 'connected',
      auth: authConfigured ? 'configured' : 'unconfigured',
      firstOwner: 'unknown',
      bootstrap: 'unavailable',
      organization: 'unknown',
    };
  }
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
      !previousOwner &&
      !consumed &&
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
    const attempts = await lockBootstrapMarker(tx as CatalogDatabase);
    if (!attempts) return reject(503, 'bootstrap-invalid-request');
    if (attempts.count === -1 || (await anyOwnerExists(tx as CatalogDatabase)))
      return reject(409, 'bootstrap-closed');
    const now = Math.floor(Date.now() / 1000);
    const count = now - attempts.lastRequest < 60 ? attempts.count + 1 : 1;
    await tx
      .update(authRateLimits)
      .set({ count, lastRequest: now })
      .where(eq(authRateLimits.key, BOOTSTRAP_MARKER));
    if (count > 10) return reject(429, 'bootstrap-rate-limited');
    if (!parsed.success) return reject(400, 'bootstrap-invalid-request');
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
    // The bootstrap secret is platform-level, so its first owner is also the
    // first platform admin. Later organization owners never are implicitly.
    await tx
      .insert(platformAdmins)
      .values({ userId, active: true, createdAt: timestamp });
    await markBootstrapConsumed(tx as CatalogDatabase);
    return { status: 201 as const, body: { created: true as const } };
  });
}
