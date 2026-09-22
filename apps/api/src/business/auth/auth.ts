import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { CatalogDatabase } from '../../db/client';
import {
  authUsers,
  authSessions,
  authAccounts,
  authVerifications,
  authRateLimits,
} from '../../db/workspace-schema';

export interface AuthConfiguration {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
}
export interface BusinessAuth {
  handler: (request: Request) => Promise<Response>;
  api: { getSession: (input: { headers: Headers }) => Promise<{ user: { id: string; name: string; email: string } } | null> };
}
export function createBusinessAuth(
  db: CatalogDatabase,
  configuration: AuthConfiguration,
): BusinessAuth | undefined {
  const secret = configuration.BETTER_AUTH_SECRET,
    baseURL = configuration.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) return undefined;
  const url = new URL(baseURL);
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return undefined;
  return betterAuth({
    appName: 'RoofCalc Business',
    secret,
    baseURL: url.origin,
    database: drizzleAdapter(db, {
      provider: 'mysql',
      transaction: true,
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 10 } },
    },
    trustedOrigins: [url.origin],
    advanced: { useSecureCookies: url.protocol === 'https:' },
    logger: { disabled: true },
  });
}
