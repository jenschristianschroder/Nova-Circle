# Group Calendar — GitHub Copilot Instructions

## Project purpose
Group Calendar is a privacy-first and security-first mobile and web app for friends, families, and other private groups to organize events.

Core capabilities:
- manage user profile
- manage group memberships
- manage groups where the user is owner or administrator
- manage events inside groups
- create events from natural language text, voice, and images
- support event-scoped chat
- support event-scoped checklist
- support event-scoped location

Primary goals:
- privacy first
- security first
- explicit authorization
- modular architecture
- Azure-first deployment
- Docker-first delivery
- serverless-first where practical
- future Kubernetes compatibility without premature AKS complexity
- mandatory automated testing in GitHub CI

---

## Non-negotiable priorities
When generating code, optimize for:
1. correctness
2. privacy
3. security
4. maintainability
5. explicit access control
6. testability
7. operational simplicity

Do not optimize for cleverness, brevity, or abstraction at the expense of clarity.

---

## Core architecture rules

### Modular architecture
Build the backend as a modular monolith first, with clear boundaries so modules can later be separated if needed.

Preferred modules:
- identity-profile
- group-management
- group-membership
- event-management
- event-capture
- event-chat
- event-checklist
- event-location
- notifications
- audit-security

Do not tightly couple modules together.

### Clean architecture
Prefer separation of:
- domain
- application
- infrastructure
- presentation

Business rules must not depend directly on:
- controllers
- HTTP frameworks
- cloud SDKs
- ORM details
- storage adapters
- UI code

## UI design philosophy
The UI must be simple, calm, aesthetic, and practical. Avoid flashy, highly decorative, or animation-heavy design. Prefer clean layouts, restrained styling, clear typography, and focused screens.

## Theme support
Support light and dark mode plus a small set of predefined curated color palettes. Use centralized semantic design tokens. Do not hardcode colors in components. Ensure all palettes meet accessibility contrast requirements.

## UX preference
Design should be simple and to the point. Optimize for clarity, privacy, and task completion rather than visual spectacle.

### Stateless services
Generated backend services should be stateless unless persistence is explicitly required.

### Event-scoped collaboration
Chat, checklist, location, and other collaboration data are scoped to a specific event and must not be shown at group level.

### Group-level views
Group-level views are limited to event discovery and navigation only.

At group level, show only:
- event list
- event summaries the user is allowed to see
- draft events only if policy explicitly allows it

Do not show at group level:
- chat content or previews
- checklist items or rollups
- location details
- collaboration activity summaries
- hidden event counts or hints that inaccessible events exist

---

## Azure and infrastructure rules

### Platform direction
Prefer:
- Azure-first
- Docker-first
- serverless-first where practical
- Kubernetes-ready design without introducing AKS complexity unless explicitly requested

### Identity and access
Always prefer:
- system-assigned managed identity
- Azure RBAC
- least privilege

Never introduce static secrets when managed identity can be used.

Avoid:
- hardcoded secrets
- connection strings when managed identity is supported
- shared keys unless unavoidable
- overly broad roles such as Owner when narrower roles work

### Common Azure defaults
Reasonable defaults:
- frontend: Azure Static Web Apps or App Service
- backend: Azure Container Apps, App Service, or Functions
- messaging: Azure Service Bus
- storage: Azure Blob Storage
- secrets: Azure Key Vault only when unavoidable
- monitoring: Application Insights, Azure Monitor, Log Analytics
- database: Azure PostgreSQL Flexible Server or Azure SQL

### Docker
All services should be container-friendly.
When generating Docker artifacts:
- use multi-stage builds where appropriate
- keep images small
- run as non-root where practical
- do not bake secrets into images
- keep builds deterministic
- expose only required ports
- use environment variables for runtime configuration

---

## Security and privacy rules

### General
Security and privacy are mandatory, not optional.

Always:
- validate inputs
- enforce authorization in backend code
- minimize returned data
- minimize logged data
- use safe error handling
- use least privilege
- design for auditability

Never:
- trust frontend authorization alone
- expose internal secrets, tokens, stack traces, or private identifiers unnecessarily
- log sensitive raw payloads broadly
- grant access through implied relationships when explicit authorization is required

### Authentication
Assume authenticated users come through Microsoft Entra ID / External ID / B2C style flows.
Trust identity only after token validation at the edge.

Never create production auth shortcuts.
Test-only shortcuts must be clearly isolated and marked.

### Authorization
Authorization must be explicit in application/domain logic.

Do not rely only on:
- route-level auth
- group membership
- UI checks

Sensitive operations must verify authorization in backend code.

### Data minimization
Only return the minimum data needed for a use case.

Do not expose:
- hidden event metadata
- unnecessary personal data
- email addresses unless clearly needed
- private collaboration data outside the event boundary

### Auditability
Sensitive actions should be auditable, including:
- group ownership changes
- admin role changes
- membership changes
- event creation, update, cancellation
- invitation changes
- event visibility changes
- event location changes
- checklist changes where appropriate
- privileged access decisions

---

## Event access model

### Critical rule
Group membership alone must never grant event access.

### Event creation default
When a user creates an event in a group:
- all current group members are invited by default
- the creator can remove members before saving
- the saved event must persist an explicit invitation list
- event access after save is controlled by explicit event invitations, not by live group membership alone

### Membership snapshot rule
The default invite list is a snapshot of current group membership at creation time.

After save:
- members added later must not automatically gain access to existing events
- historic events must not be exposed to newly joined members by default
- removed invitees must not retain event access unless policy explicitly says so
- former group members must not retain access if your policy requires current membership for access

### Visibility rule
A user can view an event only if policy explicitly allows it, such as:
- they created the event
- they have an active invitation for the event
- they satisfy any explicit elevated override policy if such a policy exists

Never implement event visibility as:
- user is a group member, therefore user can see the event

### Hidden event rule
Do not leak inaccessible event existence through:
- titles
- counts
- summaries
- recent activity
- locations
- checklist summaries
- chat previews

### Collaboration inheritance
Event-scoped collaboration features inherit event access.
If a user cannot view an event, they cannot view:
- event chat
- event checklist
- event location
- event description
- event source capture artifacts
- event invite list beyond policy allowance
- event attachments

---

## Event creation and invitation rules

### Event invitations
Persist explicit event invitation records.
Do not derive final access from group membership after save.

Recommended invitation states:
- invited
- accepted
- declined
- tentative
- removed

### Creator behavior
At event creation time:
- prepopulate invitees from all current group members
- allow the creator to remove members before save
- save explicit invitation rows transactionally with the event

### New members
When a new member joins a group:
- they may be invited to future events
- they must not automatically gain access to existing or historic events

### Leaving or removal
If a user leaves a group or is removed, apply the product privacy rules consistently.
Prefer privacy-preserving behavior.
Do not leave access ambiguous.

---

## Event capture rules

### Purpose
Event capture accepts:
- typed natural language
- voice input
- image input

All input types must flow into the same shared pipeline.

### Shared pipeline
Use one canonical capture flow:
1. capture input
2. normalize input
3. extract event candidate fields
4. resolve ambiguous fields where safe
5. validate business rules
6. create either:
   - a real event, or
   - an event draft with structured issues

Do not create separate business logic pipelines for text, voice, and image.

### Required separation
Always separate:
- extraction
- interpretation
- validation
- persistence

The domain must never trust raw AI output directly.

### Voice
Voice must use the same downstream pipeline as text after transcription.

### Image
Image processing should:
- securely store the image if needed
- extract text or multimodal candidate fields
- preserve extraction traceability where needed
- pass structured candidates into the same normalization and validation flow

### Draft behavior
If input is incomplete, ambiguous, or invalid:
- create a first-class draft
- persist structured issue codes
- return user-readable messages
- allow later review and correction

Do not silently guess low-confidence fields.

### Confidence and ambiguity
Prefer deterministic parsing for:
- dates
- times
- durations
- timezones
- validation

Use AI or multimodal extraction for:
- messy natural language
- title inference
- description inference
- image-based extraction

Never let a model directly create database entities.

### Suggested issue handling
Draft issues should be structured, such as:
- missing_title
- missing_start_date
- missing_start_time
- ambiguous_date
- ambiguous_time
- invalid_time_range
- missing_group
- unauthorized_group_access
- low_confidence_extraction

---

## Event-scoped feature rules

### Event chat
Chat is event-scoped only.
Do not aggregate or preview event chat at group level.

Start simple:
- text-only chat
- no attachments unless explicitly requested
- soft delete rather than immediate hard delete
- audit where appropriate

### Event checklist
Checklist is event-scoped only.
Do not aggregate checklist data at group level.

Keep checklist intentionally lightweight:
- item text
- open or done
- optional assignee
- optional due date
- optional ordering

Do not turn checklist into a full project management system unless explicitly requested.

### Event location
Location is event-scoped only.
Do not show event location details at group level.

Allow:
- freeform location text
- structured address fields
- coordinates when useful
- virtual meeting URL
- hybrid events

Prefer both:
- human-friendly display text
- structured data for future validation or search

Be careful with home addresses and other private locations.

---

## Data model guidance

### General
Prefer relational persistence for core application data.

Use:
- migrations
- transactions around multi-step state changes
- deliberate indexes
- explicit queries
- safe ORM usage or parameterized queries
- optimistic concurrency where helpful

### Core entities
Typical entities may include:
- User
- UserProfile
- Group
- GroupMember
- Event
- EventInvitation
- EventDraft
- EventChatThread
- EventChatMessage
- EventChecklist
- EventChecklistItem
- EventLocation

### Modeling rule
Keep Event as the scheduling core.
Do not turn Event into a giant object containing all collaboration data inline.
Chat, checklist, location, and draft concerns should be separate event-linked models.

---

## API design guidance

### General
Prefer REST unless another pattern is explicitly requested.

### Conventions
- version APIs, for example `/api/v1/...`
- use nouns for resources
- use standard HTTP methods correctly
- return consistent structured error responses
- support pagination for list endpoints
- include correlation or request IDs where useful

### Validation
Validate all request DTOs before use.
Reject invalid state early.

### Error handling
Errors must be:
- safe
- structured
- actionable for developers
- non-leaky for users

Do not expose:
- stack traces
- infrastructure details
- secret values
- internal implementation details

---

## Code organization guidance

### Preferred structure
Prefer feature or module-based organization over technical-layer-only organization.

Example:
```text
src/
  modules/
    identity-profile/
    group-management/
    group-membership/
    event-management/
    event-capture/
    event-chat/
    event-checklist/
    event-location/
    notifications/
    audit-security/
  shared/
  infrastructure/

Within a module, prefer:

module/
  domain/
  application/
  infrastructure/
  presentation/

Keep shared code minimal and intentional.
Do not create a vague utils bucket for domain logic.

⸻

Coding style rules

Always generate code that is:
	•	readable
	•	explicit
	•	strongly typed where the language supports it
	•	easy to test
	•	easy to refactor
	•	easy to review

Prefer:
	•	explicit names over short names
	•	small focused functions
	•	guard clauses
	•	composition over inheritance unless inheritance is clearly justified
	•	obvious side effects
	•	typed configuration
	•	dependency injection where idiomatic

Avoid vague names like:
	•	Helper
	•	Manager
	•	Processor
	•	Thing
	•	Utils

Use domain names that match the business, such as:
	•	EventPolicy
	•	EventInvitationPolicy
	•	CreateEventCommand
	•	EventDraftIssue
	•	EventCaptureService

Add comments only when they explain why, not what.

⸻

Testing requirements

Non-negotiable rule

Every feature, bug fix, authorization rule, privacy rule, and API endpoint must include automated tests.

Code is incomplete until tests exist and can run automatically in GitHub Actions CI.

Required test categories

Every meaningful capability should have appropriate coverage from:
	•	unit tests
	•	integration tests
	•	API tests
	•	authorization/privacy tests

Critical user journeys should also have UI or end-to-end coverage where practical.

Unit tests

Use fast isolated tests for:
	•	domain rules
	•	policy rules
	•	validation
	•	invite seeding logic
	•	draft issue generation
	•	checklist permission logic
	•	chat permission logic
	•	location validation logic
	•	access control matrix behavior

Integration tests

Use integration tests for:
	•	repositories
	•	persistence mappings
	•	migrations
	•	transaction boundaries
	•	outbox behavior where used
	•	authorization across persistence-backed flows

API tests

Use API tests for:
	•	request validation
	•	auth handling
	•	response contracts
	•	safe error handling
	•	authorization enforcement
	•	hidden event non-disclosure

Authorization and privacy tests

These are mandatory, not optional.

For protected capabilities, test at minimum:
	•	creator
	•	invited member
	•	removed invitee
	•	non-invited current group member
	•	newly joined member not invited to historic event
	•	former group member if relevant
	•	any explicit admin or owner override behavior if it exists

Event-specific tests

Must test:
	•	event creation seeds all current group members as invitees by default
	•	creator can remove invitees before save
	•	final saved invite list controls access
	•	new members do not gain access to old events automatically
	•	group membership alone never grants event visibility
	•	inaccessible events do not appear in group event lists
	•	chat, checklist, and location inherit event visibility

Event capture tests

Must test:
	•	complete text input can create event
	•	incomplete input creates draft with structured issues
	•	voice uses same capture pipeline after transcription
	•	image extraction uses same downstream validation and draft logic
	•	low-confidence or incomplete extraction does not bypass draft flow

Deterministic testing rule

Never add logic that cannot be tested deterministically.

External dependencies such as:
	•	AI
	•	OCR
	•	speech-to-text
	•	blob storage
	•	messaging
must be wrapped behind interfaces and mocked or simulated in CI tests.

Do not require live external model calls in normal PR CI runs.

Migration and schema tests

If schema changes:
	•	migrations must run in CI
	•	schema must bootstrap from scratch
	•	persistence behavior must be tested

Test data strategy

Prefer:
	•	builders
	•	isolated test state
	•	deterministic clocks
	•	fake identity providers
	•	fake event buses
	•	fake storage adapters where appropriate

Avoid:
	•	brittle shared fixtures
	•	order-dependent tests
	•	hidden global mutable test state

⸻

GitHub CI requirements

Mandatory rule

Tests must run automatically in GitHub Actions CI.

On pull requests

CI should run at least:
	•	dependency install
	•	lint
	•	typecheck or compile
	•	unit tests
	•	integration tests
	•	API tests
	•	coverage reporting if configured

On main branch

CI should run at least:
	•	full automated suite
	•	build validation
	•	migration verification
	•	container build
	•	smoke tests if configured

Quality gate rule

Do not merge code that:
	•	lacks tests for new behavior
	•	breaks authorization or privacy tests
	•	fails CI
	•	introduces schema changes without migration verification

⸻

Logging and observability

Use structured logging.
Prefer correlation IDs and operation context.

Good things to log:
	•	operation names
	•	safe resource identifiers
	•	request IDs
	•	timings
	•	error categories

Do not log:
	•	tokens
	•	secrets
	•	passwords
	•	raw sensitive event content unless explicitly necessary
	•	full transcripts or OCR results at broad log levels
	•	home addresses or private location details in broad logs

Observability must support debugging without violating privacy.

⸻

What Copilot must avoid

Do not generate:
	•	hardcoded secrets
	•	fake production auth bypasses
	•	hidden cross-module coupling
	•	giant service classes with mixed responsibilities
	•	business rules only inside controllers
	•	broad admin bypasses
	•	implicit access through group membership for event visibility
	•	group-level exposure of event-scoped collaboration data
	•	speculative abstractions with no current use
	•	premature microservice complexity
	•	Kubernetes-specific complexity unless explicitly needed
	•	custom cryptography
	•	homegrown authentication or session solutions when platform standards exist

⸻

Preferred implementation patterns

Prefer patterns like:
	•	command and query use cases
	•	policy-based authorization
	•	repository interfaces at boundaries
	•	domain events where useful
	•	integration events where useful
	•	outbox pattern when messaging is used
	•	dependency injection
	•	typed configuration objects
	•	result or error objects where idiomatic
	•	builders for tests

⸻

Definition of done

A change is only done when:
	•	the code compiles or builds
	•	tests are added or updated
	•	CI passes
	•	authorization and privacy rules are covered
	•	migrations are tested if schema changed
	•	API contracts are updated if endpoints changed
	•	the implementation follows the architecture and access model in this file

⸻

Final implementation defaults

When uncertain, choose:
	•	secure defaults
	•	private defaults
	•	explicit validation
	•	explicit authorization
	•	modular design
	•	narrow permissions
	•	deterministic tests
	•	simple maintainable solutions

If there is a tradeoff between convenience and privacy/security, choose privacy/security unless the prompt explicitly requires a different approach.

