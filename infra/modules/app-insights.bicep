// modules/app-insights.bicep
// Provisions a Log Analytics Workspace (backing store) and a workspace-based
// Application Insights instance shared by all Nova-Circle modules.

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

var workspaceName = 'law-nova-circle-${environmentName}'
var appInsightsName = 'ai-nova-circle-${environmentName}'

// ── Log Analytics Workspace ────────────────────────────────────────────────
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── Application Insights (workspace-based) ────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
@description('Application Insights connection string (use as a Container App secret)')
output connectionString string = appInsights.properties.ConnectionString

@description('Application Insights instrumentation key')
output instrumentationKey string = appInsights.properties.InstrumentationKey

@description('Log Analytics Workspace resource ID')
output workspaceId string = logAnalyticsWorkspace.id
