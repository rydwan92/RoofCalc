import {
  and,
  desc,
  eq,
  isNull,
  isNotNull,
  ne,
  like,
  or,
  sql,
} from 'drizzle-orm';
import {
  businessCustomerSchema,
  commercialEstimationSchema,
  type CustomerInput,
  type EstimationInput,
  estimationListQuerySchema,
  type EstimationListQuery,
} from '@cieslacalc/business-core';
import {
  projectRecordV1Schema,
  type ProjectRecordV1,
} from '@cieslacalc/project-core';
import {
  quoteDraftSchema,
  summarizeQuote,
  type QuoteDraft,
} from '@cieslacalc/quote-core';
import type { CatalogDatabase } from '../../db/client';
import { organizations } from '../../db/business-schema';
import {
  businessCustomers as customers,
  commercialEstimations as estimations,
  quoteCounters as counters,
  quoteDrafts as quotes,
} from '../../db/workspace-schema';
import {
  WorkspaceError,
  type WorkspaceRepository,
  type SavedQuote,
} from './contracts';

function clean(row: object) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
  );
}
const customerFrom = (row: typeof customers.$inferSelect) =>
  businessCustomerSchema.parse(clean(row));
const estimationFrom = (
  row: Omit<typeof estimations.$inferSelect, 'projectSnapshot'>,
) => {
  const metadata = clean(row);
  delete metadata.projectSnapshot;
  return commercialEstimationSchema.parse(metadata);
};
// MariaDB exposes JSON as text; native MySQL exposes an object. Both pass
// through the same strict snapshot validator after decoding.
const decodeJson = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;
const quoteFrom = (row: typeof quotes.$inferSelect): SavedQuote => ({
  id: row.id,
  commercialEstimationId: row.commercialEstimationId,
  number: row.number,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
  snapshot: quoteDraftSchema.parse(decodeJson(row.snapshotJson)),
});

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: CatalogDatabase) {}
  async listCustomers(
    org: string,
    search: string,
    limit: number,
    offset: number,
  ) {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    return (
      await this.db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.organizationId, org),
            isNull(customers.archivedAt),
            search
              ? or(
                  ...[
                    customers.name,
                    customers.companyName,
                    customers.taxId,
                    customers.phone,
                    customers.email,
                  ].map((column) => like(column, pattern)),
                )
              : undefined,
          ),
        )
        .orderBy(customers.name, customers.id)
        .limit(limit)
        .offset(offset)
    ).map(customerFrom);
  }
  async getCustomer(org: string, id: string) {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.organizationId, org), eq(customers.id, id)))
      .limit(1);
    return row ? customerFrom(row) : undefined;
  }
  async createCustomer(org: string, input: CustomerInput) {
    const id = crypto.randomUUID(),
      now = new Date();
    await this.db.insert(customers).values({
      ...input,
      id,
      organizationId: org,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getCustomer(org, id))!;
  }
  async updateCustomer(org: string, id: string, input: CustomerInput) {
    await this.db
      .update(customers)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(customers.organizationId, org), eq(customers.id, id)));
    return this.getCustomer(org, id);
  }
  async listEstimations(
    org: string,
    customerId: string | undefined,
    limit: number,
    offset: number,
    query: EstimationListQuery = estimationListQuerySchema.parse({}),
  ) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await this.db
      .select({
        estimation: {
          id: estimations.id,
          organizationId: estimations.organizationId,
          customerId: estimations.customerId,
          roofProjectId: estimations.roofProjectId,
          name: estimations.name,
          location: estimations.location,
          status: estimations.status,
          version: estimations.version,
          createdBy: estimations.createdBy,
          createdAt: estimations.createdAt,
          updatedAt: estimations.updatedAt,
        },
        customerName: sql<string>`coalesce(nullif(${customers.companyName}, ''), ${customers.name})`,
        quote: quotes,
      })
      .from(estimations)
      .innerJoin(
        customers,
        and(
          eq(customers.id, estimations.customerId),
          eq(customers.organizationId, org),
        ),
      )
      .leftJoin(
        quotes,
        and(
          eq(quotes.commercialEstimationId, estimations.id),
          eq(quotes.organizationId, org),
        ),
      )
      .where(
        and(
          eq(estimations.organizationId, org),
          customerId ? eq(estimations.customerId, customerId) : undefined,
          query.status === 'active'
            ? ne(estimations.status, 'archived')
            : query.status === 'all'
              ? undefined
              : eq(estimations.status, query.status),
          query.quote === 'with'
            ? isNotNull(quotes.id)
            : query.quote === 'without'
              ? isNull(quotes.id)
              : undefined,
          query.q
            ? or(
                ...[
                  estimations.name,
                  customers.name,
                  customers.companyName,
                  estimations.location,
                  quotes.number,
                ].map((column) => like(column, pattern)),
              )
            : undefined,
        ),
      )
      .orderBy(
        query.sort === 'name'
          ? estimations.name
          : query.sort === 'customer'
            ? sql`coalesce(nullif(${customers.companyName}, ''), ${customers.name})`
            : desc(estimations.updatedAt),
        estimations.id,
      )
      .limit(limit)
      .offset(offset);
    return rows.map((row) => {
      const draft = row.quote
        ? quoteDraftSchema.parse(decodeJson(row.quote.snapshotJson))
        : undefined;
      const totals = draft ? summarizeQuote(draft) : undefined;
      return {
        ...estimationFrom(row.estimation),
        customerName: row.customerName,
        ...(row.quote
          ? {
              quoteNumber: row.quote.number,
              quoteFingerprint: row.quote.sourceFingerprint,
              missingPrices: summarizeQuote(
                quoteDraftSchema.parse(decodeJson(row.quote.snapshotJson)),
              ).missingPriceCount,
              netMinor: totals!.netMinor,
              grossMinor: totals!.grossMinor,
              currencyCode: draft!.currencyCode,
              missingVat: totals!.missingVatCount,
            }
          : {}),
      };
    });
  }
  async archiveEstimation(org: string, id: string) {
    await this.db
      .update(estimations)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(estimations.organizationId, org), eq(estimations.id, id)));
  }
  async getEstimation(org: string, id: string) {
    const [row] = await this.db
      .select()
      .from(estimations)
      .where(and(eq(estimations.organizationId, org), eq(estimations.id, id)))
      .limit(1);
    if (!row) return undefined;
    const customer = await this.getCustomer(org, row.customerId);
    if (!customer) throw new WorkspaceError('customer-not-found', 404);
    const [quote] = await this.db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, org),
          eq(quotes.commercialEstimationId, id),
        ),
      )
      .limit(1);
    return {
      estimation: estimationFrom(row),
      customer,
      project: projectRecordV1Schema.parse(decodeJson(row.projectSnapshot)),
      ...(quote ? { quote: quoteFrom(quote) } : {}),
    };
  }
  async createEstimation(
    org: string,
    userId: string,
    input: EstimationInput,
    project: ProjectRecordV1,
  ) {
    const id = crypto.randomUUID(),
      now = new Date();
    await this.db.insert(estimations).values({
      ...input,
      id,
      organizationId: org,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      projectSnapshot: project,
    });
    return (await this.getEstimation(org, id))!;
  }
  async saveProject(
    org: string,
    id: string,
    version: number,
    project: ProjectRecordV1,
  ) {
    const [result] = await this.db
      .update(estimations)
      .set({
        projectSnapshot: project,
        updatedAt: new Date(),
        version: version + 1,
      })
      .where(
        and(
          eq(estimations.organizationId, org),
          eq(estimations.id, id),
          eq(estimations.version, version),
        ),
      );
    if (result.affectedRows !== 1)
      throw new WorkspaceError('estimation-version-conflict', 409);
    return version + 1;
  }
  async createQuote(org: string, estimationId: string, draft: QuoteDraft) {
    return this.db.transaction(async (tx) => {
      // Lock the parent first: concurrent first saves cannot allocate two drafts.
      const [parent] = await tx
        .select()
        .from(estimations)
        .where(
          and(
            eq(estimations.organizationId, org),
            eq(estimations.id, estimationId),
          ),
        )
        .for('update');
      if (!parent) throw new WorkspaceError('estimation-not-found', 404);
      const [existing] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.organizationId, org),
            eq(quotes.commercialEstimationId, estimationId),
          ),
        );
      if (existing) throw new WorkspaceError('quote-version-conflict', 409);
      const now = new Date(),
        year = now.getUTCFullYear();
      await tx
        .insert(counters)
        .values({ organizationId: org, year, value: 0 })
        .onDuplicateKeyUpdate({ set: { value: sql`${counters.value}` } });
      const counterScope = and(
        eq(counters.organizationId, org),
        eq(counters.year, year),
      );
      const [counter] = await tx
        .select()
        .from(counters)
        .where(counterScope)
        .for('update');
      const value = counter!.value + 1;
      await tx.update(counters).set({ value }).where(counterScope);
      const id = crypto.randomUUID(),
        number = `OF/${year}/${String(value).padStart(6, '0')}`;
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, org));
      if (!organization)
        throw new WorkspaceError('organization-not-found', 404);
      const snapshot = quoteDraftSchema.parse({
        ...draft,
        organizationSnapshot: {
          id: org,
          name: organization.name,
          ...Object.fromEntries(
            [
              'taxId',
              'address',
              'phone',
              'email',
              'website',
              'logoUrl',
            ].flatMap((key) => {
              const value = organization[key as keyof typeof organization];
              return value ? [[key, value]] : [];
            }),
          ),
        },
        footer: organization.offerFooter || undefined,
        id,
        number,
        createdAt: now.toISOString(),
      });
      await tx.insert(quotes).values({
        id,
        organizationId: org,
        commercialEstimationId: estimationId,
        number,
        currencyCode: snapshot.currencyCode,
        snapshotJson: snapshot,
        sourceFingerprint: snapshot.sourceFingerprint,
        createdAt: now,
        updatedAt: now,
      });
      await tx
        .update(estimations)
        .set({
          status: parent.status === 'archived' ? 'archived' : 'quoted',
          updatedAt: now,
        })
        .where(
          and(
            eq(estimations.organizationId, org),
            eq(estimations.id, estimationId),
          ),
        );
      return {
        id,
        commercialEstimationId: estimationId,
        number,
        version: 1,
        updatedAt: now.toISOString(),
        snapshot,
      };
    });
  }
  async saveQuote(
    org: string,
    estimationId: string,
    version: number,
    draft: QuoteDraft,
  ) {
    return this.db.transaction(async (tx) => {
      const scope = and(
        eq(quotes.organizationId, org),
        eq(quotes.commercialEstimationId, estimationId),
      );
      const [row] = await tx.select().from(quotes).where(scope).for('update');
      if (!row) throw new WorkspaceError('quote-not-found', 404);
      if (row.version !== version)
        throw new WorkspaceError('quote-version-conflict', 409);
      if (draft.currencyCode !== row.currencyCode)
        throw new WorkspaceError('quote-currency-immutable');
      const previous = quoteDraftSchema.parse(decodeJson(row.snapshotJson)),
        now = new Date();
      const snapshot = quoteDraftSchema.parse({
        ...draft,
        organizationSnapshot: previous.organizationSnapshot,
        footer: previous.footer,
        id: row.id,
        number: row.number,
        createdAt: previous.createdAt,
      });
      await tx
        .update(quotes)
        .set({
          snapshotJson: snapshot,
          sourceFingerprint: snapshot.sourceFingerprint,
          updatedAt: now,
          version: version + 1,
        })
        .where(and(scope, eq(quotes.version, version)));
      await tx
        .update(estimations)
        .set({ updatedAt: now })
        .where(
          and(
            eq(estimations.organizationId, org),
            eq(estimations.id, estimationId),
          ),
        );
      return {
        id: row.id,
        commercialEstimationId: estimationId,
        number: row.number,
        version: version + 1,
        updatedAt: now.toISOString(),
        snapshot,
      };
    });
  }
}
