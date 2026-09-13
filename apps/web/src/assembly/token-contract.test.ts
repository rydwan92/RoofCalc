import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sharedTokens = readFileSync(
  new URL('../../../../packages/ui/src/tokens.css', import.meta.url),
  'utf8',
);
const workbenchCss = readFileSync(
  new URL('./styles.css', import.meta.url),
  'utf8',
);

describe('semantic workbench token contract', () => {
  it.each([
    'background',
    'surface',
    'canvas',
    'panel',
    'line',
    'line-strong',
    'text',
    'text-muted',
    'accent',
    'selection',
    'related',
    'warning',
    'danger',
    'timber',
    'covering-full',
    'covering-cut',
    'opening',
  ])('defines shared --ui-%s', (token) => {
    expect(sharedTokens).toContain(`--ui-${token}:`);
    expect(workbenchCss).toContain(`--a-${token}: var(--ui-${token},`);
  });

  it('keeps critical SVG covering fills fallback-safe', () => {
    expect(workbenchCss).toMatch(
      /\.a-covering-plane\s*\{[^}]*fill:[^;]*#5b8f7c/s,
    );
    expect(workbenchCss).toMatch(
      /\.a-covering-fragment\s*\{[^}]*fill:[^;]*#5b8f7c/s,
    );
    expect(workbenchCss).toMatch(
      /\.a-covering-opening\s*\{[^}]*fill:[^;]*#b42318/s,
    );
  });
});
