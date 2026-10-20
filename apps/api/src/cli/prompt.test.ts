import { EventEmitter } from 'node:events';
import type { Interface } from 'node:readline/promises';
import { describe, expect, it } from 'vitest';
import { askHidden, type HiddenInput } from './prompt';

/** A terminal stand-in: keypress events, raw mode, nothing else. */
function fakeTerminal(isTTY = true) {
  const emitter = new EventEmitter();
  const state = { raw: false, rawCalls: [] as boolean[] };
  const input = Object.assign(emitter, {
    isTTY,
    get isRaw() {
      return state.raw;
    },
    setRawMode: (mode: boolean) => {
      state.raw = mode;
      state.rawCalls.push(mode);
    },
    resume: () => undefined,
  }) as unknown as HiddenInput & EventEmitter;
  let written = '';
  const output = { write: (text: string) => (written += text) };
  return { input, output, state, written: () => written };
}

const rl = {} as Interface;
const type = (input: EventEmitter, text: string) => {
  for (const char of text) input.emit('keypress', char, { name: char });
};

describe('hidden prompt', () => {
  it('never shows or passes on what is typed, and restores readline afterwards', async () => {
    const terminal = fakeTerminal();
    // readline's own key handler echoes every character — it must not run.
    const echoed: string[] = [];
    const readlineHandler = (text: string | undefined) => {
      if (text) echoed.push(text);
    };
    terminal.input.on('keypress', readlineHandler);
    const answer = askHidden(
      rl,
      'Hasło użytkownika test',
      terminal.input,
      terminal.output,
    );
    type(terminal.input, 'a@b');
    terminal.input.emit('keypress', undefined, { name: 'backspace' });
    type(terminal.input, 'c!');
    terminal.input.emit('keypress', '\r', { name: 'return' });
    await expect(answer).resolves.toBe('a@c!');
    expect(echoed).toEqual([]);
    expect(terminal.written()).not.toMatch(/a@c|a@b/);
    expect(terminal.written()).toContain('Hasło użytkownika test');
    // readline gets its handler back and the terminal mode is restored.
    expect(terminal.input.listeners('keypress')).toEqual([readlineHandler]);
    expect(terminal.state.raw).toBe(false);
  });

  it('Ctrl+C cancels with an empty answer', async () => {
    const terminal = fakeTerminal();
    const answer = askHidden(rl, 'Hasło', terminal.input, terminal.output);
    type(terminal.input, 'secret');
    terminal.input.emit('keypress', '\u0003', { name: 'c', ctrl: true });
    await expect(answer).resolves.toBe('');
  });

  it('without a real terminal reads nothing rather than echoing', async () => {
    const terminal = fakeTerminal(false);
    await expect(
      askHidden(rl, 'Hasło', terminal.input, terminal.output),
    ).resolves.toBe('');
    expect(terminal.written()).toContain('wymaga terminala');
    expect(terminal.state.rawCalls).toEqual([]);
  });
});
