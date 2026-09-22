import { z } from 'zod';

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(240);
export const customerInputSchema = z
  .object({
    type: z.enum(['person', 'company']).default('person'),
    name: text.min(1),
    companyName: text.optional(),
    taxId: z.string().trim().max(64).optional(),
    email: z.union([z.literal(''), z.string().email().max(254)]).optional(),
    phone: z.string().trim().max(64).optional(),
    address: z.string().trim().max(400).optional(),
    postalCode: z.string().trim().max(32).optional(),
    city: text.optional(),
    notes: z.string().max(8000).optional(),
  })
  .strict();
export const businessCustomerSchema = customerInputSchema.extend({
  id,
  organizationId: id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});
export type BusinessCustomer = z.infer<typeof businessCustomerSchema>;
export type CustomerInput = z.infer<typeof customerInputSchema>;
export const estimationInputSchema = z
  .object({
    customerId: id,
    roofProjectId: id,
    name: text.min(1),
    location: z.string().trim().max(400).optional(),
  })
  .strict();
export const commercialEstimationSchema = estimationInputSchema.extend({
  id,
  organizationId: id,
  status: z.enum(['draft', 'quoted', 'archived']),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: id.optional(),
});
export type CommercialEstimation = z.infer<typeof commercialEstimationSchema>;
export type EstimationInput = z.infer<typeof estimationInputSchema>;
export const businessRoleSchema = z.enum(['owner', 'admin', 'sales']);
export type BusinessRole = z.infer<typeof businessRoleSchema>;
export type BusinessCapability =
  | 'business.read'
  | 'quote.write'
  | 'customers.write'
  | 'assortment.manage'
  | 'prices.manage';
export function roleCapabilities(role: BusinessRole): BusinessCapability[] {
  return role === 'sales'
    ? ['business.read', 'quote.write', 'customers.write']
    : [
        'business.read',
        'quote.write',
        'customers.write',
        'assortment.manage',
        'prices.manage',
      ];
}
