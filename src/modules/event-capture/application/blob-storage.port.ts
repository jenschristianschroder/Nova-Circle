/**
 * Port for secure binary blob storage (images, audio, etc.).
 *
 * Application-layer code must only depend on this interface.
 * Concrete implementations live in infrastructure/ and may call Azure Blob Storage
 * with system-assigned managed identity or any other storage provider.
 * Tests inject a deterministic fake.
 */
export interface IBlobStorageAdapter {
  /**
   * Stores a binary blob and returns a permanent URI that can be used for subsequent processing.
   *
   * @param data       Raw file bytes.
   * @param mimeType   MIME type of the file (e.g. "image/jpeg", "image/png").
   * @param filename   Suggested filename; implementations may ignore or sanitize this.
   * @returns          A URI string that uniquely identifies the stored blob.
   */
  store(data: Buffer, mimeType: string, filename: string): Promise<string>;
}
