// infra/main.bicepparam
// Non-secret default parameter values for the Nova-Circle dev environment.
//
// postgresAdminPassword is intentionally absent from this file.
// The VS Code Bicep extension re-evaluates .bicepparam on every deploy, so any
// default expression (e.g. readEnvironmentVariable) would overwrite the value
// typed in the deploy form with an empty string before the request reaches ARM.
// Leave postgresAdminPassword out of this file so the extension sends exactly
// what the user types in the "postgresAdminPassword" form field.
//
// For CLI deploys, pass it on the command line:
//   az deployment group create ... --parameters main.bicepparam \
//       postgresAdminPassword='<secret>'
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

// Azure Entra ID — leave empty to start without JWT validation.
param azureTenantId = '7af8f68a-896b-44d5-994a-1c9bf336f8d7'
param azureClientId = 'b96cb392-1afe-4b74-b889-77c78888ec1c'
