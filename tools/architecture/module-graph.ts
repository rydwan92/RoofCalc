import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, resolved from this file so tests do not depend on the shell cwd. */
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'test-results',
  'playwright-report',
]);

export interface SourceFile {
  /** Repository-relative POSIX path, e.g. `packages/roof-math/src/hip-roof.ts`. */
  path: string;
  text: string;
  isTest: boolean;
}

function walk(absoluteDirectory: string, found: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(absoluteDirectory);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const absolute = join(absoluteDirectory, entry);
    if (statSync(absolute).isDirectory()) walk(absolute, found);
    else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)))
      found.push(absolute);
  }
  return found;
}

/** Reads every TypeScript source file under one repository-relative directory. */
export function sourceFiles(relativeDirectory: string): SourceFile[] {
  return walk(join(repositoryRoot, relativeDirectory), [])
    .map((absolute) => {
      const path = relative(repositoryRoot, absolute).split(sep).join('/');
      return {
        path,
        text: readFileSync(absolute, 'utf8'),
        isTest: /\.test\.tsx?$/.test(path),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Production source only. Tests may reach for helpers the runtime must not. */
export function productionSources(relativeDirectory: string): SourceFile[] {
  return sourceFiles(relativeDirectory).filter((file) => !file.isTest);
}

const IMPORT_PATTERNS = [
  /(?:^|[\s;}])import\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
  /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
  /(?:^|[\s;}])export\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Every module specifier a file imports, including dynamic imports and re-exports. */
export function importSpecifiers(file: SourceFile): string[] {
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.text)) !== null) found.add(match[1]!);
  }
  return [...found].sort();
}

export interface ForbiddenImport {
  file: string;
  specifier: string;
}

/** Lists every production import in a directory matching a forbidden pattern. */
export function forbiddenImports(
  relativeDirectory: string,
  forbidden: readonly RegExp[],
): ForbiddenImport[] {
  return productionSources(relativeDirectory).flatMap((file) =>
    importSpecifiers(file)
      .filter((specifier) =>
        forbidden.some((pattern) => {
          pattern.lastIndex = 0;
          return pattern.test(specifier);
        }),
      )
      .map((specifier) => ({ file: file.path, specifier })),
  );
}

export interface TextMatch {
  file: string;
  line: number;
  text: string;
}

/** Lists every production line in a directory matching a forbidden pattern. */
export function forbiddenText(
  relativeDirectory: string,
  pattern: RegExp,
  options: { allow?: readonly string[] } = {},
): TextMatch[] {
  const allow = new Set(options.allow ?? []);
  return productionSources(relativeDirectory)
    .filter((file) => !allow.has(file.path))
    .flatMap((file) =>
      file.text.split(/\r?\n/).flatMap((line, index) => {
        const local = new RegExp(
          pattern.source,
          pattern.flags.replace('g', ''),
        );
        return local.test(line)
          ? [{ file: file.path, line: index + 1, text: line.trim() }]
          : [];
      }),
    );
}

/** Names of the workspace packages, read from the packages directory. */
export function workspacePackageDirectories(): string[] {
  return readdirSync(join(repositoryRoot, 'packages'))
    .filter((entry) =>
      statSync(join(repositoryRoot, 'packages', entry)).isDirectory(),
    )
    .sort();
}
