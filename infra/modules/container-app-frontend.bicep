// modules/container-app-frontend.bicep
// Provisions the Azure Container App that serves the Nova-Circle React SPA.
// The image is a multi-stage nginx build (port 80) that serves pre-built
// static assets and handles client-side routing via a SPA fallback.
// System-assigned managed identity is enabled for ACR image pull.

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

@description('Container Apps Environment resource ID')
param containerAppEnvId string

@description('Full container image reference, e.g. crnova<env><suffix>.azurecr.io/nova-circle-client:1.0.0')
param containerImage string

@description('Container Registry login server for managed-identity pull (e.g. crnovadev<suffix>.azurecr.io)')
param registryLoginServer string

@description('Azure Client ID injected into the SPA at runtime for MSAL authentication')
param azureClientId string = ''

@description('Azure Tenant ID injected into the SPA at runtime for MSAL authentication')
param azureTenantId string = ''

var appName = 'ca-nova-circle-client-${environmentName}'

// Only configure ACR pull when the image is actually from the provisioned registry.
// On first deploy the placeholder MCR image is used and the system-assigned identity
// has no AcrPull role yet, so referencing the ACR would cause "Operation expired".
// Use startsWith with a trailing '/' to prevent a false match if the login server
// appears elsewhere in the image string (e.g. as part of a different hostname).
var useAcr = startsWith(toLower(containerImage), '${toLower(registryLoginServer)}/')

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    // System-assigned managed identity: allows pulling from ACR without static credentials.
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppEnvId
    configuration: {
      // Multiple-revision mode is required for blue/green deployments: new
      // revisions are created with 0 % traffic weight and traffic is shifted
      // only after E2E tests pass.  The CD pipeline manages traffic weights
      // explicitly; this setting must not be changed to 'Single'.
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      // Pull images from the provisioned ACR using the system-assigned managed identity.
      // Only configure this when the deployed image actually comes from the ACR.
      // For the placeholder bootstrap image (pulled from MCR, which is public) no
      // registry credential is needed and including the entry would cause ARM to
      // validate ACR access before the AcrPull role assignment is in place,
      // which blocks Container App provisioning.
      registries: useAcr
        ? [
            {
              server: registryLoginServer
              identity: 'system'
            }
          ]
        : []
    }
    template: {
      containers: [
        {
          name: 'nova-circle-client'
          image: containerImage
          resources: {
            cpu: json('0.25') // 0.25 vCPU (Consumption minimum)
            memory: '0.5Gi'  // 0.5 GiB
          }
          // Inject Azure credentials so entrypoint.sh can write env-config.js
          // at container startup. These are public OAuth identifiers (not
          // secrets) so Key Vault indirection is not required.
          env: [
            {
              name: 'VITE_AZURE_CLIENT_ID'
              value: azureClientId
            }
            {
              name: 'VITE_AZURE_TENANT_ID'
              value: azureTenantId
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0 // Scale to zero when idle (Consumption tier cost control).
        maxReplicas: 3
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
@description('Container App FQDN (public URL)')
output fqdn string = containerApp.properties.configuration.ingress!.fqdn

@description('System-assigned managed identity principal ID (use to assign ACR Pull role)')
output principalId string = containerApp.identity.principalId
