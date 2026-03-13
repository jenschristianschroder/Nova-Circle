// modules/container-app.bicep
// Provisions the Azure Container App that runs the Nova-Circle Node.js/Express API.
// System-assigned managed identity is enabled; secrets (DB password, App Insights
// connection string) are injected at deploy time — never hardcoded.

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

@description('Container Apps Environment resource ID')
param containerAppEnvId string

@description('Full container image reference, e.g. crnova<env><suffix>.azurecr.io/nova-circle:1.0.0')
param containerImage string

@description('Container Registry login server for managed-identity pull (e.g. crnovadev<suffix>.azurecr.io)')
param registryLoginServer string

@description('Application Insights connection string (passed in as a secret)')
@secure()
param appInsightsConnectionString string

@description('PostgreSQL connection string (passed in as a secret)')
@secure()
param databaseUrl string

@description('Azure Tenant ID for Entra token validation')
param azureTenantId string = ''

@description('Azure Client ID (app registration audience) for Entra token validation')
param azureClientId string = ''

@description('Allowed CORS origins (comma-separated). Set to the frontend URL in production.')
param corsOrigin string = ''

var appName = 'ca-nova-circle-${environmentName}'

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
    // System-assigned managed identity: allows pulling from ACR and future
    // Key Vault / storage access without static credentials.
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: containerAppEnvId
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      secrets: [
        {
          name: 'appinsights-connection-string'
          value: appInsightsConnectionString
        }
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
      // Pull images from the provisioned ACR using the system-assigned managed identity.
      // Only configure this when the deployed image actually comes from the ACR.
      // For the placeholder bootstrap image (pulled from MCR, which is public) no
      // registry credential is needed and including the entry would cause ARM to
      // validate ACR access before the AcrPull role assignment is in place,
      // which blocks Container App provisioning.
      registries: useAcr ? [
        {
          server: registryLoginServer
          identity: 'system'
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'nova-circle-api'
          image: containerImage
          resources: {
            cpu: json('0.25') // 0.25 vCPU (Consumption minimum)
            memory: '0.5Gi'  // 0.5 GiB
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'AZURE_TENANT_ID'
              value: azureTenantId
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: azureClientId
            }
            {
              name: 'LOG_LEVEL'
              value: 'info'
            }
            {
              name: 'CORS_ORIGIN'
              value: corsOrigin
            }
            {
              name: 'TRUST_PROXY'
              value: '1'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
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
