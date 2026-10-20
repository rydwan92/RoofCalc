import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * VNext-5 regression: `blocking ||= await step()` never runs the step once
 * an earlier step needed attention — the remote-database step of
 * `configure:cloudflare` was skipped silently that way. In the setup CLIs a
 * step always runs first and its result is combined afterwards.
 */
describe('setup CLIs never short-circuit a step', () => {
  it('has no "||= await" or "&&= await" in apps/api/src/cli', () => {
    const directory = join(__dirname);
    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .flatMap((file) =>
        readFileSync(join(directory, file), 'utf8')
          .split(/\r?\n/)
          .map((line, index) => ({ file, line: index + 1, text: line }))
          .filter(({ text }) => /(\|\||&&)=\s*!?\(?\s*await\b/.test(text)),
      );
    expect(offenders).toEqual([]);
  });
});
