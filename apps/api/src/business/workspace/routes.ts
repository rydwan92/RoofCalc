import { z } from 'zod';
import type { WorkspaceRepository } from './contracts';
import { CustomerService } from '../customers/service';
import { EstimationService } from '../estimations/service';
import { QuoteService } from '../quotes/service';
import type { ApiResult } from '../../http/handler';

export async function workspaceRoute(
  repository: WorkspaceRepository,
  userId: string,
  org: string,
  segments: string[],
  method: string,
  search: URLSearchParams,
  body: unknown,
): Promise<ApiResult | undefined> {
  const resource = segments[5],
    id = segments[6];
  if (resource !== 'customers' && resource !== 'estimations') return undefined;
  const customers = new CustomerService(repository),
    estimations = new EstimationService(repository),
    quotes = new QuoteService(repository);
  const page = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).max(50000).default(0),
    })
    .parse(Object.fromEntries(search));
  if (segments.length === 6 && (method === 'GET' || method === 'HEAD')) {
    const items =
      resource === 'customers'
        ? await customers.list(
            org,
            z
              .string()
              .max(240)
              .parse(search.get('q') ?? ''),
            page.limit,
            page.offset,
          )
        : await estimations.list(
            org,
            search.get('customerId') ?? undefined,
            page.limit,
            page.offset,
          );
    return {
      status: 200,
      body: {
        items,
        ...(items.length === page.limit
          ? { nextOffset: page.offset + page.limit }
          : {}),
      },
    };
  }
  if (segments.length === 6 && method === 'POST')
    return {
      status: 201,
      body: {
        item:
          resource === 'customers'
            ? await customers.create(org, body)
            : await estimations.create(org, userId, body),
      },
    };
  if (segments.length === 7 && id && (method === 'GET' || method === 'HEAD'))
    return {
      status: 200,
      body: {
        item:
          resource === 'customers'
            ? await customers.get(org, id)
            : await estimations.get(org, id),
      },
    };
  if (segments.length === 7 && id && method === 'PATCH')
    return {
      status: 200,
      body: {
        item:
          resource === 'customers'
            ? await customers.update(org, id, body)
            : await estimations.save(org, id, body),
      },
    };
  if (
    resource === 'estimations' &&
    segments.length === 8 &&
    segments[7] === 'quote' &&
    id &&
    (method === 'POST' || method === 'PATCH')
  )
    return {
      status: method === 'POST' ? 201 : 200,
      body: { item: await quotes.save(org, id, body, method === 'POST') },
    };
  return { status: 404, body: { error: { code: 'not-found' } } };
}
