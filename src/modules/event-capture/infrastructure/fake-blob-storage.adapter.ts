import type { IBlobStorageAdapter } from '../application/blob-storage.port.js';

/**
 * In-memory fake implementation of IBlobStorageAdapter for tests.
 *
 * Returns URIs of the form `blob://fake-storage/<counter>/<filename>` where `<counter>`
 * is a monotonically increasing integer scoped to this adapter instance.
 * This makes the URI sequence fully deterministic when the adapter is reset between tests
 * (i.e. each test creates a new instance).
 */
export class FakeBlobStorageAdapter implements IBlobStorageAdapter {
  /** Records all stored blobs for test assertions. */
  readonly stored: Array<{ uri: string; mimeType: string; filename: string; size: number }> = [];

  private counter = 0;

  store(data: Buffer, mimeType: string, filename: string): Promise<string> {
    this.counter += 1;
    const uri = `blob://fake-storage/${this.counter}/${filename}`;
    this.stored.push({ uri, mimeType, filename, size: data.length });
    return Promise.resolve(uri);
  }

  /** Resets the counter and clears stored records. Useful when a single test needs a fresh state. */
  reset(): void {
    this.counter = 0;
    this.stored.length = 0;
  }
}
