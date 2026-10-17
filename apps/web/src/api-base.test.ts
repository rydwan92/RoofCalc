// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { isCrossOriginApi, resolveApiBaseUrl } from './api-base';

it('connects local Apache builds to Node while keeping Vite and Node same-origin', () => {
  const apache = new URL('http://localhost/RoofCalc/apps/web/dist/');
  expect(resolveApiBaseUrl(apache, false, '')).toBe(
    'http://127.0.0.1:3001/api',
  );
  expect(resolveApiBaseUrl(new URL('http://127.0.0.1:5173/'), true, '')).toBe(
    '/api',
  );
  expect(resolveApiBaseUrl(new URL('http://127.0.0.1:3001/'), false, '')).toBe(
    '/api',
  );
  expect(
    resolveApiBaseUrl(new URL('https://example.com/apps/web/dist/'), false, ''),
  ).toBe('/api');
  // The static build follows PORT from the root .env, like the dev proxy.
  expect(resolveApiBaseUrl(apache, false, '', 3006)).toBe(
    'http://127.0.0.1:3006/api',
  );
  expect(resolveApiBaseUrl(apache, false, 'https://example.com/api/')).toBe(
    'https://example.com/api',
  );
});

it('recognises a static build whose API is on another origin', () => {
  expect(
    isCrossOriginApi('http://127.0.0.1:3001/api', 'http://localhost'),
  ).toBe(true);
  expect(isCrossOriginApi('/api', 'http://127.0.0.1:5173')).toBe(false);
  expect(
    isCrossOriginApi('http://127.0.0.1:5173/api', 'http://127.0.0.1:5173'),
  ).toBe(false);
});
