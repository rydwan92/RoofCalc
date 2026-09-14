import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('API', () => {
  it('reports health without a database', async () => {
    const response = await request(createApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'cieslacalc-api',
      version: '0.1.0',
    });
  });
  it('reports catalogue routes unavailable without a database, and never 500s', async () => {
    // ADR-006: the calculator works offline. Without DATABASE_URL the server
    // must still start and answer catalogue requests with a structured code,
    // so the web client can fall back to the manual product path.
    const app = createApp();
    for (const path of [
      '/api/catalog/manufacturers',
      '/api/catalog/products?q=tile',
      '/api/catalog/products/product:demo-roof:tile-30',
      '/api/catalog/products/product:demo-roof:tile-30/revisions/revision:demo-roof:tile-30:2026-01',
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { code: 'catalog-unavailable' } });
    }
  });
  it('does not return the SPA for unknown API endpoints', async () => {
    const response = await request(createApp()).get('/api/projects');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not-found' } });
  });
});
