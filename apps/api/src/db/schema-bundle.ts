import * as catalogSchema from './schema';
import * as pricingSchema from './pricing-schema';

/** The sole Drizzle schema shared by Node and Cloudflare runtimes. */
export const schema = { ...catalogSchema, ...pricingSchema };
