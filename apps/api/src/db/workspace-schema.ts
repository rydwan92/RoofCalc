import {
  bigint,
  boolean,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { organizations } from './business-schema';

const id = (name: string) => varchar(name, { length: 128 });
const time = (name: string) => timestamp(name, { mode: 'date', fsp: 3 });
export const authUsers = mysqlTable('auth_users', {
  id: id('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: time('created_at').notNull(),
  updatedAt: time('updated_at').notNull(),
});
export const authSessions = mysqlTable(
  'auth_sessions',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: time('expires_at').notNull(),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [index('auth_session_user_idx').on(t.userId)],
);
export const authAccounts = mysqlTable(
  'auth_accounts',
  {
    id: id('id').primaryKey(),
    userId: id('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 64 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: time('access_token_expires_at'),
    refreshTokenExpiresAt: time('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
  },
  (t) => [
    index('auth_account_user_idx').on(t.userId),
    uniqueIndex('auth_provider_account_uq').on(t.providerId, t.accountId),
  ],
);
export const authVerifications = mysqlTable(
  'auth_verifications',
  {
    id: id('id').primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: time('expires_at').notNull(),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
);
export const authRateLimits = mysqlTable('auth_rate_limits', {
  id: id('id').primaryKey(),
  key: varchar('rate_key', { length: 255 }).notNull().unique(),
  count: int('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const organizationMemberships = mysqlTable(
  'organization_memberships',
  {
    organizationId: id('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: id('user_id')
      .notNull()
      .references(() => authUsers.id),
    role: varchar('role', { length: 16 }).notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('membership_user_idx').on(t.userId),
  ],
);
export const businessCustomers = mysqlTable(
  'business_customers',
  {
    id: id('id').primaryKey(),
    organizationId: id('organization_id')
      .notNull()
      .references(() => organizations.id),
    type: varchar('type', { length: 16 }).notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    companyName: varchar('company_name', { length: 240 }),
    taxId: varchar('tax_id', { length: 64 }),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 64 }),
    address: varchar('address', { length: 400 }),
    postalCode: varchar('postal_code', { length: 32 }),
    city: varchar('city', { length: 240 }),
    notes: text('notes'),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
    archivedAt: time('archived_at'),
  },
  (t) => [
    uniqueIndex('customer_org_id_uq').on(t.organizationId, t.id),
    index('customer_org_name_idx').on(t.organizationId, t.name),
  ],
);
export const commercialEstimations = mysqlTable(
  'commercial_estimations',
  {
    id: id('id').primaryKey(),
    organizationId: id('organization_id')
      .notNull()
      .references(() => organizations.id),
    customerId: id('customer_id').notNull(),
    roofProjectId: id('roof_project_id').notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    location: varchar('location', { length: 400 }),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    version: int('version').notNull().default(1),
    projectSnapshot: json('project_snapshot').notNull(),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
    createdBy: id('created_by').references(() => authUsers.id),
  },
  (t) => [
    uniqueIndex('estimation_org_id_uq').on(t.organizationId, t.id),
    index('estimation_org_updated_idx').on(t.organizationId, t.updatedAt),
    foreignKey({
      name: 'estimation_customer_scope_fk',
      columns: [t.organizationId, t.customerId],
      foreignColumns: [businessCustomers.organizationId, businessCustomers.id],
    }),
  ],
);
export const quoteCounters = mysqlTable(
  'quote_counters',
  {
    organizationId: id('organization_id')
      .notNull()
      .references(() => organizations.id),
    year: int('year').notNull(),
    value: int('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.year] })],
);
export const quoteDrafts = mysqlTable(
  'quote_drafts',
  {
    id: id('id').primaryKey(),
    organizationId: id('organization_id').notNull(),
    commercialEstimationId: id('commercial_estimation_id').notNull(),
    number: varchar('number', { length: 64 }).notNull(),
    schemaVersion: int('schema_version').notNull().default(1),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    snapshotJson: json('snapshot_json').notNull(),
    sourceFingerprint: varchar('source_fingerprint', { length: 128 }).notNull(),
    createdAt: time('created_at').notNull(),
    updatedAt: time('updated_at').notNull(),
    version: int('version').notNull().default(1),
  },
  (t) => [
    uniqueIndex('quote_org_number_uq').on(t.organizationId, t.number),
    uniqueIndex('quote_estimation_uq').on(
      t.organizationId,
      t.commercialEstimationId,
    ),
    foreignKey({
      name: 'quote_estimation_scope_fk',
      columns: [t.organizationId, t.commercialEstimationId],
      foreignColumns: [
        commercialEstimations.organizationId,
        commercialEstimations.id,
      ],
    }),
  ],
);
