import { z } from 'zod';
import { requestJson } from '../client';
import { resolveApiBaseUrl } from '../../api-base';

const sessionSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  memberships: z.array(
    z.object({
      organizationId: z.string(),
      role: z.enum(['owner', 'admin', 'sales']).optional(),
      capabilities: z.array(
        z.enum([
          'business.read',
          'quote.write',
          'customers.write',
          'assortment.manage',
          'prices.manage',
          'organization.manage',
          'users.manage',
        ]),
      ),
    }),
  ),
});
export type BusinessSession = z.infer<typeof sessionSchema>;
const setupStatusSchema = z.object({
  database: z.enum(['connected', 'unavailable']),
  auth: z.enum(['configured', 'unconfigured']),
  firstOwner: z.enum(['required', 'configured']),
  bootstrap: z.enum(['available', 'unavailable']),
  organization: z.enum(['existing', 'new', 'ambiguous', 'unknown']),
});
export const sessionClient = {
  setupStatus: () =>
    requestJson(`${resolveApiBaseUrl()}/setup/status`, setupStatusSchema, {
      signal: AbortSignal.timeout(10_000),
    }),
  bootstrap: (input: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    token: string;
    companyName?: string;
  }) =>
    requestJson(
      `${resolveApiBaseUrl()}/setup/first-owner`,
      z.object({ created: z.literal(true) }),
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  session: () =>
    requestJson(`${resolveApiBaseUrl()}/business/session`, sessionSchema),
  signIn: (email: string, password: string) =>
    requestJson(`${resolveApiBaseUrl()}/auth/sign-in/email`, z.unknown(), {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signOut: () =>
    requestJson(`${resolveApiBaseUrl()}/auth/sign-out`, z.unknown(), {
      method: 'POST',
      body: '{}',
    }),
};
