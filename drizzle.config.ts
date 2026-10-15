import './apps/api/src/environment';
// Type-only: drizzle-kit is installed in apps/api, not at the workspace root,
// so a runtime import here fails on a clean `pnpm install` (no hoisting). The
// config is a plain object; `defineConfig` was only an identity helper.
import type { Config } from 'drizzle-kit';
import { parseDatabaseUrl } from './apps/api/src/db/config';

// Same parser (and TLS policy) as the Node API, bootstrap and doctor.
const { password, ...credentials } = parseDatabaseUrl(
  process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/cieslacalc',
);

export default {
  dialect: 'mysql',
  schema: [
    './apps/api/src/db/schema.ts',
    './apps/api/src/db/pricing-schema.ts',
    './apps/api/src/db/business-schema.ts',
    './apps/api/src/db/workspace-schema.ts',
  ],
  out: './migrations',
  // drizzle-kit rejects an empty password string; a passwordless local
  // account (XAMPP's default root) must omit the field instead.
  dbCredentials: password ? { ...credentials, password } : credentials,
  strict: true,
  verbose: true,
} satisfies Config;
