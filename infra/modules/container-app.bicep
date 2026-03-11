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

@description('Full container image reference, e.g. crnova<env>.azurecr.io/nova-circle:1.0.0')
param containerImage string

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

var appName = 'ca-nova-circle-${environmentName}'

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
    }
    template: {
      containers: [
        {
          name: 'nova-circle-api'
          image: containerImage
          resources: {
            cpu: '0.25'    // 0.25 vCPU (Consumption minimum)
            memory: '0.5Gi' // 0.5 GiB
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
