# Nova-Circle Infrastructure

Azure Bicep templates that provision the minimum infrastructure to run Nova-Circle in a real environment.

## Resources provisioned

| Resource | SKU / tier | Name pattern |
|---|---|---|
| Log Analytics Workspace | PerGB2018 | `law-nova-circle-<env>` |
| Application Insights | workspace-based | `ai-nova-circle-<env>` |
| Azure Container Apps Environment | Consumption | `cae-nova-circle-<env>` |
| Azure Container App | 0.25 vCPU / 0.5 GiB | `ca-nova-circle-<env>` |
| Azure PostgreSQL Flexible Server | Burstable B1ms | `psql-nova-circle-<env>` |
| Azure Container Registry | Basic | `crnova<env>` |

All resources are deployed into a single resource group. The Container App runs with a system-assigned managed identity. No static secrets or connection strings are baked into images.

## File structure

```
infra/
  main.bicep          # Orchestrates all modules
  main.bicepparam     # Non-secret parameter defaults (dev environment)
  modules/
    app-insights.bicep       # Log Analytics Workspace + Application Insights
    container-registry.bicep # Azure Container Registry
    container-app-env.bicep  # Container Apps Environment
    container-app.bicep      # Container App (API service)
    postgres.bicep           # PostgreSQL Flexible Server + database
  scripts/
    deploy.sh         # Convenience wrapper around az deployment group create
```

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) ≥ 2.60
- Bicep CLI (installed automatically by `az bicep install` or bundled with recent Azure CLI versions)
- An Azure subscription and sufficient permissions to create resources in a resource group

```bash
az login
az bicep install   # or: az bicep upgrade
```

## Deploy

### 1. Create the resource group (once)

```bash
az group create \
  --name rg-nova-circle-dev \
  --location westeurope
```

### 2. Deploy with the convenience script

```bash
export POSTGRES_ADMIN_PASSWORD='<strong-password>'
export AZURE_TENANT_ID='<tenant-id>'   # optional – enables JWT validation
export AZURE_CLIENT_ID='<client-id>'   # optional

./infra/scripts/deploy.sh \
  --resource-group rg-nova-circle-dev \
  --environment dev \
  --image crnova dev.azurecr.io/nova-circle:latest
```

### 3. Preview changes without deploying (what-if)

```bash
export POSTGRES_ADMIN_PASSWORD='<strong-password>'

./infra/scripts/deploy.sh \
  --resource-group rg-nova-circle-dev \
  --what-if
```

### 4. Deploy directly with az CLI

```bash
az deployment group create \
  --resource-group rg-nova-circle-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam \
  --parameters \
    postgresAdminPassword='<strong-password>' \
    containerImage='<registry>/nova-circle:<tag>'
```

## After first deploy

1. **Push your Docker image** to the provisioned registry:
   ```bash
   az acr login --name crnova dev
   docker tag nova-circle:latest crnova dev.azurecr.io/nova-circle:latest
   docker push crnova dev.azurecr.io/nova-circle:latest
   ```

2. **Grant the Container App AcrPull access** to the registry:
   ```bash
   PRINCIPAL_ID=$(az containerapp show \
     --name ca-nova-circle-dev \
     --resource-group rg-nova-circle-dev \
     --query identity.principalId -o tsv)

   REGISTRY_ID=$(az acr show \
     --name crnovadev \
     --resource-group rg-nova-circle-dev \
     --query id -o tsv)

   az role assignment create \
     --assignee-object-id "$PRINCIPAL_ID" \
     --assignee-principal-type ServicePrincipal \
     --role AcrPull \
     --scope "$REGISTRY_ID"
   ```

3. **Run database migrations** (from a machine that can reach the PostgreSQL server or via a migration job in the Container App):
   ```bash
   DATABASE_URL='postgresql://ncadmin:<password>@psql-nova-circle-dev.postgres.database.azure.com:5432/nova_circle?sslmode=require' \
     npm run migrate
   ```

## Telemetry

The Container App receives the Application Insights connection string as a secret and sets `APPLICATIONINSIGHTS_CONNECTION_STRING` in the container environment. The Nova-Circle API initialises the Application Insights SDK on startup when this variable is present and emits:

- HTTP request/response (duration, status code, route)
- Unhandled exceptions and promise rejections  
- Dependency calls (PostgreSQL via `pg`, outbound HTTP)
- Structured trace logs via the `logger` wrapper

When the env var is absent (local dev, tests) the SDK is disabled and the logger falls back to the Node.js console.

## Secrets policy

| Value | How supplied |
|---|---|
| PostgreSQL admin password | `--parameters postgresAdminPassword=` at deploy time |
| App Insights connection string | Injected automatically by Bicep from the App Insights output |
| Database URL | Assembled by Bicep and injected as a Container App secret |

**Never** commit secret values to source control or bake them into Docker images.
