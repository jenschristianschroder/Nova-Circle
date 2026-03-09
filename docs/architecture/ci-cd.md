# Nova-Circle — CI/CD

## Overview

All automated testing and deployment for Nova-Circle is driven by GitHub Actions. CI is a mandatory quality gate. No pull request may be merged if CI fails.

---

## Mandatory CI Rule

> Tests must run automatically in GitHub Actions CI on every pull request and every push to `main`.

CI failure is a merge blocker. The following conditions each constitute a CI failure that blocks merge:

- Any unit test fails.
- Any integration test fails.
- Any API test fails.
- Any authorization or privacy test fails.
- Lint or typecheck fails.
- A schema migration cannot be applied to an empty database or to the previous schema state.
- A container build fails.

---

## Pull Request Workflow

Every pull request to `main` triggers the **PR validation pipeline**.

### PR Validation Pipeline Steps

```
1. Install dependencies
2. Lint
3. Typecheck / compile
4. Unit tests
5. Integration tests (against a test database container)
6. API tests (against an in-process or containerized test server)
7. Authorization and privacy regression tests
8. Coverage report upload (if coverage is configured)
9. Migration dry-run (apply migrations to empty schema; verify no errors)
```

All steps run sequentially in the order listed. A failure at any step fails the workflow and blocks merge.

### Required Status Checks

The following GitHub status checks must be marked as **required** in branch protection rules for `main`:

- `lint`
- `typecheck`
- `unit-tests`
- `integration-tests`
- `api-tests`
- `auth-privacy-tests`
- `migration-check`

Pull requests may not be merged unless all required checks pass.

---

## Main Branch Workflow

Every push to `main` (after a PR merge) triggers the **main branch pipeline**.

### Main Branch Pipeline Steps

```
1. Install dependencies
2. Lint
3. Typecheck / compile
4. Unit tests
5. Integration tests
6. API tests
7. Authorization and privacy regression tests
8. Migration verification (apply migrations from empty schema AND incremental upgrade)
9. Build validation (confirm application builds successfully)
10. Container build (build Docker image; verify it builds without errors)
11. Container smoke test (start container; verify health endpoint responds)
12. Coverage report upload
```

The container build step uses the production Dockerfile. It must:

- Complete a multi-stage build.
- Produce an image that starts cleanly.
- Pass the smoke test (health endpoint returns `200 OK` within a timeout).

---

## Test Database in CI

Integration and API tests require a database. In CI, the database is started as a service container in the GitHub Actions job.

### Example PostgreSQL Service Container Configuration

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_DB: novacircle_test
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpassword
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

Migrations are applied to this test database before tests run. No test may assume a pre-existing schema state. Each CI run bootstraps the schema from scratch.

---

## No External Service Calls in CI

CI tests must never make calls to:

- Azure OpenAI or any other AI model API.
- Azure AI Services (OCR, speech-to-text, etc.).
- Azure Blob Storage (use Azurite or an in-process fake).
- Azure Service Bus (use an in-process fake).
- Any third-party API.

All external dependencies are replaced with deterministic fakes or stubs in CI. This is enforced by using injected interfaces in application code and providing fake implementations in test setup. See [testing.md](testing.md) for the test design rules.

---

## Container Build Requirements

The production container image must be built in CI on every push to `main`.

### Dockerfile Requirements

- Multi-stage build: a build stage and a minimal runtime stage.
- Runtime stage does not contain build tools, source code, or development dependencies.
- Image runs as a non-root user.
- No secrets are baked into the image.
- Runtime configuration is provided via environment variables.
- Only the required port is exposed.
- The image includes a health check endpoint or a `HEALTHCHECK` instruction.

### Build Failure Policy

If the container build fails on `main`, the failure is treated with the same urgency as a failing test. It blocks any subsequent deployment and must be resolved before the next PR can merge.

---

## Migration Checks

### On Pull Request

A migration dry-run is performed:

1. Start a clean test database.
2. Apply all migrations from the beginning.
3. Verify the final schema matches the expected state.
4. Fail CI if any migration produces an error.

### On Main Branch

An incremental upgrade check is also performed:

1. Start a test database with the schema from the previous release.
2. Apply only the new migrations added in the current change.
3. Verify the resulting schema and data integrity.
4. Fail CI if the incremental upgrade produces an error.

### Policy

No schema change may be merged without a corresponding migration. Migrations must be committed in the same PR as the code change that requires them.

---

## Coverage

If coverage tooling is configured:

- Coverage reports are uploaded as CI artifacts.
- Coverage thresholds are enforced: a PR that reduces total coverage below the defined threshold fails CI.
- Coverage does not replace the requirement for targeted authorization and privacy tests. High coverage on a feature does not exempt it from the mandatory actor-based authorization test matrix.

---

## Workflow File Structure

GitHub Actions workflow files live under `.github/workflows/`. Recommended file layout:

```
.github/
  workflows/
    pr-validation.yml      # Triggered on: pull_request targeting main
    main-pipeline.yml      # Triggered on: push to main
    container-build.yml    # Can be part of main-pipeline or separate
```

Each workflow file should be scoped to a single pipeline. Do not combine the PR validation and main branch pipelines into a single file with conditional logic that is hard to read.

---

## Secrets and Credentials in CI

- CI jobs use GitHub Actions OIDC federation with Azure to obtain short-lived credentials. Static client secrets must not be stored as GitHub Actions secrets.
- No production secrets are used in CI test runs. All external dependencies are faked.
- The test database password used in CI is a non-sensitive local credential used only for the ephemeral test container. It is not a production credential.
- Container registry push credentials (for publishing built images) are obtained via OIDC or managed identity, not static tokens.

---

## Deployment (Future)

Deployment to Azure is triggered from the `main` branch pipeline after all tests and the container build pass. Deployment is out of scope for this document's current iteration; deployment steps will be documented separately when environment-specific infrastructure is defined.

At a minimum, any future deployment step must:

- Only deploy artifacts built in the same CI run that passed all tests.
- Use system-assigned managed identity for Azure resource access.
- Not expose secrets in workflow logs.
- Apply database migrations before the new application version starts serving traffic.

---

## Related Documents

- [testing.md](testing.md) — Full test strategy and definition of done
- [overview.md](overview.md) — System architecture and deployment platform defaults
