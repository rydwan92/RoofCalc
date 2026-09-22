export type RemoteSaveStatus = 'saved' | 'saving' | 'error' | 'conflict';
export interface SaveState<T> {
  value?: T;
  version?: number;
  status: RemoteSaveStatus;
}

/** One in-flight write, latest edits queued, no retry over a version conflict. */
export class AutosaveQueue<T> {
  private state: SaveState<T>;
  private saved: string;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private listeners = new Set<() => void>();
  constructor(
    initial: T | undefined,
    version: number | undefined,
    private readonly save: (
      value: T,
      version: number | undefined,
    ) => Promise<{ value: T; version: number }>,
    private readonly merge: (current: T, saved: T) => T = (current) => current,
    private readonly debounceMs = 650,
  ) {
    this.state = { value: initial, version, status: 'saved' };
    this.saved = JSON.stringify(initial);
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SaveState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  set(value: T) {
    if (JSON.stringify(value) === JSON.stringify(this.state.value)) return;
    this.update({
      value,
      status: this.state.status === 'conflict' ? 'conflict' : 'saving',
    });
    clearTimeout(this.timer);
    if (this.state.status !== 'conflict')
      this.timer = setTimeout(() => {
        void this.flush().catch(() => undefined);
      }, this.debounceMs);
  }
  dirty = () => JSON.stringify(this.state.value) !== this.saved;
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.pending) {
      await this.pending;
      return this.flush();
    }
    if (!this.dirty() || this.state.value === undefined) return;
    if (this.state.status === 'conflict') throw new Error('version-conflict');
    const sent = this.state.value,
      serialized = JSON.stringify(sent);
    this.update({ status: 'saving' });
    this.pending = this.save(sent, this.state.version)
      .then((result) => {
        const latest =
          JSON.stringify(this.state.value) === serialized
            ? result.value
            : this.merge(this.state.value!, result.value);
        this.saved = JSON.stringify(result.value);
        this.update({
          value: latest,
          version: result.version,
          status: JSON.stringify(latest) === this.saved ? 'saved' : 'saving',
        });
      })
      .catch((error: unknown) => {
        const conflict =
          error instanceof Error && error.message.includes('version-conflict');
        this.update({ status: conflict ? 'conflict' : 'error' });
        throw error;
      })
      .finally(() => {
        this.pending = undefined;
      });
    await this.pending;
    if (this.dirty()) await this.flush();
  };
  dispose() {
    clearTimeout(this.timer);
  }
}
