// infra/main.bicepparam
// Non-secret default parameter values for the Nova-Circle dev environment.
//
// Secrets (postgresAdminPassword) MUST be supplied on the command line or via
// a secure pipeline variable — never committed to source control.
//
// Override any of these at deploy time:
//   az deployment group create ... --parameters main.bicepparam \
//       --parameters environmentName=prod containerImage=<acr>/nova-circle:2.0.0

using 'main.bicep'

param location = 'westeurope'
param environmentName = 'dev'

// Container image to deploy.  On first deploy (before the registry exists)
// use the Azure Container Apps hello-world image as a placeholder.
param containerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param postgresAdminUser = 'ncadmin'

// Secrets — supply at deploy time, e.g.:
//   --parameters postgresAdminPassword=$POSTGRES_ADMIN_PASSWORD
// param postgresAdminPassword = ''  // DO NOT set here

// Azure Entra ID — leave empty to start without JWT validation.
param azureTenantId = ''
param azureClientId = ''
