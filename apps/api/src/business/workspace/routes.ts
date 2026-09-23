import { z } from 'zod';
import {
  estimationListQuerySchema,
  teamCreateSchema,
  teamChangeSchema,
} from '@cieslacalc/business-core';
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
  if (resource === 'users') {
    if (segments.length === 6 && method === 'GET') {
      const query = z
        .object({
          q: z.string().max(240).default(''),
          offset: z.coerce.number().int().min(0).max(50000).default(0),
        })
        .parse(Object.fromEntries(search));
      return {
        status: 200,
        body: await repository.listTeam(org, query.q, query.offset),
      };
    }
    if (segments.length === 6 && method === 'POST')
      return {
        status: 201,
        body: {
          item: await repository.createTeamUser(
            org,
            userId,
            teamCreateSchema.parse(body),
          ),
        },
      };
    if (segments.length === 7 && id && method === 'PATCH') {
      await repository.changeTeamUser(
        org,
        userId,
        id,
        teamChangeSchema.parse(body),
      );
      return { status: 200, body: { item: { saved: true } } };
    }
    return { status: 404, body: { error: { code: 'not-found' } } };
  }
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
            estimationListQuerySchema.parse(Object.fromEntries(search)),
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
    id &&
    method === 'POST' &&
    (segments[7] === 'duplicate' || segments[7] === 'archive')
  )
    return {
      status: segments[7] === 'duplicate' ? 201 : 200,
      body: {
        item:
          segments[7] === 'duplicate'
            ? await estimations.duplicate(org, userId, id, body)
            : await estimations.archive(org, id),
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
