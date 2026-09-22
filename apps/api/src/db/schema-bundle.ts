import * as catalogSchema from './schema';
import * as pricingSchema from './pricing-schema';
import * as businessSchema from './business-schema';
import * as workspaceSchema from './workspace-schema';

/** The sole Drizzle schema shared by Node and Cloudflare runtimes. */
export const schema = {
  ...catalogSchema,
  ...pricingSchema,
  ...businessSchema,
  ...workspaceSchema,
};
