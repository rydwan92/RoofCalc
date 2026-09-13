export class MemoryStorage {
  readonly items = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota');
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}
