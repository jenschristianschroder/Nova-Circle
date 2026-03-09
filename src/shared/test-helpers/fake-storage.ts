import type { StoragePort } from '../storage.js';

interface StoredBlob {
  data: Buffer;
  contentType: string;
}

/**
 * FakeStorage – in-memory blob store for tests.
 *
 * Captures all put/delete operations so that tests can assert on them
 * without requiring a real Azure Blob Storage account or emulator.
 *
 * Never use FakeStorage outside of test code.
 *
 * @example
 * const storage = new FakeStorage();
 * await captureService.storeImage('uploads/abc.jpg', imageBuffer, 'image/jpeg', storage);
 * expect(storage.has('uploads/abc.jpg')).toBe(true);
 * expect(storage.contentType('uploads/abc.jpg')).toBe('image/jpeg');
 */
export class FakeStorage implements StoragePort {
  private readonly blobs = new Map<string, StoredBlob>();

  /** Stores the blob in memory, overwriting any existing entry at the same key. */
  put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.blobs.set(key, { data: Buffer.from(data), contentType });
    return Promise.resolve();
  }

  /**
   * Returns the stored blob, or `null` if the key does not exist.
   * Returns a copy so callers cannot mutate internal state.
   */
  get(key: string): Promise<Buffer | null> {
    const entry = this.blobs.get(key);
    return Promise.resolve(entry ? Buffer.from(entry.data) : null);
  }

  /** Removes the blob at the given key. Resolves without error when the key is absent. */
  delete(key: string): Promise<void> {
    this.blobs.delete(key);
    return Promise.resolve();
  }

  // ── Test assertion helpers ─────────────────────────────────────────────

  /** Returns `true` when a blob exists at the given key. */
  has(key: string): boolean {
    return this.blobs.has(key);
  }

  /** Returns the content-type of the stored blob, or `undefined` when absent. */
  contentType(key: string): string | undefined {
    return this.blobs.get(key)?.contentType;
  }

  /** Returns the total number of stored blobs. */
  count(): number {
    return this.blobs.size;
  }

  /** Returns an array of all stored keys. */
  keys(): string[] {
    return Array.from(this.blobs.keys());
  }

  /** Clears all stored blobs. Useful between test cases that share one instance. */
  clear(): void {
    this.blobs.clear();
  }
}
