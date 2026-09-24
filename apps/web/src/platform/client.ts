import { z } from 'zod';
import {
  platformCatalogueSchema,
  platformOrganizationSchema,
  platformOverviewSchema,
  platformSystemSchema,
  platformUserSchema,
} from '@cieslacalc/business-core';
import { requestJson } from '../business/client';
import { resolveApiBaseUrl } from '../api-base';

const base = () => `${resolveApiBaseUrl()}/platform`;
const query = (q?: string) => (q?.trim() ? `?q=${encodeURIComponent(q)}` : '');

/** RoofCalc system console API; every call needs a platform-admin session. */
export const platformClient = {
  overview: () => requestJson(`${base()}/overview`, platformOverviewSchema),
  system: () => requestJson(`${base()}/database/status`, platformSystemSchema),
  organizations: (q?: string) =>
    requestJson(
      `${base()}/organizations${query(q)}`,
      z.object({ items: z.array(platformOrganizationSchema) }),
    ),
  createOrganization: (input: {
    name: string;
    slug: string;
    currencyCode: string;
  }) =>
    requestJson(
      `${base()}/organizations`,
      z.object({ item: platformOrganizationSchema }),
      { method: 'POST', body: JSON.stringify(input) },
    ),
  setOrganizationActive: (id: string, active: boolean) =>
    requestJson(
      `${base()}/organizations/${encodeURIComponent(id)}`,
      z.unknown(),
      {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      },
    ),
  users: (q?: string) =>
    requestJson(
      `${base()}/users${query(q)}`,
      z.object({ items: z.array(platformUserSchema) }),
    ),
  setMembership: (input: {
    organizationId: string;
    email: string;
    role: 'owner' | 'admin' | 'sales';
    active: boolean;
  }) =>
    requestJson(`${base()}/memberships`, z.unknown(), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createUser: (input: {
    organizationId: string;
    name: string;
    email: string;
    password: string;
    role: 'owner' | 'admin' | 'sales';
  }) =>
    requestJson(`${base()}/users`, z.unknown(), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  catalogue: () =>
    requestJson(`${base()}/catalogue/status`, platformCatalogueSchema),
};
