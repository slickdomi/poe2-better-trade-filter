// Node has no global `localStorage` without a flag this project doesn't set
// (and jsdom is a heavier dependency than this in-memory Storage needs to
// be) — every lib under test only ever calls getItem/setItem, so a minimal
// polyfill is enough.
class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

globalThis.localStorage = new LocalStorageMock();
