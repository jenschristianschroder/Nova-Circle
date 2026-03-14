#!/usr/bin/env bash
# infra/scripts/bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────
# Idempotent bootstrap for Nova-Circle.
#
# Sets up everything needed to deploy Nova-Circle from scratch into a new Azure
# subscription, including:
#   • Azure resource group
#   • Bicep infrastructure (all Azure resources)
#   • CD service principal with OIDC federated credentials (no static secrets)
#   • API app registration for JWT validation
#   • AcrPush role for the CD service principal on the Container Registry
#   • Initial database migrations
#   • GitHub repository variables, secrets, and environments
#
# Safe to re-run: all operations are idempotent.
#
# Usage:
#   ./infra/scripts/bootstrap.sh [OPTIONS]
#
# Options:
#   -s, --subscription  <id|name>  Azure subscription (default: current active)
#   -g, --resource-group <name>    Resource group name (default: rg-nova-circle-<env>)
#   -l, --location <region>        Azure region (default: swedencentral)
#   -e, --environment <name>       Environment suffix: dev|staging|prod (default: dev)
#   -r, --github-repo <owner/repo> GitHub repository slug (default: from git remote)
#       --cors-origin <origins>    Comma-separated allowed CORS origins (default: "")
#       --skip-github              Skip GitHub variable/secret configuration
#       --skip-infra               Skip Bicep infrastructure deployment
#       --skip-migrations          Skip initial database migrations
#       --what-if                  Preview Bicep changes without applying (no other changes)
#   -h, --help                     Show this help text
#
# Environment variables (alternative to interactive prompts):
#   POSTGRES_ADMIN_PASSWORD  PostgreSQL administrator password
#   CORS_ORIGIN              Comma-separated allowed CORS origins
#
# Required Azure permissions on the target subscription or resource group:
#   • Contributor
#   • User Access Administrator
#     (needed so Bicep can create the AcrPull role assignment inside the
#      acr-pull-role-assignment.bicep module during deployment)
#   • Application Administrator or Global Administrator in Entra ID
#     (to create App Registrations and Service Principals)
#
# Manual steps that cannot be automated — see docs/cd.md for details:
#   1. az login          — browser-based Azure authentication
#   2. gh auth login     — browser-based GitHub authentication
#   3. Add required reviewers to the 'production' environment in GitHub UI
#   4. Configure OAuth2 scopes / redirect URIs on the API app registration
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"

# ── Colour helpers ─────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

info() { echo -e "${GREEN}==>${RESET} ${BOLD}$*${RESET}"; }
step() { echo -e "  ${CYAN}•${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN:${RESET} $*" >&2; }
die()  { echo -e "${RED}ERROR:${RESET} $*" >&2; exit 1; }

# ── Usage ──────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${BOLD}Nova-Circle Bootstrap${RESET}

Idempotent script that sets up Azure infrastructure, OIDC authentication,
API app registration, database migrations, and GitHub configuration from
scratch.  Safe to re-run at any time.

${BOLD}Usage:${RESET}
  $0 [OPTIONS]

${BOLD}Options:${RESET}
  -s, --subscription  <id|name>  Azure subscription (default: current active)
  -g, --resource-group <name>    Resource group (default: rg-nova-circle-<env>)
  -l, --location <region>        Azure region (default: swedencentral)
  -e, --environment <name>       Environment suffix: dev|staging|prod (default: dev)
  -r, --github-repo <owner/repo> GitHub repository slug (default: from git remote)
      --cors-origin <origins>    Comma-separated allowed CORS origins (default: "")
      --skip-github              Skip GitHub variable/secret configuration
      --skip-infra               Skip Bicep infrastructure deployment
      --skip-migrations          Skip initial database migrations
      --what-if                  Preview Bicep changes only — no resources created
  -h, --help                     Show this help text

${BOLD}Environment variables:${RESET}
  POSTGRES_ADMIN_PASSWORD  PostgreSQL administrator password (avoids prompt)
  CORS_ORIGIN              Allowed CORS origins (comma-separated)

${BOLD}Required Azure permissions:${RESET}
  Contributor + User Access Administrator on the target resource group.
  Application Administrator (or Global Administrator) in Entra ID.

${BOLD}Pre-requisites:${RESET}
  az login          # authenticate to Azure
  gh auth login     # authenticate to GitHub (skip with --skip-github)

${BOLD}Examples:${RESET}
  # Interactive first-time setup (prompts for all missing values):
  $0

  # Non-interactive with explicit values:
  POSTGRES_ADMIN_PASSWORD='<secret>' \\
  $0 --subscription "My Sub" \\
     --resource-group rg-nova-circle-dev \\
     --location swedencentral \\
     --environment dev \\
     --github-repo owner/Nova-Circle

  # Preview what Bicep would change (no GitHub setup, no migrations):
  POSTGRES_ADMIN_PASSWORD='<secret>' \\
  $0 --what-if --skip-github --skip-migrations

  # Re-run GitHub configuration only (infra already deployed):
  $0 --skip-infra --skip-migrations
EOF
}

# ── Argument parsing ───────────────────────────────────────────────────────────
SUBSCRIPTION=""
RESOURCE_GROUP=""
LOCATION="swedencentral"
ENVIRONMENT="dev"
GITHUB_REPO=""
CORS_ORIGIN="${CORS_ORIGIN:-}"
SKIP_GITHUB=false
SKIP_INFRA=false
SKIP_MIGRATIONS=false
WHAT_IF=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--subscription)   SUBSCRIPTION="$2";    shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2";  shift 2 ;;
    -l|--location)       LOCATION="$2";        shift 2 ;;
    -e|--environment)    ENVIRONMENT="$2";     shift 2 ;;
    -r|--github-repo)    GITHUB_REPO="$2";     shift 2 ;;
    --cors-origin)       CORS_ORIGIN="$2";     shift 2 ;;
    --skip-github)       SKIP_GITHUB=true;     shift   ;;
    --skip-infra)        SKIP_INFRA=true;      shift   ;;
    --skip-migrations)   SKIP_MIGRATIONS=true; shift   ;;
    --what-if)           WHAT_IF=true;         shift   ;;
    -h|--help)           usage; exit 0 ;;
    *) die "Unknown argument: $1. Use --help for usage." ;;
  esac
done

# ── Global state (populated during execution) ──────────────────────────────────
SUBSCRIPTION_ID=""
TENANT_ID=""
CD_APP_ID=""
CD_APP_OBJECT_ID=""
CD_SP_ID=""
API_APP_ID=""
REGISTRY_LOGIN_SERVER=""
DATABASE_URL=""

# Firewall cleanup state
PG_FIREWALL_ADDED=false
PG_SERVER_NAME=""

# ── Cleanup trap ───────────────────────────────────────────────────────────────
# Removes the temporary PostgreSQL firewall rule if the script exits unexpectedly
# while the rule is still in place.
cleanup() {
  if [[ "${PG_FIREWALL_ADDED}" == "true" ]] \
     && [[ -n "${RESOURCE_GROUP:-}" ]] \
     && [[ -n "${PG_SERVER_NAME:-}" ]]; then
    echo "" >&2
    warn "Removing PostgreSQL firewall rule (bootstrap-runner) after unexpected exit..."
    az postgres flexible-server firewall-rule delete \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${PG_SERVER_NAME}" \
      --rule-name "bootstrap-runner" \
      --yes --output none 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Helper: prompt for a value if variable is empty ───────────────────────────
# Usage: prompt_if_empty VAR_NAME "prompt text" [default_value]
prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local default_val="${3:-}"
  local current_val="${!var_name}"

  [[ -n "${current_val}" ]] && return

  if [[ ! -t 0 ]]; then
    if [[ -n "${default_val}" ]]; then
      printf -v "${var_name}" '%s' "${default_val}"
    else
      die "Non-interactive mode: ${var_name} is required but not set."
    fi
    return
  fi

  local display_default=""
  [[ -n "${default_val}" ]] && display_default=" [${default_val}]"

  local input_val
  read -r -p "  ${prompt_text}${display_default}: " input_val

  if [[ -z "${input_val}" && -n "${default_val}" ]]; then
    printf -v "${var_name}" '%s' "${default_val}"
  elif [[ -n "${input_val}" ]]; then
    printf -v "${var_name}" '%s' "${input_val}"
  else
    die "${var_name} is required."
  fi
}

# ── Helper: prompt for a secret (no echo) ─────────────────────────────────────
# Usage: prompt_secret VAR_NAME "prompt text"
prompt_secret() {
  local var_name="$1"
  local prompt_text="$2"
  local current_val="${!var_name}"

  [[ -n "${current_val}" ]] && return

  if [[ ! -t 0 ]]; then
    die "Non-interactive mode: ${var_name} is required but not set."
  fi

  local val1 val2
  while true; do
    read -r -s -p "  ${prompt_text}: " val1
    echo ""
    read -r -s -p "  Confirm ${prompt_text}: " val2
    echo ""
    if [[ "${val1}" == "${val2}" ]]; then
      [[ -z "${val1}" ]] && die "${var_name} cannot be empty."
      printf -v "${var_name}" '%s' "${val1}"
      break
    else
      echo "  Values do not match. Try again."
    fi
  done
}

# ── Helper: ensure a federated credential exists (idempotent) ─────────────────
ensure_federated_credential() {
  local app_object_id="$1"
  local cred_name="$2"
  local subject="$3"

  local existing
  existing=$(az ad app federated-credential list \
    --id "${app_object_id}" \
    --query "[?name=='${cred_name}'].name" -o tsv 2>/dev/null || echo "")

  if [[ -z "${existing}" ]]; then
    az ad app federated-credential create \
      --id "${app_object_id}" \
      --parameters "{
        \"name\": \"${cred_name}\",
        \"issuer\": \"https://token.actions.githubusercontent.com\",
        \"subject\": \"${subject}\",
        \"audiences\": [\"api://AzureADTokenExchange\"]
      }" --output none
    step "Created federated credential: ${cred_name}"
  else
    step "Federated credential already exists: ${cred_name}"
  fi
}

# ── Helper: ensure a role assignment exists (idempotent) ──────────────────────
ensure_role_assignment() {
  local principal_id="$1"
  local role="$2"
  local scope="$3"

  local existing
  existing=$(az role assignment list \
    --assignee "${principal_id}" \
    --role "${role}" \
    --scope "${scope}" \
    --subscription "${SUBSCRIPTION_ID}" \
    --query "[0].id" -o tsv 2>/dev/null || echo "")

  if [[ -z "${existing}" || "${existing}" == "None" ]]; then
    az role assignment create \
      --assignee-object-id "${principal_id}" \
      --assignee-principal-type ServicePrincipal \
      --role "${role}" \
      --scope "${scope}" \
      --subscription "${SUBSCRIPTION_ID}" \
      --output none
    step "Assigned role: ${role}"
  else
    step "Role already assigned: ${role}"
  fi
}

# ── Step 1: Prerequisites check ────────────────────────────────────────────────
check_prerequisites() {
  info "Checking prerequisites..."

  command -v az >/dev/null 2>&1 \
    || die "Azure CLI (az) is not installed. See https://docs.microsoft.com/cli/azure/install-azure-cli"
  step "az CLI: $(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo 'ok')"

  az account show >/dev/null 2>&1 \
    || die "Not authenticated to Azure. Run: az login"
  step "Azure login: OK ($(az account show --query 'user.name' -o tsv 2>/dev/null))"

  if [[ "${SKIP_GITHUB}" == "false" ]]; then
    command -v gh >/dev/null 2>&1 \
      || die "GitHub CLI (gh) is not installed. See https://cli.github.com. Use --skip-github to skip."
    step "gh CLI: $(gh --version 2>/dev/null | head -1 | awk '{print $3}')"

    gh auth status >/dev/null 2>&1 \
      || die "Not authenticated to GitHub. Run: gh auth login"
    step "GitHub login: OK"
  fi

  if [[ "${SKIP_MIGRATIONS}" == "false" && "${WHAT_IF}" == "false" ]]; then
    command -v npm >/dev/null 2>&1 \
      || die "npm is not installed. Use --skip-migrations to skip."
    step "npm: $(npm --version)"
  fi
}

# ── Step 2: Collect parameters ─────────────────────────────────────────────────
collect_parameters() {
  info "Collecting parameters..."

  # Select subscription if specified
  if [[ -n "${SUBSCRIPTION}" ]]; then
    az account set --subscription "${SUBSCRIPTION}" >/dev/null
    step "Set subscription: ${SUBSCRIPTION}"
  fi

  SUBSCRIPTION_ID=$(az account show --query id -o tsv)
  TENANT_ID=$(az account show --query tenantId -o tsv)
  local sub_name
  sub_name=$(az account show --query name -o tsv)
  step "Subscription: ${sub_name} (${SUBSCRIPTION_ID})"
  step "Tenant ID:    ${TENANT_ID}"

  # Detect GitHub repo from git remote if not supplied
  if [[ -z "${GITHUB_REPO}" ]]; then
    local detected
    detected=$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null \
      | sed -E 's|.*github\.com[:/]([^/]+/[^/]+?)(\.git)?$|\1|' || echo "")
    [[ -n "${detected}" ]] && GITHUB_REPO="${detected}"
  fi

  local default_rg="rg-nova-circle-${ENVIRONMENT}"
  prompt_if_empty RESOURCE_GROUP "Resource group name"    "${default_rg}"
  prompt_if_empty LOCATION       "Azure location"         "${LOCATION}"
  prompt_if_empty ENVIRONMENT    "Environment name"       "${ENVIRONMENT}"

  if [[ "${SKIP_GITHUB}" == "false" ]]; then
    prompt_if_empty GITHUB_REPO "GitHub repository (owner/repo)" "${GITHUB_REPO}"
  fi

  if [[ "${WHAT_IF}" == "false" ]] \
     && { [[ "${SKIP_INFRA}" == "false" ]] || [[ "${SKIP_MIGRATIONS}" == "false" ]]; }; then
    prompt_secret POSTGRES_ADMIN_PASSWORD "PostgreSQL admin password"
  fi

  echo ""
  echo -e "  ${BOLD}Deployment summary:${RESET}"
  echo    "    Subscription:   ${sub_name} (${SUBSCRIPTION_ID})"
  echo    "    Resource group: ${RESOURCE_GROUP}"
  echo    "    Location:       ${LOCATION}"
  echo    "    Environment:    ${ENVIRONMENT}"
  [[ "${SKIP_GITHUB}" == "false" ]] && echo "    GitHub repo:    ${GITHUB_REPO}"
  [[ "${WHAT_IF}" == "true" ]]      && echo    "    Mode:           what-if (preview only)"
  echo ""

  if [[ -t 0 ]] && [[ "${WHAT_IF}" == "false" ]]; then
    local confirm
    read -r -p "  Proceed? [y/N]: " confirm
    [[ "${confirm,,}" == "y" || "${confirm,,}" == "yes" ]] \
      || { echo "Aborted."; exit 0; }
  fi
}

# ── Step 3: Ensure resource group ──────────────────────────────────────────────
ensure_resource_group() {
  info "Ensuring resource group '${RESOURCE_GROUP}' exists..."
  az group create \
    --name "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --output none
  step "Resource group: ${RESOURCE_GROUP} (${LOCATION})"
}

# ── Step 4: Set up CD App Registration (OIDC service principal) ────────────────
# Creates a service principal used by GitHub Actions to authenticate to Azure.
# Uses OIDC federated credentials — no stored passwords or client secrets.
#
# Deviation from System-Assigned Managed Identity:
#   GitHub Actions runners run outside Azure, so a SAMI cannot be issued to them.
#   OIDC federated credentials are the secure alternative: Azure issues short-lived
#   tokens per workflow run with no long-lived secrets stored anywhere.
setup_oidc_app() {
  info "Setting up CD service principal (OIDC)..."

  local app_display_name="nova-circle-cd-${ENVIRONMENT}"
  local rg_scope="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"

  # Find or create the App Registration
  CD_APP_ID=$(az ad app list \
    --filter "displayName eq '${app_display_name}'" \
    --query "[0].appId" -o tsv 2>/dev/null || echo "")
  if [[ -z "${CD_APP_ID}" || "${CD_APP_ID}" == "None" ]]; then
    step "Creating app registration: ${app_display_name}"
    CD_APP_ID=$(az ad app create \
      --display-name "${app_display_name}" \
      --query appId -o tsv)
  else
    step "Found existing app registration: ${app_display_name} (${CD_APP_ID})"
  fi

  CD_APP_OBJECT_ID=$(az ad app show --id "${CD_APP_ID}" --query id -o tsv)

  # Find or create the Service Principal
  CD_SP_ID=$(az ad sp list \
    --filter "appId eq '${CD_APP_ID}'" \
    --query "[0].id" -o tsv 2>/dev/null || echo "")
  if [[ -z "${CD_SP_ID}" || "${CD_SP_ID}" == "None" ]]; then
    step "Creating service principal..."
    CD_SP_ID=$(az ad sp create --id "${CD_APP_ID}" --query id -o tsv)
    # Brief pause to allow the SP to propagate in Entra ID before role assignments
    sleep 10
  else
    step "Found existing service principal (${CD_SP_ID})"
  fi

  # Add federated credentials (idempotent) when GitHub repo is known
  if [[ -n "${GITHUB_REPO:-}" ]]; then
    # build-and-push job authenticates as the main branch workflow run
    ensure_federated_credential \
      "${CD_APP_OBJECT_ID}" \
      "nova-circle-cd-main" \
      "repo:${GITHUB_REPO}:ref:refs/heads/main"

    # deploy job authenticates via the 'production' GitHub environment
    ensure_federated_credential \
      "${CD_APP_OBJECT_ID}" \
      "nova-circle-cd-production" \
      "repo:${GITHUB_REPO}:environment:production"

    # what-if job authenticates via the 'infra-preview' GitHub environment
    ensure_federated_credential \
      "${CD_APP_OBJECT_ID}" \
      "nova-circle-cd-infra-preview" \
      "repo:${GITHUB_REPO}:environment:infra-preview"
  else
    warn "GITHUB_REPO not set — federated credentials not created."
    warn "Add them manually after the GitHub repo is known (see docs/cd.md)."
  fi

  # Contributor: deploy and update Bicep-managed resources
  ensure_role_assignment "${CD_SP_ID}" "Contributor" "${rg_scope}"

  # User Access Administrator (scoped to the resource group):
  # The Bicep template deploys a role assignment (AcrPull on the Container
  # Registry for the Container App's system-assigned identity) via the
  # acr-pull-role-assignment.bicep module.  Microsoft.Authorization/
  # roleAssignments/write is required to create that assignment.
  # User Access Administrator is narrower than Owner while still granting
  # this specific permission.
  ensure_role_assignment "${CD_SP_ID}" "User Access Administrator" "${rg_scope}"

  step "CD service principal ready: ${CD_APP_ID}"
}

# ── Step 5: Set up API App Registration (JWT validation) ──────────────────────
# The backend validates bearer tokens issued to this app registration.
#
# Deviation from System-Assigned Managed Identity:
#   This is an Entra ID OAuth2 audience identity for the API — not a deployment
#   principal.  A SAMI cannot serve as an OAuth2 audience; an App Registration
#   is required.  Client apps request tokens for this audience when calling the
#   Nova-Circle API.
setup_api_app() {
  info "Setting up API app registration (JWT validation)..."

  local app_display_name="nova-circle-api-${ENVIRONMENT}"
  local app_id_uri="api://nova-circle-${ENVIRONMENT}"

  # Find or create
  API_APP_ID=$(az ad app list \
    --filter "displayName eq '${app_display_name}'" \
    --query "[0].appId" -o tsv 2>/dev/null || echo "")
  if [[ -z "${API_APP_ID}" || "${API_APP_ID}" == "None" ]]; then
    step "Creating app registration: ${app_display_name}"
    API_APP_ID=$(az ad app create \
      --display-name "${app_display_name}" \
      --query appId -o tsv)
  else
    step "Found existing app registration: ${app_display_name} (${API_APP_ID})"
  fi

  # Set the Application ID URI so tokens can be requested for this audience
  local current_uri
  current_uri=$(az ad app show \
    --id "${API_APP_ID}" \
    --query "identifierUris[0]" -o tsv 2>/dev/null || echo "")
  if [[ "${current_uri}" != "${app_id_uri}" ]]; then
    step "Setting Application ID URI: ${app_id_uri}"
    az ad app update \
      --id "${API_APP_ID}" \
      --identifier-uris "${app_id_uri}" 2>/dev/null \
      || warn "Could not set identifier URI — set manually: ${app_id_uri}"
  else
    step "Application ID URI already set: ${app_id_uri}"
  fi

  step "API app registration ready: ${API_APP_ID}"
}

# ── Step 6: Deploy Bicep infrastructure ────────────────────────────────────────
deploy_infrastructure() {
  info "Deploying Bicep infrastructure${WHAT_IF:+ (what-if — no changes applied)}..."

  local deployment_name="nova-circle-${ENVIRONMENT}"
  local optional_params=()
  [[ -n "${TENANT_ID:-}"   ]] && optional_params+=(azureTenantId="${TENANT_ID}")
  [[ -n "${API_APP_ID:-}"  ]] && optional_params+=(azureClientId="${API_APP_ID}")
  [[ -n "${CORS_ORIGIN:-}" ]] && optional_params+=(corsOrigin="${CORS_ORIGIN}")

  if [[ "${WHAT_IF}" == "false" ]]; then
    echo ""
    warn "PostgreSQL Flexible Server takes 15–20 minutes to provision on first deploy."
    warn "The long pause below is normal."
    echo ""
  fi

  local what_if_flag=""
  local output_flag="--output none"
  if [[ "${WHAT_IF}" == "true" ]]; then
    what_if_flag="--what-if"
    output_flag=""  # let Azure print the what-if diff to stdout
  fi

  az deployment group create \
    --name "${deployment_name}" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${INFRA_DIR}/main.bicep" \
    --parameters "${INFRA_DIR}/main.bicepparam" \
    --parameters \
      location="${LOCATION}" \
      environmentName="${ENVIRONMENT}" \
      postgresAdminPassword="${POSTGRES_ADMIN_PASSWORD:-}" \
      "${optional_params[@]+"${optional_params[@]}"}" \
    ${what_if_flag} \
    ${output_flag}

  if [[ "${WHAT_IF}" == "false" ]]; then
    # Capture deployment outputs for use in subsequent steps
    REGISTRY_LOGIN_SERVER=$(az deployment group show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${deployment_name}" \
      --query "properties.outputs.registryLoginServer.value" \
      -o tsv 2>/dev/null || echo "")

    local api_url pg_fqdn
    api_url=$(az deployment group show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${deployment_name}" \
      --query "properties.outputs.apiUrl.value" \
      -o tsv 2>/dev/null || echo "")
    pg_fqdn=$(az deployment group show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${deployment_name}" \
      --query "properties.outputs.postgresFqdn.value" \
      -o tsv 2>/dev/null || echo "")

    step "ACR:       ${REGISTRY_LOGIN_SERVER}"
    step "API URL:   ${api_url}"
    step "PostgreSQL: ${pg_fqdn}"
  fi
}

# ── Step 7: Assign AcrPush to CD service principal ────────────────────────────
# The CD workflow builds and pushes Docker images to ACR. AcrPush is the
# narrowest role that allows this — no Owner or Contributor on ACR is needed.
assign_acr_push() {
  info "Assigning AcrPush to CD service principal..."

  if [[ -z "${CD_SP_ID:-}" ]]; then
    warn "CD service principal not available. Skipping AcrPush assignment."
    return
  fi
  if [[ -z "${REGISTRY_LOGIN_SERVER:-}" ]]; then
    warn "Registry login server unknown. Skipping AcrPush assignment."
    warn "Assign AcrPush manually after infrastructure is deployed (see docs/cd.md)."
    return
  fi

  local registry_name="${REGISTRY_LOGIN_SERVER%%.*}"
  local registry_id
  registry_id=$(az acr show \
    --name "${registry_name}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query id -o tsv 2>/dev/null || echo "")

  if [[ -z "${registry_id}" || "${registry_id}" == "None" ]]; then
    warn "Could not find ACR '${registry_name}'. Skipping AcrPush assignment."
    return
  fi

  ensure_role_assignment "${CD_SP_ID}" "AcrPush" "${registry_id}"
  step "AcrPush assigned on: ${REGISTRY_LOGIN_SERVER}"
}

# ── Step 8: Run database migrations ────────────────────────────────────────────
# Opens a temporary firewall rule, runs Knex migrations, then removes the rule.
# The cleanup trap also removes the rule if the script exits unexpectedly.
run_migrations() {
  info "Running database migrations..."

  PG_SERVER_NAME="psql-nova-circle-${ENVIRONMENT}"
  local pg_fqdn="${PG_SERVER_NAME}.postgres.database.azure.com"
  local pg_admin_user="ncadmin"
  local pg_db="nova_circle"

  DATABASE_URL="postgresql://${pg_admin_user}:${POSTGRES_ADMIN_PASSWORD}@${pg_fqdn}:5432/${pg_db}?sslmode=require"

  # Detect current IP address for the temporary firewall rule
  local runner_ip
  runner_ip=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null \
    || curl -s --max-time 10 https://ifconfig.me 2>/dev/null \
    || die "Could not determine current IP address for PostgreSQL firewall rule.")

  step "Opening PostgreSQL firewall for IP: ${runner_ip}"
  az postgres flexible-server firewall-rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${PG_SERVER_NAME}" \
    --rule-name "bootstrap-runner" \
    --start-ip-address "${runner_ip}" \
    --end-ip-address "${runner_ip}" \
    --output none
  PG_FIREWALL_ADDED=true

  step "Running: npm run migrate"
  (cd "${REPO_ROOT}" && DATABASE_URL="${DATABASE_URL}" npm run migrate)
  step "Migrations complete."

  # Remove the rule immediately on success (the EXIT trap handles failure)
  step "Removing PostgreSQL firewall rule..."
  az postgres flexible-server firewall-rule delete \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${PG_SERVER_NAME}" \
    --rule-name "bootstrap-runner" \
    --yes --output none
  PG_FIREWALL_ADDED=false
}

# ── Step 9: Configure GitHub ────────────────────────────────────────────────────
configure_github() {
  info "Configuring GitHub repository: ${GITHUB_REPO}..."

  local repo="${GITHUB_REPO}"

  # Build DATABASE_URL for the GitHub secret if migrations already ran
  if [[ -z "${DATABASE_URL:-}" ]]; then
    local pg_fqdn="psql-nova-circle-${ENVIRONMENT}.postgres.database.azure.com"
    DATABASE_URL="postgresql://ncadmin:${POSTGRES_ADMIN_PASSWORD:-REPLACE_ME}@${pg_fqdn}:5432/nova_circle?sslmode=require"
  fi

  # ── Repository variables (non-secret, visible in workflow logs) ────────────
  step "Setting repository variables..."
  gh variable set AZURE_CLIENT_ID             --repo "${repo}" --body "${CD_APP_ID:-}"
  gh variable set AZURE_TENANT_ID             --repo "${repo}" --body "${TENANT_ID}"
  gh variable set AZURE_SUBSCRIPTION_ID       --repo "${repo}" --body "${SUBSCRIPTION_ID}"
  gh variable set AZURE_RESOURCE_GROUP        --repo "${repo}" --body "${RESOURCE_GROUP}"
  gh variable set AZURE_ENVIRONMENT_NAME      --repo "${repo}" --body "${ENVIRONMENT}"
  gh variable set AZURE_LOCATION              --repo "${repo}" --body "${LOCATION}"
  gh variable set AZURE_REGISTRY_LOGIN_SERVER --repo "${repo}" --body "${REGISTRY_LOGIN_SERVER:-}"
  gh variable set API_AZURE_TENANT_ID         --repo "${repo}" --body "${TENANT_ID}"
  gh variable set API_AZURE_CLIENT_ID         --repo "${repo}" --body "${API_APP_ID:-}"
  gh variable set CORS_ORIGIN                 --repo "${repo}" --body "${CORS_ORIGIN:-}"

  # ── Repository secrets (encrypted at rest) ────────────────────────────────
  step "Setting repository secrets..."
  gh secret set POSTGRES_ADMIN_PASSWORD --repo "${repo}" --body "${POSTGRES_ADMIN_PASSWORD}"
  gh secret set DATABASE_URL            --repo "${repo}" --body "${DATABASE_URL}"

  # ── GitHub environments ───────────────────────────────────────────────────
  # Create the environments so they exist before the first workflow run.
  # Required reviewers must be added manually via the GitHub UI (see next steps).
  step "Creating GitHub environments..."
  echo '{}' | gh api --method PUT "repos/${repo}/environments/production"    --input - >/dev/null
  echo '{}' | gh api --method PUT "repos/${repo}/environments/infra-preview" --input - >/dev/null
  step "Environments created: production, infra-preview"
}

# ── Step 10: Print summary ─────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Bootstrap complete${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "  ${BOLD}Azure resources:${RESET}"
  echo    "    Subscription ID: ${SUBSCRIPTION_ID}"
  echo    "    Resource group:  ${RESOURCE_GROUP} (${LOCATION})"
  [[ -n "${REGISTRY_LOGIN_SERVER:-}" ]] \
    && echo "    ACR:             ${REGISTRY_LOGIN_SERVER}"
  echo ""
  echo -e "  ${BOLD}App registrations:${RESET}"
  [[ -n "${CD_APP_ID:-}" ]]  && echo "    CD service principal:  ${CD_APP_ID}"
  [[ -n "${API_APP_ID:-}" ]] && echo "    API app registration:  ${API_APP_ID}"
  echo ""

  if [[ "${SKIP_GITHUB}" == "false" && -n "${GITHUB_REPO:-}" ]]; then
    echo -e "  ${BOLD}GitHub:${RESET}"
    echo    "    Repository: https://github.com/${GITHUB_REPO}"
    echo    "    Variables, secrets, and environments configured."
    echo ""
    echo -e "  ${YELLOW}${BOLD}Required manual steps:${RESET}"
    echo    ""
    echo    "  1. Add required reviewers to the 'production' environment"
    echo    "     (automated deployment approval gate):"
    echo    "     https://github.com/${GITHUB_REPO}/settings/environments"
    echo    ""
    echo    "  2. Configure the API app registration for your client apps"
    echo    "     (redirect URIs, OAuth2 scopes) if JWT auth is needed:"
    local tenant_portal_url="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${API_APP_ID:-}"
    echo    "     ${tenant_portal_url}"
    echo    ""
    echo    "  3. Push or merge a change to 'main' to trigger the first CD run."
  else
    echo -e "  ${YELLOW}${BOLD}Required next steps:${RESET}"
    echo    ""
    echo    "  1. Configure GitHub variables and secrets (see docs/cd.md)."
    echo    "  2. Add required reviewers to the 'production' environment."
    echo    "  3. Configure the API app registration for JWT auth if needed."
    echo    "  4. Push or merge a change to 'main' to trigger the first CD run."
  fi
  echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}Nova-Circle Bootstrap${RESET}"
  echo ""

  check_prerequisites
  collect_parameters

  # -- What-if mode: preview Bicep only, then exit ----------------------------
  if [[ "${WHAT_IF}" == "true" ]]; then
    ensure_resource_group
    deploy_infrastructure
    echo ""
    echo "What-if preview complete. No resources were created or modified."
    exit 0
  fi

  # -- Normal mode ------------------------------------------------------------
  ensure_resource_group

  # App registrations are set up whenever we are doing infra deployment or
  # GitHub configuration (or both).
  if [[ "${SKIP_INFRA}" == "false" || "${SKIP_GITHUB}" == "false" ]]; then
    setup_oidc_app
    setup_api_app
  fi

  if [[ "${SKIP_INFRA}" == "false" ]]; then
    deploy_infrastructure
    assign_acr_push
  else
    warn "Skipping Bicep infrastructure deployment (--skip-infra)."
  fi

  if [[ "${SKIP_MIGRATIONS}" == "false" ]]; then
    run_migrations
  else
    warn "Skipping database migrations (--skip-migrations)."
    warn "Run them manually or trigger a CD deployment."
  fi

  if [[ "${SKIP_GITHUB}" == "false" ]]; then
    configure_github
  else
    warn "Skipping GitHub configuration (--skip-github)."
    warn "Configure repository variables and secrets manually (see docs/cd.md)."
  fi

  print_summary
}

main "$@"
