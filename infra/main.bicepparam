// infra/main.bicepparam
// Default parameter values for the Nova-Circle dev environment.
//
// postgresAdminPassword is read from the POSTGRES_ADMIN_PASSWORD environment
// variable at Bicep compile time via readEnvironmentVariable().  This satisfies
// the BCP258 requirement that every required parameter be assigned in the params
// file while keeping the secret out of source control.
//
// Before deploying, export the variable in the shell (or system environment)
// that Bicep/az CLI runs in:
//   export POSTGRES_ADMIN_PASSWORD='<secret>'
//   az deployment group create ... --parameters main.bicepparam
//
// The deploy.sh convenience script also reads the same variable.
// CI/CD pipelines (cd.yml / infra.yml) override this value at deploy time via
// an explicit --parameters postgresAdminPassword=... CLI argument, so the
// environment variable is not required in those contexts.
//
// Override any of these at deploy time:
//   az deployment group create ... --parameters main.bicepparam \
//       environmentName=prod containerImage=<acr>/nova-circle:2.0.0

using 'main.bicep'

param location = 'swedencentral'
param environmentName = 'dev'

// Container image to deploy.  On first deploy (before the registry exists)
// use the Azure Container Apps hello-world image as a placeholder.
param containerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Frontend container image to deploy.  On first deploy (before the registry exists)
// use the Azure Container Apps hello-world image as a placeholder.
param frontendContainerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param postgresAdminUser = 'ncadmin'

// Secret read from the POSTGRES_ADMIN_PASSWORD environment variable.
// Never hardcode this value — set the env var before deploying.
// Bicep raises a compile-time error if the variable is absent; ARM additionally
// rejects an empty string thanks to the @minLength(1) constraint in main.bicep.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')

// Azure Entra ID — leave empty to start without JWT validation.
// Supply real values as deploy-time overrides (--parameters) or via cd.yml vars.
param azureTenantId = ''
param azureClientId = ''
