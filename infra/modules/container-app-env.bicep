// modules/container-app-env.bicep
// Provisions an Azure Container Apps Environment (Consumption tier).

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

@description('Log Analytics Workspace resource ID (used for environment diagnostics)')
param logAnalyticsWorkspaceId string

var envName = 'cae-nova-circle-${environmentName}'

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2022-10-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2022-10-01').primarySharedKey
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
@description('Container Apps Environment resource ID')
output resourceId string = containerAppEnv.id
