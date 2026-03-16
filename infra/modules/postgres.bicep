// modules/postgres.bicep
// Provisions an Azure PostgreSQL Flexible Server (Burstable B1ms).
// Managed identity authentication is preferred in production; the admin
// password passed here is a break-glass credential only.

@description('Deployment location (inherited from main.bicep)')
param location string

@description('Short environment name used as a resource-name suffix (e.g. "dev")')
param environmentName string

@description('PostgreSQL administrator username')
param adminUser string

@description('PostgreSQL administrator password (injected as a secret at deploy time)')
@secure()
param adminPassword string

var serverName = 'psql-nova-circle-${environmentName}'
var databaseName = 'nova_circle'

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  name: databaseName
  parent: postgresServer
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
@description('PostgreSQL server FQDN')
output fqdn string = postgresServer.properties.fullyQualifiedDomainName

@description('Database name')
output databaseName string = database.name

@description('PostgreSQL server resource ID')
output resourceId string = postgresServer.id
