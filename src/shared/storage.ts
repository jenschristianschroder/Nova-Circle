/**
 * Port for blob/object storage.
 *
 * Production implementations will use Azure Blob Storage.
 * In tests, replace with `FakeStorage`.
 */
export interface StoragePort {
  /**
   * Stores a blob at the given key.
   * Overwrites any existing object with the same key.
   *
   * @param key         - Unique object key (e.g. `uploads/events/abc123/photo.jpg`).
   * @param data        - Raw binary content.
   * @param contentType - MIME type (e.g. `image/jpeg`).
   */
  put(key: string, data: Buffer, contentType: string): Promise<void>;

  /**
   * Retrieves a blob by key.
   * Returns `null` when no object exists at the given key.
   */
  get(key: string): Promise<Buffer | null>;

  /**
   * Deletes the blob at the given key.
   * Resolves without error when the key does not exist.
   */
  delete(key: string): Promise<void>;
}
