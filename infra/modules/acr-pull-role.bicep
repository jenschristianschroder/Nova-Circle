// modules/acr-pull-role.bicep
// Assigns the AcrPull role to a principal on a Container Registry.
// Wrapped in a dedicated module because role assignment scope must be set to a
// resource declared in the same file; passing the registry name as a parameter
// (a value known at deployment start) satisfies this requirement cleanly.

@description('Container Registry resource name (not the login server)')
param registryName string

@description('Principal ID to grant AcrPull (e.g. Container App system-assigned identity)')
param principalId string

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull built-in role
)

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, principalId, acrPullRoleDefinitionId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
