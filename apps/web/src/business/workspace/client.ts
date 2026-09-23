import { z } from 'zod';
import {
  businessCustomerSchema,
  commercialEstimationSchema,
  organizationSchema,
  type OrganizationProfile,
  teamUserSchema,
  type TeamCreate,
  type TeamChange,
  type CustomerInput,
  type EstimationInput,
  type EstimationListQuery,
} from '@cieslacalc/business-core';
import {
  projectRecordV1Schema,
  type ProjectRecordV1,
} from '@cieslacalc/project-core';
import { quoteDraftSchema, type QuoteDraft } from '@cieslacalc/quote-core';
import { requestJson } from '../client';
import { resolveApiBaseUrl } from '../../api-base';

export const savedQuoteSchema = z.object({
  id: z.string(),
  commercialEstimationId: z.string(),
  number: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  snapshot: quoteDraftSchema,
});
export const estimationDetailSchema = z.object({
  estimation: commercialEstimationSchema,
  customer: businessCustomerSchema,
  project: projectRecordV1Schema,
  quote: savedQuoteSchema.optional(),
});
export const estimationSummarySchema = commercialEstimationSchema.extend({
  customerName: z.string(),
  quoteNumber: z.string().optional(),
  quoteFingerprint: z.string().optional(),
  missingPrices: z.number().optional(),
  netMinor: z.number().optional(),
  grossMinor: z.number().optional(),
  currencyCode: z.string().optional(),
  missingVat: z.number().optional(),
});
export type EstimationDetail = z.infer<typeof estimationDetailSchema>;
export type SavedQuote = z.infer<typeof savedQuoteSchema>;
const page = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ items: z.array(schema), nextOffset: z.number().optional() });
const item = <T extends z.ZodTypeAny>(schema: T) => z.object({ item: schema });
const path = (org: string, resource: string) =>
  `${resolveApiBaseUrl()}/business/organizations/${encodeURIComponent(org)}/${resource}`;
const json = (method: string, body: unknown) => ({
  method,
  body: JSON.stringify(body),
});
export const workspaceClient = {
  team: (org: string, q = '', offset = 0) =>
    requestJson(
      `${path(org, 'users')}?${new URLSearchParams({ q, offset: String(offset) })}`,
      z.object({
        items: z.array(teamUserSchema),
        activeUsers: z.number(),
        nextOffset: z.number().optional(),
      }),
    ),
  createTeamUser: async (org: string, input: TeamCreate) =>
    (
      await requestJson(
        path(org, 'users'),
        item(
          z.object({
            status: z.string(),
            temporaryPassword: z.string().optional(),
          }),
        ),
        json('POST', input),
      )
    ).item,
  changeTeamUser: (org: string, id: string, input: TeamChange) =>
    requestJson(
      path(org, `users/${encodeURIComponent(id)}`),
      item(z.object({ saved: z.boolean() })),
      json('PATCH', input),
    ),
  updateOrganizationProfile: async (
    org: string,
    profile: OrganizationProfile,
  ) =>
    (
      await requestJson(
        path(org, 'profile'),
        item(organizationSchema),
        json('PATCH', profile),
      )
    ).item,
  customers: (org: string, q = '', offset = 0) =>
    requestJson(
      `${path(org, 'customers')}?${new URLSearchParams({ q, offset: String(offset), limit: '30' })}`,
      page(businessCustomerSchema),
    ),
  createCustomer: async (org: string, input: CustomerInput) =>
    (
      await requestJson(
        path(org, 'customers'),
        item(businessCustomerSchema),
        json('POST', input),
      )
    ).item,
  updateCustomer: async (org: string, id: string, input: CustomerInput) =>
    (
      await requestJson(
        path(org, `customers/${encodeURIComponent(id)}`),
        item(businessCustomerSchema),
        json('PATCH', input),
      )
    ).item,
  estimations: (
    org: string,
    customerId?: string,
    offset = 0,
    query: Partial<EstimationListQuery> = {},
  ) =>
    requestJson(
      `${path(org, 'estimations')}?${new URLSearchParams({ ...query, offset: String(offset), limit: '30', ...(customerId ? { customerId } : {}) })}`,
      page(estimationSummarySchema),
    ),
  duplicateEstimation: async (org: string, id: string, newName: string) =>
    (
      await requestJson(
        path(org, `estimations/${encodeURIComponent(id)}/duplicate`),
        item(estimationDetailSchema),
        json('POST', { newName }),
      )
    ).item,
  archiveEstimation: (org: string, id: string) =>
    requestJson(
      path(org, `estimations/${encodeURIComponent(id)}/archive`),
      item(z.object({ archived: z.boolean() })),
      json('POST', {}),
    ),
  estimation: async (org: string, id: string) =>
    (
      await requestJson(
        path(org, `estimations/${encodeURIComponent(id)}`),
        item(estimationDetailSchema),
      )
    ).item,
  createEstimation: async (
    org: string,
    input: EstimationInput,
    project: ProjectRecordV1,
  ) =>
    (
      await requestJson(
        path(org, 'estimations'),
        item(estimationDetailSchema),
        json('POST', { input, project }),
      )
    ).item,
  saveProject: async (
    org: string,
    id: string,
    version: number,
    project: ProjectRecordV1,
  ) =>
    (
      await requestJson(
        path(org, `estimations/${encodeURIComponent(id)}`),
        item(z.object({ version: z.number().int().positive() })),
        json('PATCH', { version, project }),
      )
    ).item.version,
  saveQuote: async (
    org: string,
    id: string,
    snapshot: QuoteDraft,
    version?: number,
  ) =>
    (
      await requestJson(
        path(org, `estimations/${encodeURIComponent(id)}/quote`),
        item(savedQuoteSchema),
        json(version ? 'PATCH' : 'POST', {
          snapshot,
          ...(version ? { version } : {}),
        }),
      )
    ).item,
};
