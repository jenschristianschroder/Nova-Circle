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
#     [--frontend-image <registry>/nova-circle-client:<tag>] \
#     [--what-if] \
#     [--complete]    # ⚠ Complete mode: deletes resources not in template
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
#   CONFIRM_COMPLETE=yes     – Skip the interactive prompt for --complete mode
#                              (required when running in non-interactive CI)
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
  -i, --image <image>            API container image to deploy
      --frontend-image <image>   Frontend container image to deploy
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
FRONTEND_IMAGE="mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
WHAT_IF=""
DEPLOY_MODE="Incremental"

# ── Argument parsing ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)  RESOURCE_GROUP="$2"; shift 2 ;;
    --location|-l)        LOCATION="$2";        shift 2 ;;
    --environment|-e)     ENVIRONMENT="$2";     shift 2 ;;
    --image|-i)           CONTAINER_IMAGE="$2"; shift 2 ;;
    --frontend-image)     FRONTEND_IMAGE="$2";  shift 2 ;;
    --what-if)            WHAT_IF="--what-if";  shift   ;;
    --help|-h)            usage; exit 0 ;;
    --complete)           DEPLOY_MODE="Complete"; shift   ;;
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

# ── Safety check for Complete mode ────────────────────────────────────────
if [[ "${DEPLOY_MODE}" == "Complete" && -z "${WHAT_IF}" ]]; then
  echo "⚠  WARNING: Complete mode will DELETE all resources in '${RESOURCE_GROUP}'"
  echo "   that are not defined in the Bicep template."
  if [[ "${CONFIRM_COMPLETE:-}" == "yes" ]]; then
    echo "   Confirmation accepted via CONFIRM_COMPLETE=yes."
  elif [[ ! -t 0 ]]; then
    echo "ERROR: Complete mode requires explicit confirmation. Set CONFIRM_COMPLETE=yes" >&2
    echo "       to confirm in non-interactive (CI) environments." >&2
    exit 1
  else
    read -r -p "   Are you sure? (yes/no): " confirm
    if [[ "${confirm}" != "yes" ]]; then
      echo "Aborted."
      exit 0
    fi
  fi
fi

# ── Ensure resource group exists ─────────────────────────────────────────
echo "==> Ensuring resource group '${RESOURCE_GROUP}' exists in '${LOCATION}'..."
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output none

# ── Collect Bicep parameters ─────────────────────────────────────────────
# Build required params first.  Optional vars are appended only when set so
# `az deployment group create --parameters` never receives an empty-string
# argument (which would cause a parse error).
PARAMS=(
  "${INFRA_DIR}/main.bicepparam"
  location="${LOCATION}"
  environmentName="${ENVIRONMENT}"
  containerImage="${CONTAINER_IMAGE}"
  frontendContainerImage="${FRONTEND_IMAGE}"
  postgresAdminPassword="${POSTGRES_ADMIN_PASSWORD}"
)
[[ -n "${AZURE_TENANT_ID:-}"  ]] && PARAMS+=(azureTenantId="${AZURE_TENANT_ID}")
[[ -n "${AZURE_CLIENT_ID:-}"  ]] && PARAMS+=(azureClientId="${AZURE_CLIENT_ID}")
[[ -n "${CORS_ORIGIN:-}"      ]] && PARAMS+=(corsOrigin="${CORS_ORIGIN}")

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
  --parameters "${PARAMS[@]}" \
  --mode "${DEPLOY_MODE}" \
  ${WHAT_IF} \
  --output none

if [[ -z "${WHAT_IF}" ]]; then
  echo ""
  echo "==> Deployment outputs:"
  az deployment group show \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query "{apiUrl:properties.outputs.apiUrl.value,clientUrl:properties.outputs.clientUrl.value,registryLoginServer:properties.outputs.registryLoginServer.value,postgresFqdn:properties.outputs.postgresFqdn.value}" \
    --output table
fi

echo "==> Done."
