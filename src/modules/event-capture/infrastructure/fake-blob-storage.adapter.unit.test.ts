import { describe, it, expect } from 'vitest';
import { FakeBlobStorageAdapter } from './fake-blob-storage.adapter.js';

describe('FakeBlobStorageAdapter', () => {
  it('returns a non-empty URI for any input', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const uri = await adapter.store(Buffer.from('image-data'), 'image/jpeg', 'photo.jpg');
    expect(typeof uri).toBe('string');
    expect(uri.length).toBeGreaterThan(0);
  });

  it('URI contains the original filename', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const uri = await adapter.store(Buffer.from('bytes'), 'image/png', 'event-flyer.png');
    expect(uri).toContain('event-flyer.png');
  });

  it('records stored blobs with correct metadata', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const data = Buffer.from('hello-image');
    await adapter.store(data, 'image/webp', 'banner.webp');

    expect(adapter.stored).toHaveLength(1);
    expect(adapter.stored[0]!.mimeType).toBe('image/webp');
    expect(adapter.stored[0]!.filename).toBe('banner.webp');
    expect(adapter.stored[0]!.size).toBe(data.length);
    expect(adapter.stored[0]!.uri).toContain('banner.webp');
  });

  it('generates unique URIs for separate uploads of the same file', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const uri1 = await adapter.store(Buffer.from('a'), 'image/jpeg', 'dup.jpg');
    const uri2 = await adapter.store(Buffer.from('b'), 'image/jpeg', 'dup.jpg');
    expect(uri1).not.toBe(uri2);
  });
});
