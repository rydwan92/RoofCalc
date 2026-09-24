import { and, count, eq, inArray, like, or, sql } from 'drizzle-orm';
import {
  platformCreateOrganizationSchema,
  platformMembershipRequestSchema,
  platformOrganizationStateSchema,
  type PlatformCatalogue,
  type PlatformCounts,
  type PlatformOrganization,
  type PlatformUser,
} from '@cieslacalc/business-core';
import { businessRoleSchema } from '@cieslacalc/business-core';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { CatalogDatabase } from '../../db/client';
import {
  organizationAssortmentItems,
  organizations,
} from '../../db/business-schema';
import {
  commercialVariants,
  manufacturers,
  technicalProductFamilies,
  technicalProductRevisions,
} from '../../db/schema';
import {
  authUsers,
  businessCustomers,
  commercialEstimations,
  organizationMemberships,
  platformAdmins,
  quoteDrafts,
} from '../../db/workspace-schema';
import { provisionBusinessUser } from '../auth/provision';

export class PlatformError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

const pattern = (query: string | undefined) => {
  const text = query?.trim();
  return text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
};

/** Count rows per organization for one table, as a lookup. */
async function perOrganization(
  db: CatalogDatabase,
  table:
    | typeof organizationAssortmentItems
    | typeof businessCustomers
    | typeof commercialEstimations
    | typeof quoteDrafts
    | typeof organizationMemberships,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ organizationId: table.organizationId, value: count() })
    .from(table)
    .groupBy(table.organizationId);
  return new Map(rows.map((row) => [row.organizationId, Number(row.value)]));
}

async function total(db: CatalogDatabase, table: MySqlTable): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table);
  return Number(row?.value ?? 0);
}

/**
 * Operator-level reads and writes over every organization. Authorization
 * (authenticated session + active platform admin) is checked by the caller;
 * nothing here consults organization capabilities.
 */
export class PlatformService {
  constructor(private readonly db: CatalogDatabase) {}

  async counts(): Promise<PlatformCounts> {
    const db = this.db;
    const [active] = await db
      .select({ value: count() })
      .from(organizations)
      .where(eq(organizations.active, true));
    const [
      organizationsTotal,
      users,
      customers,
      estimations,
      quotes,
      makers,
      families,
      variants,
      assortment,
    ] = await Promise.all([
      total(db, organizations),
      total(db, authUsers),
      total(db, businessCustomers),
      total(db, commercialEstimations),
      total(db, quoteDrafts),
      total(db, manufacturers),
      total(db, technicalProductFamilies),
      total(db, commercialVariants),
      total(db, organizationAssortmentItems),
    ]);
    return {
      organizations: organizationsTotal,
      activeOrganizations: Number(active?.value ?? 0),
      users,
      customers,
      estimations,
      quotes,
      manufacturers: makers,
      technicalFamilies: families,
      commercialVariants: variants,
      assortmentItems: assortment,
    };
  }

  async serverVersion(): Promise<string | undefined> {
    try {
      const [rows] = await this.db.execute(sql`SELECT VERSION() AS version`);
      const version = (rows as unknown as Array<{ version?: unknown }>)[0]
        ?.version;
      // "10.4.27-MariaDB" / "10.11.6-MariaDB-log": product and version only.
      return typeof version === 'string'
        ? version.replace(/-(log|debug)$/i, '')
        : undefined;
    } catch {
      return undefined;
    }
  }

  async organizations(query?: string): Promise<PlatformOrganization[]> {
    const db = this.db;
    const search = pattern(query);
    const rows = await db
      .select()
      .from(organizations)
      .where(
        search
          ? or(
              like(organizations.name, search),
              like(organizations.slug, search),
            )
          : undefined,
      )
      .orderBy(organizations.name);
    const [members, assortment, customers, estimations, quotes] =
      await Promise.all([
        perOrganization(db, organizationMemberships),
        perOrganization(db, organizationAssortmentItems),
        perOrganization(db, businessCustomers),
        perOrganization(db, commercialEstimations),
        perOrganization(db, quoteDrafts),
      ]);
    const owners = rows.length
      ? await db
          .select({
            organizationId: organizationMemberships.organizationId,
            name: authUsers.name,
            email: authUsers.email,
          })
          .from(organizationMemberships)
          .innerJoin(
            authUsers,
            eq(authUsers.id, organizationMemberships.userId),
          )
          .where(
            and(
              eq(organizationMemberships.role, 'owner'),
              eq(organizationMemberships.active, true),
              inArray(
                organizationMemberships.organizationId,
                rows.map((row) => row.id),
              ),
            ),
          )
      : [];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      currencyCode: row.currencyCode,
      active: row.active,
      members: members.get(row.id) ?? 0,
      owners: owners
        .filter((owner) => owner.organizationId === row.id)
        .map(({ name, email }) => ({ name, email })),
      assortmentItems: assortment.get(row.id) ?? 0,
      customers: customers.get(row.id) ?? 0,
      estimations: estimations.get(row.id) ?? 0,
      quotes: quotes.get(row.id) ?? 0,
    }));
  }

  async createOrganization(raw: unknown): Promise<PlatformOrganization> {
    const input = platformCreateOrganizationSchema.parse(raw);
    const [existing] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, input.slug));
    if (existing) throw new PlatformError('platform-slug-taken', 409);
    const id = `org:${input.slug}`;
    await this.db.insert(organizations).values({
      id,
      slug: input.slug,
      name: input.name,
      currencyCode: input.currencyCode,
      active: true,
    });
    const [created] = await this.organizations(input.slug);
    return created!;
  }

  /** Deactivation is reversible; organizations are never hard-deleted here. */
  async setOrganizationActive(id: string, raw: unknown) {
    const { active } = platformOrganizationStateSchema.parse(raw);
    const result = await this.db
      .update(organizations)
      .set({ active })
      .where(eq(organizations.id, id));
    if (!(result[0] as { affectedRows?: number }).affectedRows)
      throw new PlatformError('platform-organization-not-found', 404);
    return { id, active };
  }

  async users(query?: string): Promise<PlatformUser[]> {
    const db = this.db;
    const search = pattern(query);
    const users = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(
        search
          ? or(like(authUsers.name, search), like(authUsers.email, search))
          : undefined,
      )
      .orderBy(authUsers.email)
      .limit(200);
    if (!users.length) return [];
    const ids = users.map((user) => user.id);
    const [memberships, admins] = await Promise.all([
      db
        .select({
          userId: organizationMemberships.userId,
          organizationId: organizationMemberships.organizationId,
          organizationName: organizations.name,
          role: organizationMemberships.role,
          active: organizationMemberships.active,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizations.id, organizationMemberships.organizationId),
        )
        .where(inArray(organizationMemberships.userId, ids)),
      db
        .select({ userId: platformAdmins.userId })
        .from(platformAdmins)
        .where(
          and(
            inArray(platformAdmins.userId, ids),
            eq(platformAdmins.active, true),
          ),
        ),
    ]);
    const adminIds = new Set(admins.map((row) => row.userId));
    return users.map((user) => ({
      ...user,
      platformAdmin: adminIds.has(user.id),
      memberships: memberships
        .filter((row) => row.userId === user.id)
        .flatMap((row) => {
          const role = businessRoleSchema.safeParse(row.role);
          return role.success
            ? [
                {
                  organizationId: row.organizationId,
                  organizationName: row.organizationName,
                  role: role.data,
                  active: row.active,
                },
              ]
            : [];
        }),
    }));
  }

  /**
   * Adds an existing user to an organization or changes their role/state.
   * An organization always keeps at least one active owner.
   */
  async setMembership(raw: unknown) {
    const input = platformMembershipRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.email, input.email));
      if (!user) throw new PlatformError('platform-user-not-found', 404);
      const [organization] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .for('update');
      if (!organization)
        throw new PlatformError('platform-organization-not-found', 404);
      const [current] = await tx
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, input.organizationId),
            eq(organizationMemberships.userId, user.id),
          ),
        );
      const losesOwner =
        current?.role === 'owner' &&
        current.active &&
        (input.role !== 'owner' || !input.active);
      if (losesOwner) {
        const [owners] = await tx
          .select({ value: count() })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, input.organizationId),
              eq(organizationMemberships.role, 'owner'),
              eq(organizationMemberships.active, true),
            ),
          );
        if (Number(owners?.value ?? 0) <= 1)
          throw new PlatformError('platform-last-owner', 409);
      }
      if (current)
        await tx
          .update(organizationMemberships)
          .set({ role: input.role, active: input.active })
          .where(
            and(
              eq(organizationMemberships.organizationId, input.organizationId),
              eq(organizationMemberships.userId, user.id),
            ),
          );
      else
        await tx.insert(organizationMemberships).values({
          organizationId: input.organizationId,
          userId: user.id,
          role: input.role,
          active: input.active,
        });
      return {
        userId: user.id,
        organizationId: input.organizationId,
        role: input.role,
        active: input.active,
      };
    });
  }

  /** New account through the one existing secure provisioning service. */
  async createUser(raw: unknown) {
    try {
      return await provisionBusinessUser(this.db, raw);
    } catch (error) {
      if (error instanceof Error && error.message.includes('organization'))
        throw new PlatformError('platform-organization-not-found', 404);
      throw error;
    }
  }

  async catalogue(): Promise<PlatformCatalogue> {
    const db = this.db;
    const [makers, families, revisions, variants, byKind] = await Promise.all([
      total(db, manufacturers),
      total(db, technicalProductFamilies),
      total(db, technicalProductRevisions),
      total(db, commercialVariants),
      db
        .select({
          kind: technicalProductFamilies.coveringKind,
          families: count(),
        })
        .from(technicalProductFamilies)
        .groupBy(technicalProductFamilies.coveringKind),
    ]);
    return {
      manufacturers: makers,
      technicalFamilies: families,
      revisions,
      commercialVariants: variants,
      byKind: byKind
        .map((row) => ({ kind: row.kind, families: Number(row.families) }))
        .sort((a, b) => b.families - a.families),
    };
  }
}
