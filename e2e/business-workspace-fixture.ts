import type { Page } from '@playwright/test';

/** Deterministic HTTP workspace for legacy catalogue UI scenarios. Real SQL is
 * exercised separately by v58-persistence.spec.ts and the API integration suite. */
export async function mockBusinessWorkspace(
  page: Page,
  organizationId: string,
) {
  const customers: Record<string, unknown>[] = [];
  const users = [
    {
      id: 'user:fixture',
      name: 'Owner fixture',
      email: 'fixture@example.test',
      role: 'owner',
      active: true,
    },
  ];
  const estimations: {
    estimation: Record<string, unknown>;
    project: Record<string, unknown>;
    customer: Record<string, unknown>;
    quote?: Record<string, unknown>;
  }[] = [];
  await page.route('**/api/business/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith('/session')) {
      await route.fulfill({
        json: {
          user: {
            id: 'user:fixture',
            name: 'Sales fixture',
            email: 'fixture@example.test',
          },
          memberships: [
            {
              organizationId,
              role: 'owner',
              capabilities: [
                'business.read',
                'quote.write',
                'customers.write',
                'assortment.manage',
                'prices.manage',
                'organization.manage',
                'users.manage',
              ],
            },
          ],
        },
      });
      return;
    }
    const path = url.pathname.split('/').map(decodeURIComponent),
      resource = path[5],
      id = path[6];
    if (resource === 'users') {
      if (request.method() === 'POST') {
        users.push({
          ...request.postDataJSON(),
          id: `user:${users.length}`,
          active: true,
        });
        await route.fulfill({
          status: 201,
          json: {
            item: {
              status: 'user-created',
              temporaryPassword: 'Fixture-only-not-a-real-password',
            },
          },
        });
      } else if (request.method() === 'PATCH') {
        Object.assign(
          users.find((user) => user.id === id)!,
          request.postDataJSON(),
        );
        await route.fulfill({ json: { item: { saved: true } } });
      } else
        await route.fulfill({
          json: {
            items: users,
            activeUsers: users.filter((user) => user.active).length,
          },
        });
      return;
    }
    if (!['customers', 'estimations'].includes(resource ?? '')) {
      await route.fallback();
      return;
    }
    const body = request.postDataJSON() as {
      input?: Record<string, unknown>;
      project?: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
      version?: number;
    } | null;
    const now = new Date().toISOString();
    if (resource === 'customers') {
      if (request.method() === 'POST') {
        const customer = {
          ...body,
          id: `customer:${customers.length + 1}`,
          organizationId,
          createdAt: now,
          updatedAt: now,
        };
        customers.push(customer);
        await route.fulfill({ status: 201, json: { item: customer } });
      } else await route.fulfill({ json: { items: customers } });
      return;
    }
    if (!id && request.method() === 'POST') {
      const entry = {
        estimation: {
          ...body!.input,
          id: `estimation:${estimations.length + 1}`,
          organizationId,
          status: 'draft',
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        project: body!.project!,
        customer: customers.find((c) => c.id === body!.input!.customerId)!,
      };
      estimations.push(entry);
      await route.fulfill({ status: 201, json: { item: entry } });
      return;
    }
    if (!id) {
      await route.fulfill({
        json: {
          items: estimations.map((entry) => ({
            ...entry.estimation,
            customerName: entry.customer.name,
            quoteNumber: entry.quote?.number,
          })),
        },
      });
      return;
    }
    const entry = estimations.find((entry) => entry.estimation.id === id);
    if (!entry) {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'estimation-not-found' } },
      });
      return;
    }
    if (path[7] === 'quote') {
      entry.estimation.status = 'quoted';
      entry.quote = {
        id: 'quote:fixture',
        commercialEstimationId: id,
        number: 'OF/2026/000001',
        version: (body?.version ?? 0) + 1,
        updatedAt: now,
        snapshot: {
          ...body!.snapshot,
          id: 'quote:fixture',
          number: 'OF/2026/000001',
        },
      };
      await route.fulfill({ json: { item: entry.quote } });
      return;
    }
    if (path[7] === 'duplicate') {
      const clone = structuredClone(entry);
      clone.estimation.id = `estimation:${estimations.length + 1}`;
      clone.estimation.name = (body as unknown as { newName: string }).newName;
      clone.estimation.status = 'draft';
      clone.estimation.version = 1;
      clone.project.id = crypto.randomUUID();
      clone.project.name = clone.estimation.name;
      clone.estimation.roofProjectId = clone.project.id;
      delete clone.quote;
      estimations.push(clone);
      await route.fulfill({ status: 201, json: { item: clone } });
      return;
    }
    if (path[7] === 'archive') {
      entry.estimation.status = 'archived';
      await route.fulfill({ json: { item: { archived: true } } });
      return;
    }
    if (request.method() === 'PATCH') {
      entry.project = body!.project!;
      entry.estimation.version = body!.version! + 1;
      await route.fulfill({
        json: { item: { version: entry.estimation.version } },
      });
      return;
    }
    await route.fulfill({ json: { item: entry } });
  });
}
