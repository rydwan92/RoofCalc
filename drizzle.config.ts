import './apps/api/src/environment';
import { defineConfig } from 'drizzle-kit';
import { parseDatabaseUrl } from './apps/api/src/db/config';

// Same parser (and TLS policy) as the Node API, bootstrap and doctor.
const credentials = parseDatabaseUrl(
  process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/cieslacalc',
);

export default defineConfig({
  dialect: 'mysql',
  schema: [
    './apps/api/src/db/schema.ts',
    './apps/api/src/db/pricing-schema.ts',
    './apps/api/src/db/business-schema.ts',
    './apps/api/src/db/workspace-schema.ts',
  ],
  out: './migrations',
  dbCredentials: credentials,
  strict: true,
  verbose: true,
});
