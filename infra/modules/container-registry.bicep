// modules/container-registry.bicep
// Provisions an Azure Container Registry (Basic SKU) for storing Docker images.

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

// ACR names must be globally unique, 5–50 alphanumeric characters, no hyphens.
var registryName = 'crnova${environmentName}'

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false // Use managed identity for pull access; no static admin creds.
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
@description('Container Registry login server (e.g. crnova<env>.azurecr.io)')
output loginServer string = containerRegistry.properties.loginServer

@description('Container Registry resource ID')
output resourceId string = containerRegistry.id
