import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * VNext-6.2 UX contract: screen text is never smaller than the type scale's
 * smallest step, `--ui-text-xs` (11px). The self-audit found 181 rules at
 * 8–10px (badges, field hints, eyebrows, the phone dock) — unreadable on a
 * phone in daylight. SVG drawing labels scale with the drawing and print
 * sheets have their own scale, so both are exempt.
 */
const webSource = fileURLToPath(new URL('..', import.meta.url));
const PRINT_SHEETS = new Set(['assembly/execution-export.css']);
const SVG_TEXT = /(^|[\s>+~,(])(text|tspan|svg)\b/;
const MINIMUM_PX = 11;

function cssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

describe('readable screen text', () => {
  it(`no screen rule sets a font below ${MINIMUM_PX}px`, () => {
    const offenders = cssFiles(webSource).flatMap((path) => {
      const file = relative(webSource, path).replace(/\\/g, '/');
      if (PRINT_SHEETS.has(file)) return [];
      const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(
        ([, selector, body]) => {
          const size = /font-size:\s*([\d.]+)px/.exec(body!);
          if (!size || Number(size[1]) >= MINIMUM_PX) return [];
          if (SVG_TEXT.test(selector!)) return [];
          return [`${file}: ${selector!.trim()} → ${size[1]}px`];
        },
      );
    });
    expect(offenders).toEqual([]);
  });
});
