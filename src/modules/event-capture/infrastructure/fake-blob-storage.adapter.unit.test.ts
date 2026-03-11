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

  it('uses a deterministic counter so URIs are predictable within an adapter instance', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const uri1 = await adapter.store(Buffer.from('a'), 'image/jpeg', 'photo.jpg');
    const uri2 = await adapter.store(Buffer.from('b'), 'image/jpeg', 'photo.jpg');
    expect(uri1).toBe('blob://fake-storage/1/photo.jpg');
    expect(uri2).toBe('blob://fake-storage/2/photo.jpg');
  });

  it('records stored blobs with correct metadata', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const data = Buffer.from('hello-image');
    await adapter.store(data, 'image/webp', 'banner.webp');

    expect(adapter.stored).toHaveLength(1);
    expect(adapter.stored[0]!.mimeType).toBe('image/webp');
    expect(adapter.stored[0]!.filename).toBe('banner.webp');
    expect(adapter.stored[0]!.size).toBe(data.length);
    expect(adapter.stored[0]!.uri).toBe('blob://fake-storage/1/banner.webp');
  });

  it('generates unique URIs for separate uploads of the same file', async () => {
    const adapter = new FakeBlobStorageAdapter();
    const uri1 = await adapter.store(Buffer.from('a'), 'image/jpeg', 'dup.jpg');
    const uri2 = await adapter.store(Buffer.from('b'), 'image/jpeg', 'dup.jpg');
    expect(uri1).not.toBe(uri2);
  });

  it('reset() clears stored records and restarts counter', async () => {
    const adapter = new FakeBlobStorageAdapter();
    await adapter.store(Buffer.from('x'), 'image/jpeg', 'before.jpg');
    adapter.reset();
    expect(adapter.stored).toHaveLength(0);
    const uri = await adapter.store(Buffer.from('y'), 'image/png', 'after.png');
    expect(uri).toBe('blob://fake-storage/1/after.png');
  });
});
