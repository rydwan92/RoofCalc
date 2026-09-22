import { z } from 'zod';
import { estimationInputSchema } from '@cieslacalc/business-core';
import { projectRecordV1Schema } from '@cieslacalc/project-core';
import {
  WorkspaceError,
  type WorkspaceRepository,
} from '../workspace/contracts';

export class EstimationService {
  constructor(private readonly repository: WorkspaceRepository) {}
  list(
    org: string,
    customerId: string | undefined,
    limit: number,
    offset: number,
  ) {
    return this.repository.listEstimations(org, customerId, limit, offset);
  }
  async get(org: string, id: string) {
    const detail = await this.repository.getEstimation(org, id);
    if (!detail) throw new WorkspaceError('estimation-not-found', 404);
    return detail;
  }
  async create(org: string, userId: string, body: unknown) {
    const { input, project } = z
      .object({ input: estimationInputSchema, project: projectRecordV1Schema })
      .strict()
      .parse(body);
    if (input.roofProjectId !== project.id)
      throw new WorkspaceError('project-mismatch');
    if (!(await this.repository.getCustomer(org, input.customerId)))
      throw new WorkspaceError('customer-not-found', 404);
    return this.repository.createEstimation(org, userId, input, project);
  }
  async save(org: string, id: string, body: unknown) {
    const { version, project } = z
      .object({
        version: z.number().int().positive(),
        project: projectRecordV1Schema,
      })
      .strict()
      .parse(body);
    const previous = await this.get(org, id);
    if (previous.estimation.roofProjectId !== project.id)
      throw new WorkspaceError('project-mismatch');
    return {
      version: await this.repository.saveProject(org, id, version, project),
    };
  }
}
