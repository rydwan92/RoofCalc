import { z } from 'zod';
import { quoteDraftSchema } from '@cieslacalc/quote-core';
import {
  WorkspaceError,
  type WorkspaceRepository,
} from '../workspace/contracts';

export class QuoteService {
  constructor(private readonly repository: WorkspaceRepository) {}
  async save(
    org: string,
    estimationId: string,
    body: unknown,
    create: boolean,
  ) {
    const input = z
      .object({
        snapshot: quoteDraftSchema,
        version: z.number().int().positive().optional(),
      })
      .strict()
      .parse(body);
    const detail = await this.repository.getEstimation(org, estimationId);
    if (!detail) throw new WorkspaceError('estimation-not-found', 404);
    if (
      input.snapshot.organizationSnapshot.id !== org ||
      input.snapshot.projectReference.id !== detail.estimation.roofProjectId
    )
      throw new WorkspaceError('quote-scope-mismatch');
    if (create)
      return this.repository.createQuote(org, estimationId, input.snapshot);
    if (!input.version) throw new WorkspaceError('quote-version-required');
    return this.repository.saveQuote(
      org,
      estimationId,
      input.version,
      input.snapshot,
    );
  }
}
