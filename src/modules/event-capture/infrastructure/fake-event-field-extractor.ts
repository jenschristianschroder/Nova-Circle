import type { IEventFieldExtractor, CandidateEventFields } from '../application/event-field-extractor.port.js';

/**
 * Deterministic fake implementation of IEventFieldExtractor for tests.
 *
 * Returns a pre-configured set of candidate fields without making any external calls.
 * Use this in unit and integration tests to avoid dependency on real AI services.
 */
export class FakeEventFieldExtractor implements IEventFieldExtractor {
  private fields: CandidateEventFields;

  constructor(fields: CandidateEventFields = {}) {
    this.fields = fields;
  }

  /** Replaces the fields returned by this fake. */
  setFields(fields: CandidateEventFields): void {
    this.fields = fields;
  }

  extractFromText(_text: string): Promise<CandidateEventFields> {
    return Promise.resolve(this.fields);
  }
}
