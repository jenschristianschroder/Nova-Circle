import type { ISpeechToTextAdapter, TranscriptResult } from '../application/speech-to-text.port.js';

/**
 * Deterministic fake implementation of ISpeechToTextAdapter for tests.
 *
 * Returns a pre-configured transcript without calling any external STT service.
 */
export class FakeSpeechToTextAdapter implements ISpeechToTextAdapter {
  private result: TranscriptResult;

  constructor(result: TranscriptResult = { transcript: '', confidence: 1.0 }) {
    this.result = result;
  }

  /** Replaces the result returned by this fake. */
  setResult(result: TranscriptResult): void {
    this.result = result;
  }

  transcribe(_audioBlobUri: string): Promise<TranscriptResult> {
    return Promise.resolve(this.result);
  }
}
