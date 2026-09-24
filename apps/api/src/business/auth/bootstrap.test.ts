import { describe, expect, it } from 'vitest';
import type { CatalogDatabase } from '../../db/client';
import { organizations } from '../../db/business-schema';
import {
  authAccounts,
  authRateLimits,
  authUsers,
  organizationMemberships,
} from '../../db/workspace-schema';
import { authConfigured } from './auth';
import { bootstrapFirstOwner, readSetupStatus } from './bootstrap';

const token = 'private-test-bootstrap-token-of-adequate-length';
const input = {
  name: 'First Owner',
  email: 'owner@example.test',
  password: 'adequately-long-password',
  confirmPassword: 'adequately-long-password',
  token,
};

function database(organizationIds: string[], owner = false) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  let attempts = { count: 0, lastRequest: 0 };
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => (owner ? [{ userId: 'owner' }] : []),
          }),
        }),
        where: () => ({
          limit: async () =>
            table === organizations
              ? organizationIds.map((id) => ({ id })).slice(0, 2)
              : table === authUsers
                ? []
                : table === authRateLimits
                  ? [attempts]
                  : table === organizationMemberships && owner
                    ? [{ userId: 'owner' }]
                    : [],
          for: async () => [attempts],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        if (table === organizations) organizationIds.push(String(values.id));
        if (table === organizationMemberships) owner = true;
        return { onDuplicateKeyUpdate: async () => undefined };
      },
    }),
    update: () => ({
      set: (value: Partial<typeof attempts>) => ({
        where: async () => {
          attempts = { ...attempts, ...value };
        },
      }),
    }),
  };
  const db = {
    ...tx,
    transaction: (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as CatalogDatabase;
  return {
    db,
    inserted,
    setOwner: (value: boolean) => {
      owner = value;
    },
  };
}

describe('first owner bootstrap', () => {
  it('requires a valid exact auth origin', () => {
    expect(
      authConfigured({
        BETTER_AUTH_SECRET: token,
        BETTER_AUTH_URL: 'https://roofcalc.test',
      }),
    ).toBe(true);
    expect(
      authConfigured({
        BETTER_AUTH_SECRET: token,
        BETTER_AUTH_URL: 'https://roofcalc.test/api',
      }),
    ).toBe(false);
    expect(
      authConfigured({
        BETTER_AUTH_SECRET: token,
        BETTER_AUTH_URL: 'http://roofcalc.test',
      }),
    ).toBe(false);
  });

  it('exposes coarse available, closed and ambiguous states', async () => {
    expect(
      (await readSetupStatus(database([]).db, true, token)).bootstrap,
    ).toBe('available');
    expect(
      (await readSetupStatus(database(['demo']).db, true, token)).organization,
    ).toBe('existing');
    expect(
      (await readSetupStatus(database(['a', 'b']).db, true, token)).bootstrap,
    ).toBe('unavailable');
    expect(
      (await readSetupStatus(database(['demo'], true).db, true, token))
        .firstOwner,
    ).toBe('configured');
    expect((await readSetupStatus(database([]).db, false, token)).auth).toBe(
      'unconfigured',
    );
    const incomplete = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => {
                throw new Error('missing auth table');
              },
            }),
          }),
          where: () => ({
            limit: async () => {
              throw new Error('missing auth table');
            },
          }),
        }),
      }),
      execute: async () => [],
    } as unknown as CatalogDatabase;
    expect(await readSetupStatus(incomplete, true, token)).toMatchObject({
      database: 'connected',
      firstOwner: 'unknown',
      bootstrap: 'unavailable',
    });
  });

  it('attaches to the single active organization, stores a hashed credential, and closes', async () => {
    const fixture = database(['org:demo-hurtownia']);
    expect((await bootstrapFirstOwner(fixture.db, token, input)).status).toBe(
      201,
    );
    expect(fixture.inserted.some((item) => item.table === organizations)).toBe(
      false,
    );
    expect(
      fixture.inserted.find((item) => item.table === organizationMemberships)
        ?.values,
    ).toMatchObject({ organizationId: 'org:demo-hurtownia', role: 'owner' });
    const account = fixture.inserted.find(
      (item) => item.table === authAccounts,
    )?.values;
    expect(account?.password).not.toBe(input.password);
    expect((await bootstrapFirstOwner(fixture.db, token, input)).body).toEqual({
      error: { code: 'bootstrap-closed' },
    });
    fixture.setOwner(false);
    expect((await readSetupStatus(fixture.db, true, token)).bootstrap).toBe(
      'unavailable',
    );
    expect((await bootstrapFirstOwner(fixture.db, token, input)).body).toEqual({
      error: { code: 'bootstrap-closed' },
    });
  });

  it('creates an initial organization only with a company name', async () => {
    const fixture = database([]);
    expect((await bootstrapFirstOwner(fixture.db, token, input)).status).toBe(
      400,
    );
    expect(
      (
        await bootstrapFirstOwner(fixture.db, token, {
          ...input,
          companyName: 'New company',
        })
      ).status,
    ).toBe(201);
    expect(
      fixture.inserted.find((item) => item.table === organizations)?.values
        .name,
    ).toBe('New company');
  });

  it('rejects an invalid token and never guesses between organizations', async () => {
    const fixture = database(['one', 'two']);
    expect(
      (
        await bootstrapFirstOwner(fixture.db, token, {
          ...input,
          token: 'wrong',
        })
      ).body,
    ).toEqual({ error: { code: 'bootstrap-invalid-token' } });
    expect((await bootstrapFirstOwner(fixture.db, token, input)).body).toEqual({
      error: { code: 'bootstrap-organization-ambiguous' },
    });
    expect(fixture.inserted.some((item) => item.table === authUsers)).toBe(
      false,
    );
    expect(fixture.inserted.some((item) => item.table === authRateLimits)).toBe(
      true,
    );
  });
  it('rate limits repeated setup attempts before checking the token', async () => {
    const fixture = database(['demo']);
    for (let attempt = 0; attempt < 10; attempt++)
      expect(
        (
          await bootstrapFirstOwner(fixture.db, token, {
            ...input,
            token: 'wrong',
          })
        ).status,
      ).toBe(403);
    expect((await bootstrapFirstOwner(fixture.db, token, input)).body).toEqual({
      error: { code: 'bootstrap-rate-limited' },
    });
    expect(fixture.inserted.some((item) => item.table === authUsers)).toBe(
      false,
    );
  });
});
