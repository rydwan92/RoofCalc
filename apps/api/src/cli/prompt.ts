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

interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}
type KeyListener = (text: string | undefined, key?: Key) => void;

/** The terminal side of a hidden prompt (process.stdin in real use). */
export interface HiddenInput {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume: () => unknown;
  listeners: (event: 'keypress') => unknown[];
  removeAllListeners: (event: 'keypress') => unknown;
  on: (event: 'keypress', listener: KeyListener) => unknown;
  off: (event: 'keypress', listener: KeyListener) => unknown;
}

/**
 * A password prompt that never shows what is typed. While it reads, the
 * readline interface's own key handler — which echoes every character —
 * is detached and our listener collects the keys; both are restored after
 * Enter. (Overriding readline's private `_writeToOutput` stopped hiding
 * input on Node 22: a typed password was echoed. VNext-5 fix.) Without a
 * real terminal nothing is read at all, rather than echoing a password.
 */
export async function askHidden(
  rl: Interface | undefined,
  question: string,
  input: HiddenInput = process.stdin as unknown as HiddenInput,
  output: { write: (text: string) => unknown } = process.stdout,
): Promise<string> {
  if (!rl) return '';
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    output.write(`  ${question}: wymaga terminala — pominięto.\n`);
    return '';
  }
  output.write(`  ${question} (niewidoczne): `);
  const detached = input.listeners('keypress') as KeyListener[];
  input.removeAllListeners('keypress');
  const wasRaw = !!input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve) => {
    let value = '';
    const finish = (result: string) => {
      input.off('keypress', onKey);
      for (const listener of detached) input.on('keypress', listener);
      input.setRawMode!(wasRaw);
      output.write('\n');
      resolve(result.trim());
    };
    const onKey: KeyListener = (text, key) => {
      if (key?.name === 'return' || key?.name === 'enter') {
        finish(value);
        return;
      }
      // Ctrl+C / Ctrl+D cancel: nothing is used.
      if (key?.ctrl && (key.name === 'c' || key.name === 'd')) {
        finish('');
        return;
      }
      if (key?.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (text && !key?.ctrl && !key?.meta && text >= ' ') value += text;
    };
    input.on('keypress', onKey);
  });
}
