/**
 * EventCapture module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { EventDraft, DraftIssue, DraftIssueCode, DraftStatus, RawInputType } from './domain/event-draft.js';
export type { EventDraftRepositoryPort } from './domain/event-draft.repository.port.js';
export type { IEventFieldExtractor, CandidateEventFields, CandidateField } from './application/event-field-extractor.port.js';
export type { ISpeechToTextAdapter, TranscriptResult } from './application/speech-to-text.port.js';
export type { IImageExtractionAdapter, ExtractionCandidate } from './application/image-extraction.port.js';
export type { CaptureResult } from './application/capture-pipeline.service.js';
