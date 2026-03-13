// modules/acr-pull-role-assignment.bicep
// Grants AcrPull on an Azure Container Registry to a managed identity principal.
//
// Deployed as a separate module so that the role assignment's `name` and `scope`
// are derived from module *parameters* (known at module-deployment start), which
// satisfies the BCP120 constraint that prevents module *outputs* from being used
// directly in those properties in the parent template.

@description('Name of the existing Azure Container Registry resource')
param acrName string

@description('Principal ID of the managed identity to grant AcrPull to')
param principalId string

// AcrPull built-in role definition ID (constant across all Azure tenants).
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acrResource 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// Deterministic guid so re-deployments are idempotent.
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrName, principalId, acrPullRoleDefinitionId)
  scope: acrResource
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
