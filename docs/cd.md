# Nova-Circle — Continuous Deployment

This document describes the CD pipeline, how it authenticates to Azure, what needs to be configured once, and how to operate it day-to-day.

---

## Overview

The pipeline is driven by two GitHub Actions workflows:

| Workflow | File | Trigger |
|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Every push and pull request |
| **CD** | `.github/workflows/cd.yml` | CI completes successfully on `main` |

CD only runs after every CI gate passes (lint, typecheck, unit/integration/API/auth-privacy tests, migration check, build). This guarantees nothing broken is ever deployed.

```
PR opened → CI runs
                    ↓ (merge to main)
              CI runs again
                    ↓ (all gates green)
              CD kicks off automatically
                    ↓
              build-and-push  (builds both images, pushes to ACR)
                    ↓
              deploy          (Bicep infra update → migrations → smoke test)
```

---

## Docker images

### Backend (`Dockerfile`)

Multi-stage build at the repository root.

| Stage | Base image | Purpose |
|---|---|---|
| `builder` | `node:20-alpine` | `npm ci` + `tsc` — produces `dist/` |
| `runtime` | `node:20-alpine` | Production deps only, non-root user, `node dist/src/server.js` |

- Listens on **port 3000**
- Health check endpoint: `GET /health` → `{ "status": "ok" }`

Build locally:

```bash
docker build -t nova-circle-api:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://...' \
  -e NODE_ENV=development \
  nova-circle-api:local
```

> **Note on AI adapters:** `NODE_ENV=production` requires real Azure AI Service adapters
> (`eventFieldExtractor`, `speechToTextAdapter`, `imageExtractionAdapter`, `blobStorageAdapter`)
> to be injected when calling `createApp()` in `src/server.ts`. Until those adapters are
> wired, the server will refuse to start in production mode with a DB connection. For
> local or staging use before the real adapters exist, either set `NODE_ENV=development`
> (which silently falls back to the deterministic fake implementations already defined
> under `src/modules/event-capture/infrastructure/fake-*.ts`) or pass the fake adapters
> explicitly:
> ```ts
> // src/server.ts — temporary dev/staging wiring
> import { FakeEventFieldExtractor } from './modules/event-capture/infrastructure/fake-event-field-extractor.js';
> // … import remaining fakes …
> const app = createApp({ db, tokenValidator,
>   eventFieldExtractor: new FakeEventFieldExtractor(), /* etc. */ });
> ```

### Frontend (`client/Dockerfile`)

Multi-stage build inside the `client/` directory.

| Stage | Base image | Purpose |
|---|---|---|
| `builder` | `node:20-alpine` | `npm ci` + `vite build` — produces `dist/` |
| `runtime` | `nginx:1.27-alpine` | Serves static assets; SPA fallback to `index.html` |

- Listens on **port 80**
- All unknown paths fall back to `index.html` (client-side routing)
- Vite-hashed assets (`*.js`, `*.css`) are cached for 1 year; `index.html` is never cached

> **Frontend deployment:** The CD workflow builds and pushes the frontend image to ACR
> but does not yet deploy it, because no frontend hosting module exists in the Bicep
> templates. When the hosting strategy is decided (a second Container App or an Azure
> Static Web App), add a `container-app-frontend.bicep` module (or equivalent) and a
> corresponding deploy step in `.github/workflows/cd.yml`.

Build locally:

```bash
docker build -t nova-circle-client:local client/
docker run --rm -p 8080:80 nova-circle-client:local
# open http://localhost:8080
```

---

## First-time bootstrap

Use `infra/scripts/bootstrap.sh` to set up everything from scratch in a single run.
It is idempotent — safe to re-run at any time.

### Prerequisites

```bash
# 1. Install Azure CLI and authenticate
az login

# 2. Install GitHub CLI and authenticate (required for GitHub configuration)
gh auth login
```

> **Why these can't be automated:** Both require browser-based OAuth2 flows to
> authenticate a human operator. They must be done interactively before running
> the bootstrap script.

### Running bootstrap

```bash
# Interactive (prompts for any missing values):
./infra/scripts/bootstrap.sh

# Non-interactive with all values supplied:
export POSTGRES_ADMIN_PASSWORD='<strong-password>'
./infra/scripts/bootstrap.sh \
  --subscription "My Azure Subscription" \
  --resource-group rg-nova-circle-dev \
  --location swedencentral \
  --environment dev \
  --github-repo owner/Nova-Circle \
  --app-redirect-uri https://<your-site-origin>

# Preview Bicep changes without creating anything:
export POSTGRES_ADMIN_PASSWORD='<strong-password>'
./infra/scripts/bootstrap.sh --what-if --skip-github --skip-migrations

# Re-run only GitHub configuration (infra already exists):
./infra/scripts/bootstrap.sh --skip-infra --skip-migrations
```

### What bootstrap.sh automates

| Step | Details |
|---|---|
| Resource group | `az group create` (idempotent) |
| CD service principal | App Registration + Service Principal + OIDC federated credentials |
| RBAC for CD principal | Contributor + User Access Administrator on the resource group |
| API app registration | App Registration for JWT validation (`api://nova-circle-<env>`) |
| CD ownership of API app | CD service principal added as owner so it can manage SPA redirect URIs |
| SPA redirect URIs | `http://localhost:5173` (non-prod) + any `--app-redirect-uri` value |
| Bicep infrastructure | All Azure resources (ACR, Container App, PostgreSQL, etc.) |
| AcrPush assignment | Grants CD service principal AcrPush on the ACR |
| Database migrations | Opens temporary firewall rule, runs `npm run migrate`, removes rule |
| GitHub variables | All 10 repository variables (see table below) |
| GitHub secrets | `POSTGRES_ADMIN_PASSWORD` |
| GitHub environments | Creates `production` and `infra-preview` environments |

### Manual steps that cannot be automated

**1. Add required reviewers to the `production` environment**

The `deploy` job in `cd.yml` requires approval before running. The bootstrap script
creates the environment but cannot set the reviewers programmatically in a way that
works across all GitHub plan types.

Go to: `https://github.com/<owner>/<repo>/settings/environments`
→ Click `production` → Enable **Required reviewers** → Add approvers.

**2. Expose OAuth2 scopes on the API app registration**

The bootstrap script registers SPA redirect URIs automatically (see above), but
OAuth2 scopes still need to be added manually for client apps. Go to Azure Portal
→ Entra ID → App Registrations → `nova-circle-api-<env>`:
- **Expose an API** — add scopes (e.g. `user_impersonation`; must match the scope configured in the client, `api://<clientId>/user_impersonation`)
- **API permissions** — in any client app, grant permissions to this API

> **SPA redirect URIs are now automated.** Pass the live-site origin with
> `--app-redirect-uri https://<your-site-origin>` when running `bootstrap.sh`.
> For non-production environments `http://localhost:5173` is always registered
> automatically.
>
> **`--app-redirect-uri` is required for `prod`.** If it is omitted, no SPA
> redirect URI will be registered and every sign-in will fail with
> `AADSTS500113`. Bootstrap will emit a warning with a direct link to the
> Authentication blade so you can add it manually if needed.
>
> **Playwright E2E redirect URIs are managed automatically by CD.** Before running
> E2E tests, the CD workflow registers the new revision's revision-specific origin
> as a temporary SPA redirect URI. After tests complete (pass or fail) it removes it.
> This works because `bootstrap.sh` grants the CD service principal ownership of the
> API app registration **and** the CD principal's app registration has the Microsoft
> Graph application permission `Application.ReadWrite.OwnedBy` granted with admin
> consent (app owners can call `az ad app update` for apps they own without broader
> directory roles). If you see `AADSTS50011` in E2E test logs, verify the CD service
> principal is an app owner: `az ad app owner list --id <API_AZURE_CLIENT_ID>`, and
> if `az ad app update` fails with insufficient privileges, ensure the CD principal's
> app registration includes `Application.ReadWrite.OwnedBy` with admin consent.

---

## Authentication — Azure OIDC (no static secrets)

The pipeline uses **GitHub OIDC federated credentials** to authenticate to Azure.
No `AZURE_CREDENTIALS` JSON blob or client secret is stored in GitHub.
Azure trusts GitHub's OIDC provider and issues a short-lived token per workflow run.

The bootstrap script creates and configures all of this automatically.
Below are the manual equivalents for reference.

### Manual Azure setup

**1. Create an App Registration:**

```bash
APP_ID=$(az ad app create --display-name "nova-circle-cd" --query appId -o tsv)
OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
```

**2. Add federated credentials** (one per GitHub OIDC context):

```bash
# build-and-push job: runs as the main branch workflow
az ad app federated-credential create --id "$OBJECT_ID" --parameters '{
  "name": "nova-circle-cd-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jenschristianschroder/Nova-Circle:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# deploy job: runs inside the 'production' GitHub environment
az ad app federated-credential create --id "$OBJECT_ID" --parameters '{
  "name": "nova-circle-cd-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jenschristianschroder/Nova-Circle:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# what-if job: runs inside the 'infra-preview' GitHub environment
az ad app federated-credential create --id "$OBJECT_ID" --parameters '{
  "name": "nova-circle-cd-infra-preview",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jenschristianschroder/Nova-Circle:environment:infra-preview",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

**3. Assign RBAC roles** on the resource group:

```bash
RG="rg-nova-circle-dev"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"

# Contributor: create and update Bicep-managed resources
az role assignment create \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "${RG_SCOPE}"

# User Access Administrator (scoped to the RG):
# Required so the CD principal can create the AcrPull role assignment
# deployed by main.bicep → acr-pull-role-assignment.bicep.
az role assignment create \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "User Access Administrator" \
  --scope "${RG_SCOPE}"

# AcrPush: push images to the Container Registry (assigned after ACR exists)
REGISTRY_ID=$(az acr list -g "$RG" --query "[0].id" -o tsv)
az role assignment create \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPush \
  --scope "$REGISTRY_ID"
```

> Use least-privilege roles. The Container App itself pulls images using its own
> system-assigned managed identity (`AcrPull`) — assigned automatically by Bicep.

**4. Grant the Microsoft Graph `Application.ReadWrite.OwnedBy` permission to the CD app:**

This permission allows the CD workflow to read and update app registrations it owns
(used to add/remove SPA redirect URIs around Playwright E2E tests). Without it
`az ad app show` will fail with a 403 Forbidden error even when the CD SP is an owner
of the API app registration.

```bash
# Microsoft Graph well-known app ID and Application.ReadWrite.OwnedBy role ID
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
APP_READ_WRITE_OWNED_BY="18a4783c-866b-4cc7-a460-3d5e5662c884"

az ad app permission add \
  --id "$OBJECT_ID" \
  --api "$GRAPH_APP_ID" \
  --api-permissions "${APP_READ_WRITE_OWNED_BY}=Role"

# Admin consent is required for application-level (non-delegated) permissions.
az ad app permission admin-consent --id "$OBJECT_ID"
```

> Requires Global Administrator or Application Administrator in Entra ID.
> `bootstrap.sh` runs this automatically.

**5. Add CD service principal as owner of the API app registration:**

```bash
API_APP_ID="<value of API_AZURE_CLIENT_ID GitHub variable>"
az ad app owner add --id "$API_APP_ID" --owner-object-id "$SP_ID"
```

> `bootstrap.sh` does this automatically in `setup_api_app()`.

---

## GitHub configuration

### Repository variables (Settings → Secrets and variables → Actions → Variables)

These are non-secret values safe to store as plain variables.

| Variable | Example value | Description |
|---|---|---|
| `AZURE_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | CD service principal client ID (used for OIDC login) |
| `AZURE_TENANT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra ID tenant ID |
| `AZURE_SUBSCRIPTION_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | `rg-nova-circle-dev` | Target resource group |
| `AZURE_ENVIRONMENT_NAME` | `dev` | Environment suffix in resource names (e.g. `ca-nova-circle-dev`) |
| `AZURE_LOCATION` | `swedencentral` | Azure region (used by what-if workflow) |
| `AZURE_REGISTRY_LOGIN_SERVER` | `crnovadev1a2b3c.azurecr.io` | ACR login server (from `registryLoginServer` output after first Bicep deploy) |
| `API_AZURE_TENANT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra tenant ID injected into the API container for JWT validation. May equal `AZURE_TENANT_ID` but is intentionally a separate variable. |
| `API_AZURE_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra client ID for the **API** app registration (JWT audience). **Must not** be the same as the CD `AZURE_CLIENT_ID`. |
| `CORS_ORIGIN` | `https://app.novacircle.com` | Comma-separated allowed CORS origins for the API (can be empty initially) |

Retrieve the registry login server after the first Bicep deploy:

```bash
az deployment group show \
  --resource-group rg-nova-circle-dev \
  --name nova-circle-dev \
  --query "properties.outputs.registryLoginServer.value" \
  --output tsv
```

### Repository secrets (Settings → Secrets and variables → Actions → Secrets)

| Secret | Description |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL administrator password. Passed to Bicep at deploy time and used to construct the migration connection string in the workflow. |

> The CD workflow constructs the migration connection string at runtime from
> `POSTGRES_ADMIN_PASSWORD` and the PostgreSQL FQDN returned by the Bicep
> deployment. No separate `DATABASE_URL` secret is required.

### Environments (Settings → Environments)

| Environment | Used by | Protection |
|---|---|---|
| `production` | `deploy` job in `cd.yml` | **Requires manual approval** — add reviewers in the GitHub UI |
| `infra-preview` | `what-if` job in `infra.yml` | Optional: restrict to specific branches |

The bootstrap script creates both environments. Required reviewers on `production`
must be added manually via the GitHub UI.

---

## CD workflow jobs

### `build-and-push`

1. Checks out `main` at the commit that passed CI
2. Authenticates to Azure via OIDC (`azure/login@v2`)
3. Logs in to ACR using the authenticated Azure CLI (no static credentials)
4. Builds and pushes `nova-circle-api:<sha>` + `nova-circle-api:latest`
5. Builds and pushes `nova-circle-client:<sha>` + `nova-circle-client:latest`

Image tags always include the full commit SHA for traceability.

### `deploy`

Runs after `build-and-push` and requires `production` environment approval.

The deploy steps are ordered to prevent a new app revision from starting against
an unmigrated schema:

1. **Get current image** — reads the image currently running in the Container App
   so it can be preserved during the infra update.
2. **Bicep deploy** — idempotent `az deployment group create` that updates all
   Azure infrastructure but keeps the Container App on its existing image.
   `azureTenantId` and `azureClientId` come from `API_AZURE_TENANT_ID` /
   `API_AZURE_CLIENT_ID` — the API's own app registration, not the CD principal.
3. **Open firewall** — temporarily adds the runner IP to the PostgreSQL firewall.
4. **Migrations** — `npm run migrate` with a connection string constructed from
   the Bicep FQDN output and URL-encoded `POSTGRES_ADMIN_PASSWORD`.
5. **Close firewall** — removes the runner IP rule (runs on success and failure).
6. **Switch image** — `az containerapp update --image` switches the Container App
   to the new SHA-tagged image only after migrations succeed.
7. **Smoke test** — polls `GET /health` (up to 6 attempts, 10 s apart) to confirm
   the new revision started cleanly.

---

## Database migrations

Migrations run from the workflow runner. A temporary PostgreSQL firewall rule is
created for the runner's IP before migrations run and removed immediately after
(the `if: always()` step ensures cleanup even on failure).

The PostgreSQL server name is derived from the environment name:
`psql-nova-circle-<AZURE_ENVIRONMENT_NAME>`.

If you prefer to avoid any public firewall exposure, the recommended production
approach is a Container App Job that runs migrations inside the VNet (Option B):

```yaml
# Future: run migrations via a Container App Job inside the VNet.
# No public PostgreSQL firewall exposure needed.
# Add a migration Container App Job Bicep module and trigger it here
# instead of running npm run migrate directly on the runner.
```

---

## Rollback

Redeploy a previous image tag using the deploy script directly:

```bash
export POSTGRES_ADMIN_PASSWORD='...'

./infra/scripts/deploy.sh \
  --resource-group rg-nova-circle-dev \
  --environment dev \
  --image "crnovadev1a2b3c.azurecr.io/nova-circle-api:<previous-sha>"
```

Images are retained in ACR by commit SHA, so any previously deployed version can
be re-activated without rebuilding.

---

## Security notes

- All workflows authenticate to Azure using ephemeral OIDC tokens — no static
  service-principal credentials are stored anywhere.
- The `infra.yml` what-if job uses the same OIDC approach as `cd.yml` (via the
  `infra-preview` federated credential), eliminating the need for `AZURE_CREDENTIALS`.
- `POSTGRES_ADMIN_PASSWORD` is stored as an encrypted GitHub secret and never
  logged. The migration connection string is constructed at runtime from this
  secret and the Bicep deployment output, with the password URL-encoded to
  handle special characters safely.
- The Container App's database URL is assembled and injected by Bicep as a secret —
  not visible in workflow logs.
- Images run as a non-root user (`nova`) inside the backend container.
- `adminUserEnabled: false` on the ACR; pull access uses the Container App's
  system-assigned managed identity (assigned automatically by Bicep).
- `AZURE_CLIENT_ID` (CD principal) and `API_AZURE_CLIENT_ID` (API audience) are
  intentionally separate app registrations to prevent audience confusion during
  JWT validation.
- The CD service principal holds `User Access Administrator` scoped to the
  resource group only — this is required to deploy the AcrPull role assignment
  inside main.bicep, and is narrower than `Owner`.
