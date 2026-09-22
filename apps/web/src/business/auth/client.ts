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
        ]),
      ),
    }),
  ),
});
export type BusinessSession = z.infer<typeof sessionSchema>;
export const sessionClient = {
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
