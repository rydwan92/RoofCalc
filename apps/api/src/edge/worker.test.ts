import { describe, expect, it, vi } from 'vitest';
import { createWorker, type HyperdriveBinding, type WorkerEnv } from './worker';

const binding: HyperdriveBinding = {
  host: 'hyperdrive.local',
  user: 'u',
  password: 'origin-secret',
  database: 'roofcalc',
  port: 3306,
};

function env(withBinding = true) {
  const assets = vi.fn(async () => new Response('<!doctype html>spa'));
  const value: WorkerEnv = {
    ASSETS: { fetch: assets },
    ...(withBinding ? { HYPERDRIVE: binding } : {}),
  };
  return { value, assets };
}

const request = (path: string, method = 'GET') =>
  new Request(`https://roofcalc.example.workers.dev${path}`, { method });

describe('Cloudflare Worker routing', () => {
  it('serves SPA and static paths from ASSETS without touching the database', async () => {
    const connect = vi.fn();
    const worker = createWorker(connect);
    const { value, assets } = env();
    for (const path of ['/', '/projects/abc', '/assets/index.js', '/apiary']) {
      const response = await worker.fetch(request(path), value);
      expect(await response.text()).toContain('spa');
    }
    expect(assets).toHaveBeenCalledTimes(4);
    expect(connect).not.toHaveBeenCalled();
  });

  it('reports health as degraded/not-configured without a HYPERDRIVE binding', async () => {
    const response = await createWorker(vi.fn()).fetch(
      request('/api/health'),
      env(false).value,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'degraded',
      service: 'cieslacalc-api',
      version: '0.1.0',
      runtime: 'cloudflare-worker',
      database: 'not-configured',
    });
  });

  it('probes the database for health and closes the connection', async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ 1: 1 }], []]),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const connect = vi.fn().mockResolvedValue(connection);
    const response = await createWorker(connect).fetch(
      request('/api/health'),
      env().value,
    );
    expect(await response.json()).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
    expect(connect).toHaveBeenCalledWith(binding);
    expect(connection.end).toHaveBeenCalled();
  });

  it('reports an unreachable origin as unavailable without leaking details', async () => {
    const connect = vi
      .fn()
      .mockRejectedValue(new Error('connect to origin-secret@db failed'));
    const health = await createWorker(connect).fetch(
      request('/api/health'),
      env().value,
    );
    const healthText = await health.text();
    expect(healthText).toContain('"database":"unavailable"');
    expect(healthText).not.toContain('origin-secret');

    const catalog = await createWorker(connect).fetch(
      request('/api/catalog/manufacturers'),
      env().value,
    );
    expect(catalog.status).toBe(503);
    const catalogText = await catalog.text();
    expect(JSON.parse(catalogText)).toEqual({
      error: { code: 'database-unavailable' },
    });
    expect(catalogText).not.toContain('origin-secret');
  });

  it('returns 503 for catalogue and pricing without a binding', async () => {
    const worker = createWorker(vi.fn());
    for (const path of [
      '/api/catalog/manufacturers',
      '/api/pricing/variants?ids=a',
    ]) {
      const response = await worker.fetch(request(path), env(false).value);
      expect(response.status).toBe(503);
    }
  });

  it('does not open a database connection for unknown API paths or writes', async () => {
    const connect = vi.fn();
    const worker = createWorker(connect);
    expect(
      (await worker.fetch(request('/api/projects'), env().value)).status,
    ).toBe(404);
    expect(
      (
        await worker.fetch(
          request('/api/catalog/manufacturers', 'POST'),
          env().value,
        )
      ).status,
    ).toBe(404);
    expect(connect).not.toHaveBeenCalled();
  });

  it('answers HEAD without a body', async () => {
    const response = await createWorker(vi.fn()).fetch(
      request('/api/health', 'HEAD'),
      env(false).value,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
