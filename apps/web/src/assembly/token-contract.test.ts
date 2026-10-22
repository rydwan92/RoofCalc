import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('uses only --ui tokens that exist (VNext-6.2)', () => {
    // An undefined custom property drops the whole declaration: Business
    // cards and fields rendered without borders because `--ui-border` was
    // never a token.
    const defined = new Set(
      [...sharedTokens.matchAll(/(--ui-[a-z0-9-]+):/g)].map(
        (match) => match[1],
      ),
    );
    const root = fileURLToPath(new URL('../', import.meta.url));
    const files = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.(css|tsx?)$/.test(name) ? [path] : [];
      });
    const missing = files(root).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/var\((--ui-[a-z0-9-]+)/g)]
        .map((match) => match[1]!)
        .filter((token) => !defined.has(token))
        .map((token) => `${relative(root, path)}: ${token}`),
    );
    expect([...new Set(missing)]).toEqual([]);

    // Any custom property read without a fallback must be defined somewhere
    // (`--a-green-dark` / `--a-ink` were read for months and never set).
    const sources = files(root).map((path) => readFileSync(path, 'utf8'));
    const declared = new Set(
      [sharedTokens, ...sources].flatMap((text) =>
        [...text.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map((m) => m[1]),
      ),
    );
    const undeclared = sources.flatMap((text) =>
      [...text.matchAll(/var\((--[a-z][a-z0-9-]*)\)/g)]
        .map((match) => match[1]!)
        .filter((name) => !declared.has(name)),
    );
    expect([...new Set(undeclared)]).toEqual([]);
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
