import type { IImageExtractionAdapter, ExtractionCandidate } from '../application/image-extraction.port.js';

/**
 * Deterministic fake implementation of IImageExtractionAdapter for tests.
 *
 * Returns a pre-configured extraction result without calling any external vision service.
 */
export class FakeImageExtractionAdapter implements IImageExtractionAdapter {
  private candidate: ExtractionCandidate;

  constructor(candidate: ExtractionCandidate = { extractedText: null, fields: {} }) {
    this.candidate = candidate;
  }

  /** Replaces the result returned by this fake. */
  setCandidate(candidate: ExtractionCandidate): void {
    this.candidate = candidate;
  }

  extractFields(_imageBlobUri: string): Promise<ExtractionCandidate> {
    return Promise.resolve(this.candidate);
  }
}
