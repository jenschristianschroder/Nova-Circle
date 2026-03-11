import { randomUUID } from 'crypto';
import type { IBlobStorageAdapter } from '../application/blob-storage.port.js';

/**
 * Deterministic fake implementation of IBlobStorageAdapter for tests.
 *
 * Returns a fake URI of the form `blob://fake-storage/<uuid>/<filename>`
 * without writing anything to disk or any external service.
 */
export class FakeBlobStorageAdapter implements IBlobStorageAdapter {
  /** Records all stored blobs for test assertions. */
  readonly stored: Array<{ uri: string; mimeType: string; filename: string; size: number }> = [];

  store(data: Buffer, mimeType: string, filename: string): Promise<string> {
    const uri = `blob://fake-storage/${randomUUID()}/${filename}`;
    this.stored.push({ uri, mimeType, filename, size: data.length });
    return Promise.resolve(uri);
  }
}
