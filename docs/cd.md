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

## Authentication — Azure OIDC (no static secrets)

The pipeline uses **GitHub OIDC federated credentials** to authenticate to Azure. No
`AZURE_CREDENTIALS` JSON secret is stored in GitHub. Instead, Azure trusts GitHub's OIDC
provider and issues a short-lived token for each workflow run.

### One-time Azure setup

**1. Create an App Registration** (or use an existing one):

```bash
APP_ID=$(az ad app create --display-name "nova-circle-cd" --query appId -o tsv)
OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
```

**2. Add a federated credential** for the `main` branch and for the `production` environment:

```bash
# Federated credential for pushes/workflow_run on main
az ad app federated-credential create --id "$OBJECT_ID" --parameters '{
  "name": "nova-circle-cd-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jenschristianschroder/Nova-Circle:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Federated credential for the `production` GitHub environment
az ad app federated-credential create --id "$OBJECT_ID" --parameters '{
  "name": "nova-circle-cd-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:jenschristianschroder/Nova-Circle:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

**3. Assign RBAC roles** on the resource group:

```bash
RG="rg-nova-circle-dev"   # change for other environments
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Contributor: deploy Bicep templates
az role assignment create \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"

# AcrPush: push images to the Container Registry
REGISTRY_ID=$(az acr list -g "$RG" --query "[0].id" -o tsv)
az role assignment create \
  --assignee-object-id "$SP_ID" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPush \
  --scope "$REGISTRY_ID"
```

> Use `AcrPush` (not `Owner`) — least privilege. The Container App itself uses
> `AcrPull` via its system-assigned managed identity (assigned separately after first deploy).

---

## GitHub configuration

### Repository variables (Settings → Secrets and variables → Actions → Variables)

These are non-secret values safe to store as plain variables.

| Variable | Example value | Description |
|---|---|---|
| `AZURE_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | CD service principal client ID (used for `azure/login` OIDC) |
| `AZURE_TENANT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra ID tenant ID (used for `azure/login` OIDC) |
| `AZURE_SUBSCRIPTION_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | `rg-nova-circle-dev` | Target resource group name |
| `AZURE_ENVIRONMENT_NAME` | `dev` | Short environment suffix used in resource names (e.g. `ca-nova-circle-dev`) |
| `AZURE_REGISTRY_LOGIN_SERVER` | `crnovadev1a2b3c.azurecr.io` | ACR login server (from `registryLoginServer` output after first Bicep deploy) |
| `API_AZURE_TENANT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra tenant ID injected into the API container for JWT validation. May match `AZURE_TENANT_ID` but is intentionally separate — the CD principal and the API audience are different app registrations. |
| `API_AZURE_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Entra client ID (app registration audience) injected into the API container for JWT validation. **Must not** be the same as the CD `AZURE_CLIENT_ID`. |

Retrieve the registry login server after the first manual Bicep deploy:

```bash
az deployment group show \
  --resource-group rg-nova-circle-dev \
  --name main \
  --query "properties.outputs.registryLoginServer.value" \
  --output tsv
```

### Repository secrets (Settings → Secrets and variables → Actions → Secrets)

These are sensitive values. Configure them at either repository or `production` environment level.

| Secret | Description |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL administrator password. Passed to Bicep at deploy time. |
| `DATABASE_URL` | Full PostgreSQL connection string for running migrations, e.g. `postgresql://ncadmin:<password>@psql-nova-circle-dev.postgres.database.azure.com:5432/nova_circle?sslmode=require` |

> `DATABASE_URL` for migrations uses the admin account. For application runtime the
> Container App receives the same connection string as a secret injected by Bicep.

### Production environment (Settings → Environments → production)

Create the `production` environment and configure:

- **Required reviewers** — one or more people who must approve deployments
- Optionally set **Deployment branches** to `main` only

The `deploy` job in `cd.yml` targets this environment, so all deployments pause for review before running.

---

## CD workflow jobs

### `build-and-push`

1. Checks out `main` at the commit that passed CI
2. Authenticates to Azure via OIDC (`azure/login@v2`)
3. Logs in to ACR using the authenticated Azure CLI (no static credentials)
4. Builds and pushes `nova-circle-api:<sha>` + `nova-circle-api:latest`
5. Builds and pushes `nova-circle-client:<sha>` + `nova-circle-client:latest`

Image tags always include the full commit SHA for traceability. The `:latest` tag makes rollback straightforward.

### `deploy`

Runs after `build-and-push` and requires `production` environment approval.

The deploy steps are ordered to prevent a new app revision from starting against an unmigrated schema:

1. **Get current image** — reads the image currently running in the Container App so it can be preserved during the infra update.
2. **Bicep deploy** — idempotent `az deployment group create` (named `nova-circle-<run-id>`) that updates all Azure infrastructure but keeps the Container App on its existing image. `azureTenantId` and `azureClientId` are sourced from `API_AZURE_TENANT_ID` / `API_AZURE_CLIENT_ID` — the API's own app registration, not the CD service principal.
3. **Migrations** — `npm run migrate` against `DATABASE_URL` from the secret.
4. **Switch image** — `az containerapp update --image` switches the Container App to the new SHA-tagged image only after migrations succeed.
5. **Smoke test** — polls `GET /health` (up to 6 attempts, 10 s apart) to confirm the new revision started cleanly.

---

## Database migrations

Migrations run directly from the workflow runner using Node.js. This requires the
PostgreSQL server to accept connections from GitHub Actions runner IP addresses.

### Option A — GitHub Actions runner IPs

The current `cd.yml` implementation assumes the PostgreSQL server is reachable from
GitHub Actions runner IPs (either because no firewall rule is configured, or because an
`Allow public access from any Azure service` rule is in place).

If the server has a restrictive firewall, add a pre/post migration step to `cd.yml`
that temporarily allows the runner's IP:

```yaml
- name: Allow runner IP in PostgreSQL firewall
  run: |
    RUNNER_IP=$(curl -s https://api.ipify.org)
    az postgres flexible-server firewall-rule create \
      --resource-group "${{ vars.AZURE_RESOURCE_GROUP }}" \
      --name psql-nova-circle-dev \
      --rule-name gh-actions-runner \
      --start-ip-address "$RUNNER_IP" \
      --end-ip-address "$RUNNER_IP"

- name: Run database migrations
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: npm run migrate

- name: Remove runner IP from PostgreSQL firewall
  if: always()
  run: |
    az postgres flexible-server firewall-rule delete \
      --resource-group "${{ vars.AZURE_RESOURCE_GROUP }}" \
      --name psql-nova-circle-dev \
      --rule-name gh-actions-runner \
      --yes
```

### Option B — Container App Job (recommended for production)

Create a migration Container App Job that runs `npm run migrate` inside the VNet.
No public firewall exposure needed. This is the preferred approach once private networking
is configured in the Bicep templates.

---

## Rollback

Redeploy a previous image tag by triggering a manual `workflow_dispatch` on the `Infra` workflow,
or by running the deploy script directly:

```bash
export POSTGRES_ADMIN_PASSWORD='...'
export AZURE_TENANT_ID='...'
export AZURE_CLIENT_ID='...'

./infra/scripts/deploy.sh \
  --resource-group rg-nova-circle-dev \
  --environment dev \
  --image "crnovadev1a2b3c.azurecr.io/nova-circle-api:<previous-sha>"
```

Images are retained in ACR by commit SHA, so any previously deployed version can be
re-activated without rebuilding.

---

## First-time bootstrap sequence

Follow this sequence for a brand-new environment:

1. **Create the resource group** (once):
   ```bash
   az group create --name rg-nova-circle-dev --location westeurope
   ```

2. **Initial Bicep deploy** (placeholder image, no CD yet):
   ```bash
   export POSTGRES_ADMIN_PASSWORD='<strong-password>'
   ./infra/scripts/deploy.sh --resource-group rg-nova-circle-dev --environment dev
   ```

3. **Retrieve the ACR login server** and store it as the `AZURE_REGISTRY_LOGIN_SERVER` variable.

4. **Grant the Container App AcrPull** (once, using the `containerAppPrincipalId` output):
   ```bash
   PRINCIPAL_ID=$(az deployment group show \
     -g rg-nova-circle-dev -n main \
     --query "properties.outputs.containerAppPrincipalId.value" -o tsv)
   REGISTRY_ID=$(az acr list -g rg-nova-circle-dev --query "[0].id" -o tsv)
   az role assignment create \
     --assignee-object-id "$PRINCIPAL_ID" \
     --assignee-principal-type ServicePrincipal \
     --role AcrPull \
     --scope "$REGISTRY_ID"
   ```

5. **Configure OIDC** (App Registration + federated credentials + RBAC) as described above.

6. **Set all repository variables and secrets** as listed above.

7. **Create the `production` environment** in GitHub with required reviewers.

8. **Merge any change to `main`** — the CD pipeline will run automatically from this point.

---

## Security notes

- The CD workflow (`.github/workflows/cd.yml`) does not use static cloud credentials; it authenticates to Azure using ephemeral OIDC tokens scoped to `ref:refs/heads/main` and the `production` environment.
- The infra workflow (`.github/workflows/infra.yml`) uses an Azure service principal credential stored as the `AZURE_CREDENTIALS` secret for manual `what-if` operations. Ensure this secret is least-privilege, rotated regularly, and not reused outside this repository.
- `POSTGRES_ADMIN_PASSWORD` and `DATABASE_URL` are stored as encrypted GitHub secrets and never logged.
- The Container App's database URL is assembled and injected by Bicep as a secret — it is not visible in workflow logs.
- Images run as a non-root user (`nova`) inside the backend container.
- `adminUserEnabled: false` on the ACR; pull access uses the Container App's system-assigned managed identity.
- `AZURE_CLIENT_ID` (CD principal) and `API_AZURE_CLIENT_ID` (API audience) are intentionally separate app registrations to prevent audience confusion during JWT validation.
