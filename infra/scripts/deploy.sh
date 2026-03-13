#!/usr/bin/env bash
# infra/scripts/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
# Thin wrapper around `az deployment group create` for Nova-Circle.
#
# Usage:
#   ./infra/scripts/deploy.sh \
#     --resource-group rg-nova-circle-dev \
#     [--location westeurope] \
#     [--environment dev] \
#     [--image <registry>/nova-circle:<tag>] \
#     [--what-if]
#
# Required environment variables (supply via shell or CI pipeline secrets):
#   POSTGRES_ADMIN_PASSWORD  – PostgreSQL administrator password
#
# Optional environment variables:
#   AZURE_TENANT_ID          – Entra tenant ID (enables JWT validation)
#   AZURE_CLIENT_ID          – Entra client ID / audience
#   CORS_ORIGIN              – Allowed CORS origins (comma-separated)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ─────────────────────────────────────────────────────────────
RESOURCE_GROUP=""
LOCATION="westeurope"
ENVIRONMENT="dev"
CONTAINER_IMAGE="mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
WHAT_IF=""

# ── Argument parsing ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)  RESOURCE_GROUP="$2"; shift 2 ;;
    --location|-l)        LOCATION="$2";        shift 2 ;;
    --environment|-e)     ENVIRONMENT="$2";     shift 2 ;;
    --image|-i)           CONTAINER_IMAGE="$2"; shift 2 ;;
    --what-if)            WHAT_IF="--what-if";  shift   ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${RESOURCE_GROUP}" ]]; then
  echo "ERROR: --resource-group is required." >&2
  exit 1
fi

if [[ -z "${POSTGRES_ADMIN_PASSWORD:-}" ]]; then
  echo "ERROR: POSTGRES_ADMIN_PASSWORD environment variable must be set." >&2
  exit 1
fi

# Deployment name is stable per environment so re-running is idempotent.
DEPLOYMENT_NAME="nova-circle-${ENVIRONMENT}"

# ── Ensure resource group exists ─────────────────────────────────────────
echo "==> Ensuring resource group '${RESOURCE_GROUP}' exists in '${LOCATION}'..."
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output none

# ── Run deployment ───────────────────────────────────────────────────────
echo "==> Running Bicep deployment (${WHAT_IF:-apply}) ..."
if [[ -z "${WHAT_IF}" ]]; then
  echo "    Note: if PostgreSQL Flexible Server is being provisioned for the first time,"
  echo "    the deployment can take 15–20 minutes. The spinner below is normal."
fi
az deployment group create \
  --name "${DEPLOYMENT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${INFRA_DIR}/main.bicep" \
  --parameters "${INFRA_DIR}/main.bicepparam" \
  --parameters \
    location="${LOCATION}" \
    environmentName="${ENVIRONMENT}" \
    containerImage="${CONTAINER_IMAGE}" \
    postgresAdminPassword="${POSTGRES_ADMIN_PASSWORD}" \
    azureTenantId="${AZURE_TENANT_ID:-}" \
    azureClientId="${AZURE_CLIENT_ID:-}" \
    corsOrigin="${CORS_ORIGIN:-}" \
  ${WHAT_IF} \
  --output table

echo "==> Done."
