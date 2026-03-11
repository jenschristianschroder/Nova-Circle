export interface CandidateField<T> {
  readonly value: T;
  /** Confidence score between 0 and 1. */
  readonly confidence: number;
}

/**
 * Structured candidate fields extracted from natural language text.
 * All fields are optional – the extractor returns only what it was able to identify.
 */
export interface CandidateEventFields {
  readonly title?: CandidateField<string>;
  readonly description?: CandidateField<string>;
  /** ISO 8601 datetime string as returned by the extractor. Requires deterministic parse before use. */
  readonly startDateTime?: CandidateField<string>;
  /** ISO 8601 datetime string as returned by the extractor. Requires deterministic parse before use. */
  readonly endDateTime?: CandidateField<string>;
  readonly durationMinutes?: CandidateField<number>;
  readonly groupName?: CandidateField<string>;
}

/**
 * Interface for the AI/NLP field extraction step.
 *
 * Application-layer code must only depend on this interface.
 * Concrete implementations live in infrastructure/ and may call Azure OpenAI or other providers.
 * Tests inject a deterministic fake.
 */
export interface IEventFieldExtractor {
  extractFromText(text: string): Promise<CandidateEventFields>;
}
