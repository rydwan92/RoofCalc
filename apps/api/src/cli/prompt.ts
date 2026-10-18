import type { Interface } from 'node:readline/promises';

/**
 * Terminal prompts shared by the configuration CLIs. Without a terminal
 * (`rl` undefined) every question takes its safe default: no change.
 */

export async function ask(
  rl: Interface | undefined,
  question: string,
  fallback = '',
): Promise<string> {
  if (!rl) return fallback;
  const answer = (
    await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ''}: `)
  ).trim();
  return answer || fallback;
}

/** Yes/no; `defaultYes` decides what a bare Enter means. */
export async function confirm(
  rl: Interface | undefined,
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  if (!rl) return false;
  const answer = (
    await rl.question(`  ${question} ${defaultYes ? '[T/n]' : '[t/N]'}: `)
  )
    .trim()
    .toLowerCase();
  if (!answer) return defaultYes;
  return answer === 't' || answer === 'y' || answer === 'tak';
}

/** A password prompt that does not echo what is typed. */
export async function askHidden(
  rl: Interface | undefined,
  question: string,
): Promise<string> {
  if (!rl) return '';
  const writable = rl as unknown as { _writeToOutput?: (text: string) => void };
  const original = writable._writeToOutput;
  process.stdout.write(`  ${question}: `);
  writable._writeToOutput = () => undefined;
  try {
    return (await rl.question('')).trim();
  } finally {
    writable._writeToOutput = original;
    process.stdout.write('\n');
  }
}
