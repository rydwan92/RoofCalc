import { and, eq } from 'drizzle-orm';
import {
  businessRoleSchema,
  roleCapabilities,
  type BusinessCapability,
} from '@cieslacalc/business-core';
import type { CatalogDatabase } from '../../db/client';
import {
  organizationMemberships,
  platformAdmins,
} from '../../db/workspace-schema';
import { organizations } from '../../db/business-schema';
import type { BusinessAuth } from './auth';

export interface BusinessAccess {
  user: { id: string; name: string; email: string };
  memberships: {
    organizationId: string;
    role?: 'owner' | 'admin' | 'sales';
    capabilities: BusinessCapability[];
  }[];
  /** Platform operator; independent of every organization membership. */
  platformAdmin?: boolean;
}

/** Active platform admin, or false — including before migration 0008. */
export async function isPlatformAdmin(
  db: CatalogDatabase,
  userId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .where(
        and(eq(platformAdmins.userId, userId), eq(platformAdmins.active, true)),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
export async function resolveBusinessAccess(
  db: CatalogDatabase,
  auth: BusinessAuth | undefined,
  headers: Headers,
): Promise<BusinessAccess | undefined> {
  if (!auth) return undefined;
  const session = await auth.api.getSession({ headers });
  if (!session) return undefined;
  const memberships = await db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.organizationId),
    )
    .where(
      and(
        eq(organizationMemberships.userId, session.user.id),
        eq(organizations.active, true),
        eq(organizationMemberships.active, true),
      ),
    );
  const platformAdmin = await isPlatformAdmin(db, session.user.id);
  return {
    ...(platformAdmin ? { platformAdmin } : {}),
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    memberships: memberships.flatMap((row) => {
      const role = businessRoleSchema.safeParse(row.role);
      return role.success
        ? [
            {
              organizationId: row.organizationId,
              role: role.data,
              capabilities: roleCapabilities(role.data),
            },
          ]
        : [];
    }),
  };
}
export function can(
  access: BusinessAccess | undefined,
  org: string,
  capability: BusinessCapability,
): boolean {
  return !!access?.memberships.some(
    (membership) =>
      membership.organizationId === org &&
      membership.capabilities.includes(capability),
  );
}
/** State-changing cookie-authenticated requests require an exact trusted origin. */
export function businessOriginAllowed(
  method: string,
  origin: string | undefined,
  configuredUrl: string | undefined,
): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  if (!origin || !configuredUrl) return false;
  try {
    return new URL(configuredUrl).origin === origin;
  } catch {
    return false;
  }
}
