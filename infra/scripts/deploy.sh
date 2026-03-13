#!/usr/bin/env bash
# infra/scripts/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
# Thin wrapper around `az deployment group create` for Nova-Circle.
#
# Usage:
#   ./infra/scripts/deploy.sh \
#     --resource-group rg-nova-circle-dev \
#     [--location swedencentral] \
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
#
# For first-time from-scratch setup use infra/scripts/bootstrap.sh instead,
# which also creates the resource group, app registrations, and GitHub config.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Usage ─────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 --resource-group <name> [OPTIONS]

Options:
  -g, --resource-group <name>    Target resource group (required)
  -l, --location <region>        Azure region (default: swedencentral)
  -e, --environment <name>       Environment suffix (default: dev)
  -i, --image <image>            Container image to deploy
      --what-if                  Preview changes without applying
  -h, --help                     Show this help text

Required environment variables:
  POSTGRES_ADMIN_PASSWORD        PostgreSQL administrator password

Optional environment variables:
  AZURE_TENANT_ID                Entra tenant ID (enables JWT validation)
  AZURE_CLIENT_ID                Entra client ID / API audience
  CORS_ORIGIN                    Allowed CORS origins (comma-separated)

For first-time bootstrap (creates app registrations and GitHub config too),
use infra/scripts/bootstrap.sh instead.
EOF
}

# ── Defaults ─────────────────────────────────────────────────────────────
RESOURCE_GROUP=""
LOCATION="swedencentral"
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
    --help|-h)            usage; exit 0 ;;
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

# ── Collect optional Bicep parameters ───────────────────────────────────
OPTIONAL_PARAMS=()
[[ -n "${AZURE_TENANT_ID:-}"  ]] && OPTIONAL_PARAMS+=(azureTenantId="${AZURE_TENANT_ID}")
[[ -n "${AZURE_CLIENT_ID:-}"  ]] && OPTIONAL_PARAMS+=(azureClientId="${AZURE_CLIENT_ID}")
[[ -n "${CORS_ORIGIN:-}"      ]] && OPTIONAL_PARAMS+=(corsOrigin="${CORS_ORIGIN}")

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
    "${OPTIONAL_PARAMS[@]+"${OPTIONAL_PARAMS[@]}"}" \
  ${WHAT_IF} \
  --output none

if [[ -z "${WHAT_IF}" ]]; then
  echo ""
  echo "==> Deployment outputs:"
  az deployment group show \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query "{apiUrl:properties.outputs.apiUrl.value,registryLoginServer:properties.outputs.registryLoginServer.value,postgresFqdn:properties.outputs.postgresFqdn.value}" \
    --output table
fi

echo "==> Done."
