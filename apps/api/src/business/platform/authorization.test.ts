import { describe, expect, it, vi } from 'vitest';
import { roleCapabilities } from '@cieslacalc/business-core';
import { handleApiRequest, type BusinessApi } from '../../http/handler';
import type { BusinessAccess } from '../auth/access';
import type { BusinessService } from '../service';
import type { PlatformService } from './service';

const owner: BusinessAccess = {
  user: { id: 'u-owner', name: 'Owner', email: 'owner@example.test' },
  memberships: [
    {
      organizationId: 'org:a',
      role: 'owner',
      capabilities: roleCapabilities('owner'),
    },
  ],
};

function call(
  access: BusinessAccess | undefined,
  method: string,
  path: string,
  body?: unknown,
) {
  const platform = {
    counts: vi.fn(async () => ({})),
    serverVersion: vi.fn(async () => '10.11.6-MariaDB'),
    organizations: vi.fn(async () => []),
    createOrganization: vi.fn(async () => ({ id: 'org:new' })),
    setOrganizationActive: vi.fn(async () => ({})),
    users: vi.fn(async () => []),
    createUser: vi.fn(async () => ({})),
    setMembership: vi.fn(async () => ({})),
    catalogue: vi.fn(async () => ({})),
  };
  const business: BusinessApi = {
    service: {
      listOrganizations: vi.fn(async () => []),
    } as unknown as BusinessService,
    platform: platform as unknown as PlatformService,
    ...(access ? { access } : {}),
  };
  const [pathname, query] = path.split('?');
  return {
    platform,
    result: handleApiRequest(
      method,
      pathname!,
      new URLSearchParams(query),
      undefined,
      undefined,
      { runtime: 'node', auth: 'configured' },
      business,
      body,
    ),
  };
}

const ROUTES: Array<[string, string]> = [
  ['GET', '/api/platform/overview'],
  ['GET', '/api/platform/database/status'],
  ['GET', '/api/platform/organizations'],
  ['POST', '/api/platform/organizations'],
  ['PATCH', '/api/platform/organizations/org:a'],
  ['GET', '/api/platform/users'],
  ['POST', '/api/platform/users'],
  ['POST', '/api/platform/memberships'],
  ['GET', '/api/platform/catalogue/status'],
];

describe('platform authorization', () => {
  it.each(ROUTES)('%s %s requires a session', async (method, path) => {
    const { result, platform } = call(undefined, method, path);
    expect((await result).status).toBe(401);
    expect(Object.values(platform).some((fn) => fn.mock.calls.length)).toBe(
      false,
    );
  });

  it.each(ROUTES)(
    '%s %s is forbidden to an organization owner who is not a platform admin',
    async (method, path) => {
      const { result, platform } = call(owner, method, path, {});
      expect(await result).toEqual({
        status: 403,
        body: { error: { code: 'platform-forbidden' } },
      });
      expect(Object.values(platform).some((fn) => fn.mock.calls.length)).toBe(
        false,
      );
    },
  );

  it('an active platform admin reaches the console without any membership', async () => {
    const admin = { ...owner, memberships: [], platformAdmin: true };
    const { result, platform } = call(
      admin,
      'GET',
      '/api/platform/organizations?q=demo',
    );
    expect((await result).status).toBe(200);
    expect(platform.organizations).toHaveBeenCalledWith('demo');
    const created = call(admin, 'POST', '/api/platform/organizations', {
      name: 'Nowa',
    });
    expect((await created.result).status).toBe(201);
  });

  it('platform admin grants no organization data access (tenant isolation)', async () => {
    const admin = { ...owner, memberships: [], platformAdmin: true };
    const { result } = call(
      admin,
      'GET',
      '/api/business/organizations/org:a/assortment',
    );
    expect((await result).status).toBe(403);
  });
});
