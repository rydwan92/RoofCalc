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
  it('does not return the SPA for unknown API endpoints', async () => {
    const response = await request(createApp()).get('/api/projects');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not-found' } });
  });
});
