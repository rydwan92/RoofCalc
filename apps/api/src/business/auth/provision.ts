import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { businessRoleSchema } from '@cieslacalc/business-core';
import type { CatalogDatabase } from '../../db/client';
import {
  authUsers,
  authAccounts,
  organizationMemberships,
} from '../../db/workspace-schema';
import { organizations } from '../../db/business-schema';
import { assertTeamChange } from './team-policy';

export const provisioningInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(240),
  organizationId: z.string().trim().min(1).max(128),
  role: businessRoleSchema,
});

/** Explicit operator action only. Existing credentials/roles are never reset. */
export async function provisionBusinessUser(
  db: CatalogDatabase,
  raw: unknown,
  actorUserId?: string,
) {
  const input = provisioningInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.id, input.organizationId),
          eq(organizations.active, true),
        ),
      )
      .for('update');
    if (!org) throw new Error('Active organization required.');
    if (actorUserId) {
      const [actor] = await tx
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, input.organizationId),
            eq(organizationMemberships.userId, actorUserId),
            eq(organizationMemberships.active, true),
          ),
        );
      assertTeamChange(
        actor ? businessRoleSchema.parse(actor.role) : undefined,
        undefined,
        { role: input.role, active: true },
        0,
      );
    }
    const [existing] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, input.email));
    const userId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      const now = new Date();
      await tx.insert(authUsers).values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(authAccounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId,
        providerId: 'credential',
        password: await hashPassword(input.password),
        createdAt: now,
        updatedAt: now,
      });
    }
    const [membership] = await tx
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      );
    if (membership) return { status: 'already-exists' as const, userId };
    await tx.insert(organizationMemberships).values({
      organizationId: input.organizationId,
      userId,
      role: input.role,
    });
    return {
      status: existing
        ? ('membership-added' as const)
        : ('user-created' as const),
      userId,
    };
  });
}
