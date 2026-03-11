import type { CandidateEventFields } from './event-field-extractor.port.js';

/**
 * Result returned by the image extraction adapter.
 * May contain text extracted from the image, structured fields, or both.
 */
export interface ExtractionCandidate {
  /** Raw text extracted from the image (OCR or multimodal output). May be null. */
  readonly extractedText: string | null;
  /** Structured fields identified by the model. */
  readonly fields: CandidateEventFields;
}

/**
 * Interface for the image field extraction step.
 *
 * Application-layer code must only depend on this interface.
 * Concrete implementations live in infrastructure/ and may call Azure AI Vision, Azure OpenAI, or other providers.
 * Tests inject a deterministic fake.
 */
export interface IImageExtractionAdapter {
  extractFields(imageBlobUri: string): Promise<ExtractionCandidate>;
}
