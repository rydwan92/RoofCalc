import './apps/api/src/environment';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: [
    './apps/api/src/db/schema.ts',
    './apps/api/src/db/pricing-schema.ts',
  ],
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root@127.0.0.1:3306/cieslacalc',
  },
  strict: true,
  verbose: true,
});
