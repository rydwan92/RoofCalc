import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutosaveQueue } from './autosave';

describe('versioned commercial autosave', () => {
  afterEach(() => vi.useRealTimers());
  it('debounces a burst, and reverting an unsent edit reports saved without a write', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (value: string) => ({ value, version: 2 }));
    const queue = new AutosaveQueue('original', 1, save);
    queue.set('a');
    queue.set('ab');
    queue.set('abc');
    await vi.advanceTimersByTimeAsync(649);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    queue.set('changed');
    queue.set('abc');
    expect(queue.snapshot().status).toBe('saved');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    queue.dispose();
  });
  it('retains queued edits across session expiry and resumes with the same version', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('authentication-required'))
      .mockImplementation(async (value: string, version: number) => ({
        value,
        version: version + 1,
      }));
    const queue = new AutosaveQueue<string>('initial', 4, save);
    queue.set('edited');
    await expect(queue.flush()).rejects.toThrow('authentication-required');
    queue.set('edited while expired');
    await expect(queue.flush()).rejects.toThrow('authentication-required');
    expect(save).toHaveBeenCalledTimes(1);
    queue.resume();
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith('edited while expired', 4);
    expect(queue.snapshot()).toMatchObject({
      value: 'edited while expired',
      version: 5,
      status: 'saved',
    });
    queue.dispose();
  });
  it('stops follow-up writes after disposal during an in-flight save', async () => {
    let finish!: (value: { value: string; version: number }) => void;
    const save = vi.fn(
      () =>
        new Promise<{ value: string; version: number }>((resolve) => {
          finish = resolve;
        }),
    );
    const queue = new AutosaveQueue('initial', 1, save);
    queue.set('first');
    const pending = queue.flush();
    queue.set('second');
    queue.dispose();
    finish({ value: 'first', version: 2 });
    await pending;
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.snapshot().value).toBe('second');
  });
  it('saves the latest edits and reloads the same snapshot; a stale tab cannot overwrite it', async () => {
    let stored = { value: { notes: 'initial' }, version: 1 };
    const save = async (
      value: { notes: string },
      version: number | undefined,
    ) => {
      await Promise.resolve();
      if (version !== stored.version) throw new Error('quote-version-conflict');
      stored = { value, version: version + 1 };
      return stored;
    };
    const first = new AutosaveQueue(stored.value, stored.version, save);
    const stale = new AutosaveQueue(stored.value, stored.version, save);
    first.set({ notes: 'editing' });
    const pending = first.flush();
    first.set({ notes: 'latest terms' });
    await pending;
    expect(stored.value.notes).toBe('latest terms');
    const reopened = new AutosaveQueue(stored.value, stored.version, save);
    expect(reopened.snapshot()).toMatchObject({
      value: { notes: 'latest terms' },
      status: 'saved',
    });
    stale.set({ notes: 'stale tab' });
    await expect(stale.flush()).rejects.toThrow('quote-version-conflict');
    expect(stale.snapshot().status).toBe('conflict');
    expect(stored.value.notes).toBe('latest terms');
    first.dispose();
    stale.dispose();
    reopened.dispose();
  });
});
