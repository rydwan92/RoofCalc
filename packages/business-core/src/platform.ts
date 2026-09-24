import { z } from 'zod';
import { businessRoleSchema } from './workspace';

/**
 * RoofCalc platform administration contracts (system console). A platform
 * admin operates RoofCalc itself; organization roles never imply it.
 */

const count = z.number().int().nonnegative();

export const platformSystemSchema = z.object({
  database: z.enum(['connected', 'unavailable']),
  auth: z.enum(['configured', 'unconfigured']),
  serverVersion: z.string().optional(),
  runtime: z.enum(['node', 'cloudflare-worker']),
  appVersion: z.string(),
  gitSha: z.string().optional(),
  migrations: z
    .object({
      state: z.enum(['current', 'missing', 'outdated']),
      applied: count,
      expected: count,
    })
    .optional(),
  seeds: z
    .record(
      z.enum(['catalogue', 'pricing', 'business']),
      z.object({
        state: z.enum(['current', 'missing', 'outdated']),
        current: count,
        expected: count,
      }),
    )
    .optional(),
});
export type PlatformSystem = z.infer<typeof platformSystemSchema>;

export const platformCountsSchema = z.object({
  organizations: count,
  activeOrganizations: count,
  users: count,
  customers: count,
  estimations: count,
  quotes: count,
  manufacturers: count,
  technicalFamilies: count,
  commercialVariants: count,
  assortmentItems: count,
});
export type PlatformCounts = z.infer<typeof platformCountsSchema>;

export const platformOverviewSchema = z.object({
  system: platformSystemSchema,
  counts: platformCountsSchema,
});
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;

export const platformOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  currencyCode: z.string(),
  active: z.boolean(),
  members: count,
  owners: z.array(z.object({ name: z.string(), email: z.string() })),
  assortmentItems: count,
  customers: count,
  estimations: count,
  quotes: count,
});
export type PlatformOrganization = z.infer<typeof platformOrganizationSchema>;

export const platformMembershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  role: businessRoleSchema,
  active: z.boolean(),
});

export const platformUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  platformAdmin: z.boolean(),
  memberships: z.array(platformMembershipSchema),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformCatalogueSchema = z.object({
  manufacturers: count,
  technicalFamilies: count,
  revisions: count,
  commercialVariants: count,
  byKind: z.array(z.object({ kind: z.string(), families: count })),
});
export type PlatformCatalogue = z.infer<typeof platformCatalogueSchema>;

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const platformCreateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(240),
  slug: slugSchema,
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .default('PLN'),
});

export const platformOrganizationStateSchema = z.object({
  active: z.boolean(),
});

export const platformMembershipRequestSchema = z.object({
  organizationId: z.string().trim().min(1).max(128),
  email: z.string().trim().toLowerCase().email().max(254),
  role: businessRoleSchema,
  active: z.boolean().default(true),
});

/** Slug suggestion shared by the form and the server: ASCII, lowercase. */
export function suggestOrganizationSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}
