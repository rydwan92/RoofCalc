import type { BusinessRole } from '@cieslacalc/business-core';
import { WorkspaceError } from '../workspace/contracts';

export function assertTeamChange(
  actor: BusinessRole | undefined,
  target: { role: BusinessRole; active: boolean } | undefined,
  next: { role: BusinessRole; active: boolean },
  activeOwners: number,
) {
  if (!actor || actor === 'sales')
    throw new WorkspaceError('business-forbidden', 403);
  if (actor !== 'owner' && (target?.role === 'owner' || next.role === 'owner'))
    throw new WorkspaceError('owner-management-required', 403);
  if (
    target?.role === 'owner' &&
    target.active &&
    (next.role !== 'owner' || !next.active) &&
    activeOwners <= 1
  )
    throw new WorkspaceError('last-owner-required', 409);
}
