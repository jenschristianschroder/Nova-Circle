# Nova-Circle — Event Capture

## Module Responsibility

The `event-capture` module accepts user input in three forms — typed natural language text, voice audio, and images — and produces either a saved `Event` (via `event-management`) or a first-class `EventDraft` with structured issue codes that the user can review and correct.

This module does **not**:

- Directly write to the `Event` table. It delegates event persistence to `event-management`.
- Trust raw AI model output as valid event data.
- Maintain separate business logic pipelines per input type.
- Expose AI or external service details to the presentation layer.

---

## Capture Pipeline

All three input types flow through a single shared pipeline. There is no branching of business logic based on input type. The input type affects only the initial normalization step.

```
Input (text / voice / image)
       ↓
   [1. Ingest & Store]       ← voice: store audio; image: store image securely
       ↓
   [2. Normalize to Text]    ← voice: transcribe (STT adapter); image: extract text/fields (OCR/multimodal adapter)
       ↓
   [3. Extract Candidates]   ← AI extraction adapter: title, description, start, end, group
       ↓
   [4. Deterministic Parse]  ← parse dates, times, timezones, durations without AI
       ↓
   [5. Validate]             ← business rule validation (required fields, time range, group access)
       ↓
   [6. Route]
       ├── All valid → CreateEventCommand → event-management
       └── Issues found → Persist EventDraft with structured issue codes
```

### Step 1: Ingest and Store

- Voice audio is stored securely in Azure Blob Storage before transcription begins.
- Images are stored securely in Azure Blob Storage before extraction begins.
- Text input does not require blob storage.
- Storage references are attached to the `EventDraft` for traceability.
- Blob access uses system-assigned managed identity; no shared keys.

### Step 2: Normalize to Text

- Voice: the audio blob reference is passed to the `SpeechToTextAdapter` interface. The adapter returns a transcript string. The transcript is treated identically to text input from this point forward.
- Image: the image blob reference is passed to the `ImageExtractionAdapter` interface. The adapter returns a structured `ExtractionCandidate` with fields the model was able to identify.
- Text: passed through without transformation.

The adapters are interfaces defined in `application/`. Concrete implementations live in `infrastructure/` and may call Azure AI Services, Azure OpenAI, or any other provider. Only the interface is visible to application-layer code.

### Step 3: Extract Candidates

- The normalized text or `ExtractionCandidate` is passed to the `EventFieldExtractor` interface.
- The extractor returns a `CandidateEventFields` object containing zero or more of: `title`, `description`, `startDateTime`, `endDateTime`, `durationMinutes`, `groupName`, and a `confidence` score per field.
- High-confidence fields are promoted; low-confidence fields are flagged.

### Step 4: Deterministic Parse

Dates, times, durations, and timezones are parsed deterministically using standard parsing libraries — not by AI. This ensures:

- Consistent behavior.
- Testability without external model calls.
- Predictable daylight saving time handling.

If a date or time string cannot be parsed deterministically, it is flagged as `ambiguous_date` or `ambiguous_time` rather than silently guessed.

### Step 5: Validate

Business rule validation:

- `title` is present and non-empty.
- `startAt` is present.
- `startAt < endAt` (if end is provided).
- `groupId` is present and the requesting user is a member of the group.
- User has permission to create events in the group.
- No field violates domain constraints (e.g., event is not in the past beyond a configurable threshold).

Validation does not call any AI service. All validation is deterministic.

### Step 6: Route

If all validations pass → dispatch `CreateEventCommand` to `event-management` → return created event ID.

If any validation fails or any required field has low confidence → persist `EventDraft` with structured issue codes → return draft ID and user-readable messages.

---

## EventDraft Model

An `EventDraft` is a first-class entity, not a temporary in-memory object.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `createdByUserId` | UUID | The user who initiated capture |
| `groupId` | UUID | May be null if group could not be identified |
| `rawInputType` | enum | `text`, `voice`, `image` |
| `rawTextContent` | string | Normalized text; nullable for image input with no text |
| `audioBlobReference` | string | Blob URI for voice input; nullable |
| `imageBlobReference` | string | Blob URI for image input; nullable |
| `candidateTitle` | string | Best candidate title; nullable |
| `candidateDescription` | string | Best candidate description; nullable |
| `candidateStartAt` | timestamp | Best candidate start; nullable |
| `candidateEndAt` | timestamp | Best candidate end; nullable |
| `issues` | JSON | Array of structured `DraftIssue` objects |
| `status` | enum | `pending_review`, `promoted`, `abandoned` |
| `createdAt` | timestamp | Set on insert |
| `updatedAt` | timestamp | Updated on each edit |

### DraftIssue Codes

Each issue is a structured object with a `code` and optionally a `field` and `message`.

| Code | Meaning |
|---|---|
| `missing_title` | No title could be extracted or inferred |
| `missing_start_date` | No start date could be determined |
| `missing_start_time` | No start time could be determined |
| `ambiguous_date` | Date string was present but could not be parsed deterministically |
| `ambiguous_time` | Time string was present but could not be parsed deterministically |
| `invalid_time_range` | `endAt` is before or equal to `startAt` |
| `missing_group` | No group could be identified from the input |
| `unauthorized_group_access` | A group was identified but the user is not a member |
| `low_confidence_extraction` | One or more fields had extraction confidence below the threshold |

A draft with issues is presented to the user with human-readable messages derived from the issue codes. The user may correct fields and re-submit, which re-runs the validation step (Step 5) and, if all issues are resolved, promotes the draft to a real event via `CreateEventCommand`.

---

## AI Adapter Boundary

All AI and ML integrations are isolated behind interfaces. Application-layer and domain-layer code must not directly call Azure OpenAI, Azure AI Services, or any other ML provider. This rule exists to:

1. Allow deterministic unit and integration tests without live model calls.
2. Allow provider changes without changes to business logic.
3. Prevent raw model output from directly creating database entities.

### Required Interfaces

```
ISpeechToTextAdapter
  transcribe(audioBlobUri: string): Promise<TranscriptResult>

IImageExtractionAdapter
  extractFields(imageBlobUri: string): Promise<ExtractionCandidate>

IEventFieldExtractor
  extractFromText(text: string): Promise<CandidateEventFields>
```

In tests, these interfaces are replaced with deterministic fakes. In production, the infrastructure implementations call the configured Azure AI service.

---

## Privacy Rules

- Raw audio, images, and transcripts are stored in Azure Blob Storage with access restricted to the `event-capture` service identity.
- Transcripts and OCR results are not logged at broad log levels.
- Raw capture artifacts are accessible only to the creating user.
- Blob references are not returned to the client unless explicitly needed for the user's own draft review.
- When a draft is abandoned, associated blobs are scheduled for deletion.
- AI service calls must not include personally identifiable information beyond what is needed for extraction.

---

## Deterministic Testability

Every step of the capture pipeline can be tested without external network calls. The rules are:

- All AI, STT, OCR, and storage adapters are injected as interfaces.
- Unit tests replace all adapter interfaces with deterministic fakes.
- Fake adapters return predefined `CandidateEventFields`, `TranscriptResult`, or `ExtractionCandidate` objects.
- Date/time parsing uses an injected clock interface so tests control the current time.

Integration tests may use lightweight in-process fakes for blob storage (e.g., Azurite).

CI never makes live calls to Azure OpenAI, Azure AI Services, or any speech-to-text or OCR endpoint.

---

## API Surface

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/capture/text` | Submit text input for event capture |
| `POST` | `/api/v1/capture/voice` | Submit voice audio for event capture |
| `POST` | `/api/v1/capture/image` | Submit image for event capture |
| `GET` | `/api/v1/capture/drafts` | List the caller's pending drafts |
| `GET` | `/api/v1/capture/drafts/{draftId}` | Get a specific draft |
| `PUT` | `/api/v1/capture/drafts/{draftId}` | Update draft fields and re-validate |
| `POST` | `/api/v1/capture/drafts/{draftId}/promote` | Promote a resolved draft to an event |
| `DELETE` | `/api/v1/capture/drafts/{draftId}` | Abandon a draft |

Voice and image capture endpoints accept multipart form data. The audio or image file is stored before the response is returned; the response body contains a draft ID and current issue list.

---

## Required Tests

### Unit Tests

- Complete text input with all required fields creates an event (no draft).
- Text input missing title creates a draft with `missing_title` issue.
- Text input missing start date creates a draft with `missing_start_date` issue.
- Text input with end before start creates a draft with `invalid_time_range` issue.
- Text input referencing a group the user is not a member of creates a draft with `unauthorized_group_access` issue.
- Low-confidence extraction on any field creates a draft with `low_confidence_extraction` issue; the pipeline does not silently promote.
- Voice input uses the same downstream validation pipeline as text (after the fake STT adapter returns a transcript).
- Image input uses the same downstream validation pipeline as text (after the fake extraction adapter returns candidates).
- Updating a draft with corrected fields and re-validating: if all issues resolved, promote creates an event.
- Deterministic date/time parser handles common formats, DST transitions, and UTC offsets without calling any AI service.

### Integration Tests

- Draft is persisted to the database with all issue codes when validation fails.
- Draft blob references are stored correctly.
- Promoting a draft dispatches `CreateEventCommand` and persists the event.
- Abandoning a draft marks status as `abandoned`.

### AI Boundary Tests

- Replacing the `IEventFieldExtractor` fake with one that returns low confidence does not create an event; it creates a draft.
- Replacing the `ISpeechToTextAdapter` fake with one that returns an empty transcript creates a draft with `missing_title` and `missing_start_date`.
- No test makes a real network call to any AI service.

---

## Related Documents

- [event-management.md](event-management.md) — Event domain and `CreateEventCommand`
- [testing.md](testing.md) — Deterministic test design for AI dependencies
- [overview.md](overview.md) — System architecture
