// infra/main.bicep
// Nova-Circle infrastructure orchestrator.
//
// Provisions all shared Azure resources for one environment into a single
// resource group.  Resources are intentionally minimal: one environment,
// no redundancy, no advanced networking until explicitly needed.
//
// Usage (from the infra/ directory):
//   export POSTGRES_ADMIN_PASSWORD='<secret>'
//   az deployment group create \
//     --resource-group rg-nova-circle-dev \
//     --template-file main.bicep \
//     --parameters main.bicepparam
//
//   From VS Code: ensure POSTGRES_ADMIN_PASSWORD is set in the environment
//   that VS Code was launched from (VS Code inherits the launching shell's
//   environment), then open main.bicep → Deploy to Azure.
//   readEnvironmentVariable() will pick up the value automatically.
//
// See infra/scripts/deploy.sh for a convenience wrapper.

targetScope = 'resourceGroup'

// ── Parameters ────────────────────────────────────────────────────────────

@description('Azure region for all resources (e.g. "westeurope")')
param location string = resourceGroup().location

@description('Short environment name appended to resource names (e.g. "dev", "prod")')
@maxLength(8)
param environmentName string = 'dev'

@description('Full container image reference including tag (e.g. crnova<env>.azurecr.io/nova-circle:1.0.0)')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('PostgreSQL administrator username')
param postgresAdminUser string = 'ncadmin'

@description('PostgreSQL administrator password — must be supplied at deploy time, never stored here')
@secure()
@minLength(1)
param postgresAdminPassword string

@description('Azure Tenant ID for Entra token validation (leave empty to disable JWT auth)')
param azureTenantId string = ''

@description('Azure Client ID for Entra token validation (leave empty to disable JWT auth)')
param azureClientId string = ''

@description('Allowed CORS origins for the API (comma-separated, e.g. "https://app.novacircle.com")')
param corsOrigin string = ''

// ── Modules ───────────────────────────────────────────────────────────────

// 1. Observability: Log Analytics Workspace + Application Insights
module appInsightsMod 'modules/app-insights.bicep' = {
  name: 'app-insights'
  params: {
    location: location
    environmentName: environmentName
  }
}

// 2. Container Registry: stores Docker images
module containerRegistryMod 'modules/container-registry.bicep' = {
  name: 'container-registry'
  params: {
    location: location
    environmentName: environmentName
  }
}

// 3. Container Apps Environment: hosts the backend container
module containerAppEnvMod 'modules/container-app-env.bicep' = {
  name: 'container-app-env'
  params: {
    location: location
    environmentName: environmentName
    logAnalyticsWorkspaceId: appInsightsMod.outputs.workspaceId
  }
}

// 4. PostgreSQL Flexible Server + database
module postgresMod 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    environmentName: environmentName
    adminUser: postgresAdminUser
    adminPassword: postgresAdminPassword
  }
}

// 5. Container App: runs the Nova-Circle Node.js/Express API
//    The App Insights connection string from step 1 is injected as a secret.
module containerAppMod 'modules/container-app.bicep' = {
  name: 'container-app'
  params: {
    location: location
    environmentName: environmentName
    containerAppEnvId: containerAppEnvMod.outputs.resourceId
    containerImage: containerImage
    registryLoginServer: containerRegistryMod.outputs.loginServer
    appInsightsConnectionString: appInsightsMod.outputs.connectionString
    databaseUrl: 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${postgresMod.outputs.fqdn}:5432/${postgresMod.outputs.databaseName}?sslmode=require'
    azureTenantId: azureTenantId
    azureClientId: azureClientId
    corsOrigin: corsOrigin
  }
}

// ── AcrPull role assignment ───────────────────────────────────────────────

// Grant the Container App's system-assigned managed identity AcrPull on the ACR.
// Deployed via a dedicated module so the role assignment's `name` and `scope`
// are derived from module parameters (satisfying Bicep BCP120, which forbids
// using module outputs directly in those properties in the parent template).
module acrPullRoleAssignmentMod 'modules/acr-pull-role-assignment.bicep' = {
  name: 'acrPullRoleAssignment'
  params: {
    acrName: containerRegistryMod.outputs.name
    principalId: containerAppMod.outputs.principalId
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────

@description('Container App public URL')
output apiUrl string = 'https://${containerAppMod.outputs.fqdn}'

@description('Container Registry login server')
output registryLoginServer string = containerRegistryMod.outputs.loginServer

@description('PostgreSQL server FQDN')
output postgresFqdn string = postgresMod.outputs.fqdn

@description('Container App system-assigned principal ID')
output containerAppPrincipalId string = containerAppMod.outputs.principalId
