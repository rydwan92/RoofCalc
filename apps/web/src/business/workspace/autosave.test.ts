import { describe, expect, it } from 'vitest';
import { AutosaveQueue } from './autosave';

describe('versioned commercial autosave', () => {
  it('saves the latest edits and reloads the same snapshot; a stale tab cannot overwrite it', async () => {
    let stored = { value: { notes: 'initial' }, version: 1 };
    const save = async (value: { notes: string }, version: number | undefined) => {
      await Promise.resolve();
      if (version !== stored.version) throw new Error('quote-version-conflict');
      stored = { value, version: version + 1 }; return stored;
    };
    const first = new AutosaveQueue(stored.value, stored.version, save);
    const stale = new AutosaveQueue(stored.value, stored.version, save);
    first.set({ notes: 'editing' }); const pending = first.flush(); first.set({ notes: 'latest terms' }); await pending;
    expect(stored.value.notes).toBe('latest terms');
    const reopened = new AutosaveQueue(stored.value, stored.version, save);
    expect(reopened.snapshot()).toMatchObject({ value: { notes: 'latest terms' }, status: 'saved' });
    stale.set({ notes: 'stale tab' }); await expect(stale.flush()).rejects.toThrow('quote-version-conflict');
    expect(stale.snapshot().status).toBe('conflict'); expect(stored.value.notes).toBe('latest terms');
    first.dispose(); stale.dispose(); reopened.dispose();
  });
});
