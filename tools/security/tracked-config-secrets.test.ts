import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('tracked production configuration secrets', () => {
  it('keeps credential-bearing database URLs out of wrangler.jsonc', () => {
    const wranglerConfig = readFileSync('wrangler.jsonc', 'utf8');

    expect(wranglerConfig).not.toMatch(
      /mysql(?:2)?:\/\/[^\s:/"']+:[^\s@/"']+@/i,
    );
    expect(wranglerConfig).not.toMatch(/"localConnectionString"\s*:/i);
  });
});
