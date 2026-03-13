// infra/main.bicepparam
// Default parameter values for the Nova-Circle dev environment.
//
// postgresAdminPassword is read from the POSTGRES_ADMIN_PASSWORD environment
// variable at Bicep compile time via readEnvironmentVariable().  This satisfies
// the BCP258 requirement that every required parameter be assigned in the params
// file while keeping the secret out of source control.
//
// Before deploying, export the variable in your shell:
//   export POSTGRES_ADMIN_PASSWORD='<secret>'
//   az deployment group create ... --parameters main.bicepparam
//
// The deploy.sh convenience script also reads the same variable.
// CI/CD pipelines inject it as a secret environment variable via cd.yml.
//
// Override any of these at deploy time:
//   az deployment group create ... --parameters main.bicepparam \
//       environmentName=prod containerImage=<acr>/nova-circle:2.0.0

using 'main.bicep'

param location = 'westeurope'
param environmentName = 'dev'

// Container image to deploy.  On first deploy (before the registry exists)
// use the Azure Container Apps hello-world image as a placeholder.
param containerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param postgresAdminUser = 'ncadmin'

// Secret injected from the POSTGRES_ADMIN_PASSWORD environment variable.
// Never hardcode this value — set the env var before deploying.
// Deployment fails at compile time if POSTGRES_ADMIN_PASSWORD is not set.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')

// Azure Entra ID — leave empty to start without JWT validation.
param azureTenantId = '7af8f68a-896b-44d5-994a-1c9bf336f8d7'
param azureClientId = 'b96cb392-1afe-4b74-b889-77c78888ec1c'
