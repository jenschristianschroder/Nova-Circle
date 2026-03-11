/**
 * Result returned by the speech-to-text adapter.
 */
export interface TranscriptResult {
  readonly transcript: string;
  /** Confidence score between 0 and 1. */
  readonly confidence: number;
}

/**
 * Interface for the speech-to-text normalization step.
 *
 * Application-layer code must only depend on this interface.
 * Concrete implementations live in infrastructure/ and may call Azure AI Speech or other providers.
 * Tests inject a deterministic fake.
 */
export interface ISpeechToTextAdapter {
  transcribe(audioBlobUri: string): Promise<TranscriptResult>;
}
