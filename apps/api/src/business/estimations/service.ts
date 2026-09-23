import { z } from 'zod';
import {
  estimationInputSchema,
  type EstimationListQuery,
} from '@cieslacalc/business-core';
import {
  projectRecordV1Schema,
  duplicateProject,
} from '@cieslacalc/project-core';
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
    query?: EstimationListQuery,
  ) {
    return this.repository.listEstimations(
      org,
      customerId,
      limit,
      offset,
      query,
    );
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
  async duplicate(org: string, userId: string, id: string, body: unknown) {
    const { newName } = z
      .object({ newName: z.string().trim().min(1).max(240) })
      .strict()
      .parse(body);
    const source = await this.get(org, id);
    const project = duplicateProject(source.project, newName);
    // Project snapshot and estimation are one inserted SQL record: atomic;
    // no separate project row or quote is created/copied.
    return this.repository.createEstimation(
      org,
      userId,
      {
        customerId: source.estimation.customerId,
        roofProjectId: project.id,
        name: newName,
        location: source.estimation.location,
      },
      project,
    );
  }
  async archive(org: string, id: string) {
    await this.get(org, id);
    await this.repository.archiveEstimation(org, id);
    return { archived: true };
  }
}
