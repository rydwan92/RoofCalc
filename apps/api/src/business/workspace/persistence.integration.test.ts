import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createConnection } from 'mysql2/promise';
import { hashPassword } from 'better-auth/crypto';
import { createProjectRecord } from '@cieslacalc/project-core';
import { createQuoteDraft } from '@cieslacalc/quote-core';
import { roofProjectDocumentV1Schema } from '@cieslacalc/calculator-core';
import { readFile } from 'node:fs/promises';
import { createCatalogDatabase } from '../../db/client';
import { assertLocalSetupTarget } from '../../db/setup-target';
import {
  authUsers,
  authAccounts,
  organizationMemberships,
} from '../../db/workspace-schema';
import { organizations } from '../../db/business-schema';
import { DrizzleBusinessRepository } from '../../db/business-repository';
import { BusinessService } from '../service';
import { createBusinessAuth } from '../auth/auth';
import { resolveBusinessAccess } from '../auth/access';
import { DrizzleWorkspaceRepository } from './drizzle-repository';
import { createApp } from '../../app';
import { createWorker } from '../../edge/worker';

// Explicit, isolated local database only. Never run writes against shared DEV.
const url = process.env.ROOFCALC_BUSINESS_TEST_DATABASE_URL;
if (url) {
  assertLocalSetupTarget(url);
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('Business SQL tests require a database ending in _test.');
}
describe.runIf(!!url)(
  'V58 real SQL persistence and Better Auth transports',
  () => {
    const connection = url ? createCatalogDatabase(url)! : undefined;
    const org = `test-org:${crypto.randomUUID()}`,
      other = `test-other:${crypto.randomUUID()}`,
      userId = crypto.randomUUID();
    const email = `${userId}@example.test`,
      password = 'test-password-not-for-production';
    const config = {
      BETTER_AUTH_URL: 'http://localhost',
      BETTER_AUTH_SECRET: 'local-integration-test-secret-only-32-characters',
    };
    let cookie = '';
    const setup = () => {
      const db = connection!.db,
        auth = createBusinessAuth(db, config)!;
      const repository = new DrizzleBusinessRepository(db);
      return createApp(
        undefined,
        undefined,
        undefined,
        { runtime: 'node' },
        {
          service: new BusinessService(repository, repository),
          workspace: new DrizzleWorkspaceRepository(db),
        },
        {
          auth,
          baseURL: config.BETTER_AUTH_URL,
          resolve: (headers) => resolveBusinessAccess(db, auth, headers),
        },
      );
    };
    beforeAll(async () => {
      const now = new Date(),
        db = connection!.db;
      await db.insert(organizations).values([
        {
          id: org,
          slug: org,
          name: 'SQL test company',
          currencyCode: 'PLN',
          active: true,
        },
        {
          id: other,
          slug: other,
          name: 'Other tenant',
          currencyCode: 'PLN',
          active: true,
        },
      ]);
      await db
        .insert(authUsers)
        .values({
          id: userId,
          name: 'Sales Test',
          email,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        });
      await db
        .insert(authAccounts)
        .values({
          id: crypto.randomUUID(),
          userId,
          accountId: userId,
          providerId: 'credential',
          password: await hashPassword(password),
          createdAt: now,
          updatedAt: now,
        });
      await db
        .insert(organizationMemberships)
        .values({ userId, organizationId: org, role: 'sales' });
    });
    afterAll(async () => {
      await connection?.close();
    });

    it('logs in, persists customer → project/estimation → quote, rejects cross-tenant access and concurrent stale writes, restores through Worker', async () => {
      const app = setup(),
        prefix = `/api/business/organizations/${encodeURIComponent(org)}`;
      expect((await request(app).get(`${prefix}/customers`)).status).toBe(401);
      const login = await request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', config.BETTER_AUTH_URL)
        .send({ email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      cookie = (login.headers['set-cookie'] as unknown as string[])
        .map((value) => value.split(';')[0])
        .join('; ');
      const agent = () =>
        request
          .agent(app)
          .set('Cookie', cookie)
          .set('Origin', config.BETTER_AUTH_URL);
      const organizationResponse = await agent().get('/api/business/organizations');
      expect(organizationResponse.status, JSON.stringify(organizationResponse.body)).toBe(200);
      expect(organizationResponse.body.items.map((entry: { id: string }) => entry.id)).toEqual([org]);
      expect(
        (
          await agent().get(
            `/api/business/organizations/${encodeURIComponent(other)}/customers`,
          )
        ).status,
      ).toBe(403);
      expect(
        (await agent().post(`${prefix}/assortment/price`).send({})).status,
      ).toBe(403);
      const created = await agent()
        .post(`${prefix}/customers`)
        .send({
          type: 'person',
          name: 'Persisted customer',
          email: 'client@example.test',
          city: 'Kraków',
        });
      expect(created.status).toBe(201);
      const customer = created.body.item;
      expect(
        (await agent().get(`${prefix}/customers?q=client%40example.test`)).body
          .items[0].id,
      ).toBe(customer.id);
      const fixture = JSON.parse(
        await readFile(
          'fixtures/projects/01-basic-gable.cieslacalc.json',
          'utf8',
        ),
      ) as { document?: unknown; project?: unknown };
      const document = roofProjectDocumentV1Schema.parse(
        fixture.document ?? fixture,
      );
      const project = createProjectRecord(document, 'SQL roof');
      const create = () =>
        agent()
          .post(`${prefix}/estimations`)
          .send({
            input: {
              customerId: customer.id,
              roofProjectId: project.id,
              name: 'SQL estimation',
            },
            project,
          });
      const response = await create();
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const estimation = response.body.item.estimation;
      const quote = createQuoteDraft({
        id: 'browser-temporary-id',
        organizationSnapshot: { id: org, name: 'Company' },
        customerSnapshot: { name: customer.name },
        projectReference: { id: project.id, name: project.name },
        createdAt: new Date().toISOString(),
        currencyCode: 'PLN',
        sourceFingerprint: 'test-fingerprint',
        lines: [
          {
            id: 'line',
            group: 'covering',
            description: 'Tile',
            technicalQuantity: { value: 10, unit: 'piece' },
            offerQuantity: { value: 10, unit: 'piece' },
            quantityOverridden: false,
            unitNetAmountMinor: 482,
            priceSource: 'manual-estimation',
            vatRateBps: 2300,
            included: true,
          },
        ],
      });
      const quotePath = `${prefix}/estimations/${estimation.id}/quote`;
      const concurrent = await Promise.all([
        agent().post(quotePath).send({ snapshot: quote }),
        agent().post(quotePath).send({ snapshot: quote }),
      ]);
      expect(concurrent.map((result) => result.status).sort()).toEqual([
        201, 409,
      ]);
      const saved = concurrent.find((result) => result.status === 201)!.body
        .item;
      expect(saved.number).toMatch(/^OF\/\d{4}\/000001$/);
      const updated = await agent()
        .patch(quotePath)
        .send({
          version: saved.version,
          snapshot: { ...saved.snapshot, notes: 'Persisted terms' },
        });
      expect(updated.status).toBe(200);
      expect(
        (
          await agent()
            .patch(quotePath)
            .send({ version: saved.version, snapshot: saved.snapshot })
        ).status,
      ).toBe(409);
      expect(
        (
          await agent()
            .patch(quotePath)
            .send({
              version: updated.body.item.version,
              snapshot: {
                ...saved.snapshot,
                organizationSnapshot: { id: other, name: 'Other' },
              },
            })
        ).status,
      ).toBe(400);
      const nextProject = { ...project, name: 'Changed roof' };
      expect(
        (
          await agent()
            .patch(`${prefix}/estimations/${estimation.id}`)
            .send({ version: estimation.version, project: nextProject })
        ).status,
      ).toBe(200);
      expect(
        (
          await agent()
            .patch(`${prefix}/estimations/${estimation.id}`)
            .send({ version: estimation.version, project })
        ).status,
      ).toBe(409);
      const parsedUrl = new URL(url!);
      const binding = {
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port),
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        database: parsedUrl.pathname.slice(1),
      };
      const worker = createWorker(async () =>
        createConnection({ ...binding, disableEval: true }),
      );
      const env = {
        ...config,
        HYPERDRIVE: binding,
        ASSETS: { fetch: async () => new Response('SPA') },
      };
      const restored = await worker.fetch(
        new Request(`http://localhost${prefix}/estimations/${estimation.id}`, {
          headers: { Cookie: cookie },
        }),
        env,
      );
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({
        item: {
          customer: { id: customer.id },
          project: { name: 'Changed roof' },
          quote: {
            number: saved.number,
            snapshot: { notes: 'Persisted terms' },
          },
        },
      });
      const workerLogin = await worker.fetch(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            Origin: config.BETTER_AUTH_URL,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        }),
        env,
      );
      expect(workerLogin.status, await workerLogin.clone().text()).toBe(200);
      const signUp = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', config.BETTER_AUTH_URL)
        .send({ email: 'new@example.test', password, name: 'No registration' });
      expect(signUp.status).toBeGreaterThanOrEqual(400);
    }, 30000);
  },
);
