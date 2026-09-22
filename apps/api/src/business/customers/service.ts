import { customerInputSchema } from '@cieslacalc/business-core';
import {
  WorkspaceError,
  type WorkspaceRepository,
} from '../workspace/contracts';

export class CustomerService {
  constructor(private readonly repository: WorkspaceRepository) {}
  list(org: string, search: string, limit: number, offset: number) {
    return this.repository.listCustomers(org, search, limit, offset);
  }
  async get(org: string, id: string) {
    const customer = await this.repository.getCustomer(org, id);
    if (!customer) throw new WorkspaceError('customer-not-found', 404);
    return customer;
  }
  create(org: string, body: unknown) {
    return this.repository.createCustomer(org, customerInputSchema.parse(body));
  }
  async update(org: string, id: string, body: unknown) {
    const input = customerInputSchema.partial().strict().parse(body);
    const previous = await this.get(org, id);
    const data = customerInputSchema.strip().parse(previous);
    const result = await this.repository.updateCustomer(
      org,
      id,
      customerInputSchema.parse({ ...data, ...input }),
    );
    if (!result) throw new WorkspaceError('customer-not-found', 404);
    return result;
  }
}
