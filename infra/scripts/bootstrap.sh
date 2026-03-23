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
#       --app-redirect-uri <url>   SPA redirect URI to register on the API app (e.g. https://nova-circle.example.com)
#       --skip-github              Skip GitHub variable/secret configuration
#       --skip-infra               Skip Bicep infrastructure deployment
#       --skip-migrations          Skip initial database migrations
#       --what-if                  Preview Bicep changes without applying (no other changes)
#   -h, --help                     Show this help text
#
# Environment variables (alternative to interactive prompts):
#   POSTGRES_ADMIN_PASSWORD  PostgreSQL administrator password
#   CORS_ORIGIN              Comma-separated allowed CORS origins
#   APP_REDIRECT_URI         SPA redirect URI to register on the API app registration
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
      --app-redirect-uri <url>   SPA redirect URI to register on the API app (e.g. https://nova-circle.example.com)
      --skip-github              Skip GitHub variable/secret configuration
      --skip-infra               Skip Bicep infrastructure deployment
      --skip-migrations          Skip initial database migrations
      --what-if                  Preview Bicep changes only — no resources created
  -h, --help                     Show this help text

${BOLD}Environment variables:${RESET}
  POSTGRES_ADMIN_PASSWORD  PostgreSQL administrator password (avoids prompt)
  CORS_ORIGIN              Allowed CORS origins (comma-separated)
  APP_REDIRECT_URI         SPA redirect URI to register on the API app registration

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
APP_REDIRECT_URI="${APP_REDIRECT_URI:-}"
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
    --app-redirect-uri)  APP_REDIRECT_URI="$2"; shift 2 ;;
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
PYTHON_CMD=""
CD_APP_ID=""
CD_APP_OBJECT_ID=""
CD_SP_ID=""
API_APP_ID=""
API_APP_OBJECT_ID=""
REGISTRY_LOGIN_SERVER=""
CLIENT_URL=""
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
  local current_val="${!var_name:-}"

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
  local current_val="${!var_name:-}"

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

# ── Helper: ensure a federated credential exists with the correct subject ──────
# Idempotent: creates if missing, updates if the subject has drifted.
ensure_federated_credential() {
  local app_object_id="$1"
  local cred_name="$2"
  local subject="$3"

  # Query the credential ID and current subject in two separate list calls.
  local existing_id existing_subject
  existing_id=$(az ad app federated-credential list \
    --id "${app_object_id}" \
    --query "[?name=='${cred_name}'].id | [0]" -o tsv 2>/dev/null || echo "")
  existing_subject=$(az ad app federated-credential list \
    --id "${app_object_id}" \
    --query "[?name=='${cred_name}'].subject | [0]" -o tsv 2>/dev/null || echo "")

  if [[ -z "${existing_id}" ]]; then
    local create_out create_rc
    create_out=$(az ad app federated-credential create \
      --id "${app_object_id}" \
      --parameters "{
        \"name\": \"${cred_name}\",
        \"issuer\": \"https://token.actions.githubusercontent.com\",
        \"subject\": \"${subject}\",
        \"audiences\": [\"api://AzureADTokenExchange\"]
      }" --output none 2>&1) || create_rc=$?
    if [[ -n "${create_rc:-}" ]] && [[ "${create_out}" == *"already exists"* ]]; then
      step "Federated credential already exists: ${cred_name}"
    elif [[ -n "${create_rc:-}" ]]; then
      echo "${create_out}" >&2
      die "Failed to create federated credential '${cred_name}' for app '${app_object_id}'"
    else
      step "Created federated credential: ${cred_name}"
    fi
  elif [[ "${existing_subject}" != "${subject}" ]]; then
    # Subject has drifted — update the credential to the expected subject.
    az ad app federated-credential update \
      --id "${app_object_id}" \
      --federated-credential-id "${existing_id}" \
      --parameters "{
        \"name\": \"${cred_name}\",
        \"issuer\": \"https://token.actions.githubusercontent.com\",
        \"subject\": \"${subject}\",
        \"audiences\": [\"api://AzureADTokenExchange\"]
      }" --output none
    step "Updated federated credential subject: ${cred_name}"
  else
    step "Federated credential already exists (subject OK): ${cred_name}"
  fi
}

# ── Helper: ensure a role assignment exists (idempotent) ──────────────────────
ensure_role_assignment() {
  local principal_id="$1"
  local role="$2"
  local scope="$3"

  # Map well-known built-in role names to their Azure RBAC definition GUIDs.
  # Using the GUID directly avoids az role assignment create's internal
  # role-name → ARM lookup round-trip.  That lookup hits a subscription-scoped
  # ARM endpoint and, after az ad (MS Graph) calls have contaminated the CLI's
  # MSAL context, it is itself the call that produces MissingSubscription —
  # even before the actual assignment create request is sent.
  local role_def_guid
  case "${role}" in
    "Contributor")               role_def_guid="b24988ac-6180-42a0-ab88-20f7382dd24c" ;;
    "User Access Administrator") role_def_guid="18d7d88d-d35e-4fb5-a5c3-7773c20a72d9" ;;
    "AcrPush")                   role_def_guid="8311e382-0749-4cb8-b61a-304f252e45ec" ;;
    *)
      die "Unknown role '${role}'. Add its Azure built-in role GUID to ensure_role_assignment."
      ;;
  esac

  # The roleDefinitionId in the role-assignment body must be subscription-scoped.
  # ARM cannot resolve the root-scoped /providers/... path when the assignment
  # scope is at subscription or resource-group level — it returns
  # RoleDefinitionDoesNotExist.  The subscription-scoped path is what the
  # Azure ARM REST API documents as the correct format.
  local role_def_id="/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleDefinitions/${role_def_guid}"

  # Derive a deterministic UUID for the role-assignment resource name so that
  # repeated bootstrap runs with the same arguments are idempotent.
  local ra_name
  ra_name=$(printf '%s|%s|%s' "${scope}" "${principal_id}" "${role_def_guid}" \
    | { sha256sum 2>/dev/null || shasum -a 256 2>/dev/null; } \
    | cut -c1-32 \
    | sed 's/\(.\{8\}\)\(.\{4\}\)\(.\{4\}\)\(.\{4\}\)\(.\{12\}\)/\1-\2-\3-\4-\5/')

  local ra_url="https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments/${ra_name}?api-version=2022-04-01"
  local ra_body
  ra_body=$(printf '{"properties":{"roleDefinitionId":"%s","principalId":"%s","principalType":"ServicePrincipal"}}' \
    "${role_def_id}" "${principal_id}")

  local attempt arm_token create_out
  for attempt in 1 2 3; do
    # Restore subscription context before getting the ARM token.
    # After az ad (MS Graph) calls the CLI's internal MSAL context drifts —
    # the subscription-to-tenant mapping can be lost, causing the token
    # obtained with --tenant to lack proper subscription context.  ARM then
    # cannot resolve the subscription-scoped roleDefinitionId and returns
    # RoleDefinitionDoesNotExist instead of the expected 2xx.
    #
    # Fix: re-anchor the subscription with az account set, then request the
    # token with --subscription.  The CLI resolves the tenant from the
    # subscription configuration, giving ARM a token it can fully validate.
    #
    # Note: --subscription and --tenant cannot be used together; use
    # --subscription alone so the CLI derives the tenant automatically.
    az account set --subscription "${SUBSCRIPTION_ID}" >/dev/null 2>&1 || true
    arm_token=$(az account get-access-token \
      --resource "https://management.azure.com/" \
      --subscription "${SUBSCRIPTION_ID}" \
      --query accessToken -o tsv 2>/dev/null) || arm_token=""

    if [[ -z "${arm_token}" ]]; then
      warn "az account get-access-token (ARM) could not obtain token on attempt ${attempt}/3 — retrying..."
      sleep $((attempt * 5))
      continue
    fi

    # Use curl instead of az rest for the PUT call.
    # az rest --skip-authorization-header --headers "Authorization=Bearer TOKEN"
    # splits header values on spaces, breaking the "Bearer <token>" value and
    # causing ARM to receive a malformed or absent auth token.  ARM then returns
    # a semantic 400 (RoleDefinitionDoesNotExist) rather than 401.
    # curl has unambiguous -H handling and completely bypasses az CLI's MSAL context.
    local tmp_response_file http_code
    tmp_response_file=$(mktemp /tmp/ra_resp_XXXXXX.json)
    http_code=$(curl -s \
          -o "${tmp_response_file}" \
          -w "%{http_code}" \
          -X PUT \
          -H "Authorization: Bearer ${arm_token}" \
          -H "Content-Type: application/json" \
          -d "${ra_body}" \
          "${ra_url}" 2>&1) || http_code="000"
    create_out=$(cat "${tmp_response_file}"; rm -f "${tmp_response_file}")
    if [[ "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
      step "Assigned role: ${role}"
      return 0
    elif [[ "${create_out}" == *"RoleAssignmentExists"* ]]; then
      step "Role already assigned: ${role}"
      return 0
    elif [[ "${create_out}" == *"MissingSubscription"* ]] && [[ ${attempt} -lt 3 ]]; then
      warn "Attempt ${attempt}/3: MissingSubscription — re-establishing ARM context and retrying in $((attempt * 5))s..."
      sleep $((attempt * 5))
      continue
    else
      echo "${create_out}" >&2
      die "Failed to create role assignment '${role}' for principal '${principal_id}' on scope '${scope}'. Subscription='${SUBSCRIPTION_ID}' Tenant='${TENANT_ID}'"
    fi
  done
}

# ── Step 1: Prerequisites check ────────────────────────────────────────────────
check_prerequisites() {
  info "Checking prerequisites..."

  command -v az >/dev/null 2>&1 \
    || die "Azure CLI (az) is not installed. See https://docs.microsoft.com/cli/azure/install-azure-cli"
  step "az CLI: $(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo 'ok')"

  command -v curl >/dev/null 2>&1 \
    || die "curl is not installed. It is required for ARM role assignment calls."
  step "curl: $(curl --version 2>/dev/null | head -1)"

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

  if python3 -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
    PYTHON_CMD="python3"
  elif python -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
    PYTHON_CMD="python"
  elif py -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
    PYTHON_CMD="py"
  else
    die "'python3' (or 'python'/'py') is required to merge oauth2PermissionScopes. Install Python 3 from https://www.python.org/ and re-run bootstrap.sh."
  fi
  step "python: $(${PYTHON_CMD} --version 2>&1)"
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
    # Strip any .git suffix the user may have included (e.g. from copy-pasting a clone URL)
    GITHUB_REPO="${GITHUB_REPO%.git}"
  fi

  if [[ "${SKIP_INFRA}" == "false" ]] || [[ "${SKIP_MIGRATIONS}" == "false" ]]; then
    prompt_secret POSTGRES_ADMIN_PASSWORD "PostgreSQL admin password"
    # Export so child processes (az bicep compiler) can read the env variable.
    # prompt_secret uses printf -v which does not export; export is required here.
    export POSTGRES_ADMIN_PASSWORD
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

  # ── Role assignments BEFORE federated-credential calls ───────────────────────
  # ensure_federated_credential uses az ad (MS Graph) which shifts the Azure CLI
  # token/endpoint context away from ARM.  Performing the ARM role assignments
  # here — while the context is still clean from az login — avoids the
  # MissingSubscription error that occurs when ARM calls follow MS Graph calls.

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

  # Add federated credentials (idempotent) when GitHub repo is known.
  # These are pure MS Graph calls — keep them after ARM role assignments.
  if [[ -n "${GITHUB_REPO:-}" ]]; then
    # build-and-push job authenticates as the main branch workflow run
    ensure_federated_credential \
      "${CD_APP_OBJECT_ID}" \
      "nova-circle-cd-main" \
      "repo:${GITHUB_REPO}:ref:refs/heads/main"

    # build-and-push job authenticates as the dev branch workflow run
    ensure_federated_credential \
      "${CD_APP_OBJECT_ID}" \
      "nova-circle-cd-dev" \
      "repo:${GITHUB_REPO}:ref:refs/heads/dev"

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

  # Grant the CD app registration the Application.ReadWrite.OwnedBy Microsoft
  # Graph application permission so the CD workflow can read and update the SPA
  # redirect URIs on app registrations it owns (used to register revision-specific
  # URLs before Playwright E2E tests and remove them afterwards).
  #
  # Also grant DelegatedPermissionGrant.ReadWrite.All so the CD workflow can
  # create and update oauth2PermissionGrants — this is required to pre-consent
  # the user_impersonation scope for all users on every deploy (self-healing).
  #
  # The Microsoft Graph app ID is a stable well-known value defined by Microsoft
  # and is the same across all tenants.  The appRole IDs are resolved dynamically
  # from the Graph service principal to avoid hardcoding GUIDs that are easy to
  # mistype.  The script fails with a clear error if a required role cannot be
  # found.
  # Source: https://learn.microsoft.com/en-us/graph/permissions-reference
  local GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"

  step "Resolving Microsoft Graph app role IDs from service principal..."
  local APP_READ_WRITE_OWNED_BY_ROLE_ID
  local app_rw_err_file
  app_rw_err_file="$(mktemp)"
  APP_READ_WRITE_OWNED_BY_ROLE_ID=$(az ad sp show \
    --id "${GRAPH_APP_ID}" \
    --query "appRoles[?value=='Application.ReadWrite.OwnedBy'].id | [0]" \
    -o tsv 2>"${app_rw_err_file}" || echo "")
  local app_rw_err
  app_rw_err="$(<"${app_rw_err_file}")"
  rm -f "${app_rw_err_file}"
  if [[ -z "${APP_READ_WRITE_OWNED_BY_ROLE_ID}" || "${APP_READ_WRITE_OWNED_BY_ROLE_ID}" == "None" ]]; then
    if [[ -n "${app_rw_err}" ]]; then
      die "Could not resolve appRole ID for 'Application.ReadWrite.OwnedBy' from the Microsoft Graph service principal. Ensure you are logged in to the correct tenant. Azure CLI error: ${app_rw_err}"
    else
      die "Could not resolve appRole ID for 'Application.ReadWrite.OwnedBy' from the Microsoft Graph service principal. Ensure you are logged in to the correct tenant."
    fi
  fi
  step "Resolved Application.ReadWrite.OwnedBy role ID: ${APP_READ_WRITE_OWNED_BY_ROLE_ID}"

  local DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID
  local delegated_perm_rw_err_file
  delegated_perm_rw_err_file="$(mktemp)"
  DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID=$(az ad sp show \
    --id "${GRAPH_APP_ID}" \
    --query "appRoles[?value=='DelegatedPermissionGrant.ReadWrite.All'].id | [0]" \
    -o tsv 2>"${delegated_perm_rw_err_file}" || echo "")
  local delegated_perm_rw_err
  delegated_perm_rw_err="$(<"${delegated_perm_rw_err_file}")"
  rm -f "${delegated_perm_rw_err_file}"
  if [[ -z "${DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID}" || "${DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID}" == "None" ]]; then
    if [[ -n "${delegated_perm_rw_err}" ]]; then
      die "Could not resolve appRole ID for 'DelegatedPermissionGrant.ReadWrite.All' from the Microsoft Graph service principal. Ensure you are logged in to the correct tenant. Azure CLI error: ${delegated_perm_rw_err}"
    else
      die "Could not resolve appRole ID for 'DelegatedPermissionGrant.ReadWrite.All' from the Microsoft Graph service principal. Ensure you are logged in to the correct tenant."
    fi
  fi
  step "Resolved DelegatedPermissionGrant.ReadWrite.All role ID: ${DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID}"

  step "Granting Application.ReadWrite.OwnedBy Graph permission to CD app..."
  local perm_add_err=""
  if perm_add_err=$(az ad app permission add \
    --id "${CD_APP_OBJECT_ID}" \
    --api "${GRAPH_APP_ID}" \
    --api-permissions "${APP_READ_WRITE_OWNED_BY_ROLE_ID}=Role" \
    --output none 2>&1); then
    step "Application.ReadWrite.OwnedBy added to ${CD_APP_ID}."
  else
    # Already-granted returns a non-fatal "already exists" error; treat it as success.
    if echo "${perm_add_err}" | grep -qi "already"; then
      step "Application.ReadWrite.OwnedBy already present on ${CD_APP_ID}."
    else
      warn "Could not add Application.ReadWrite.OwnedBy to CD app registration."
      warn "Azure CLI output: ${perm_add_err}"
      warn "Add manually: az ad app permission add --id ${CD_APP_OBJECT_ID} --api ${GRAPH_APP_ID} --api-permissions ${APP_READ_WRITE_OWNED_BY_ROLE_ID}=Role"
    fi
  fi

  step "Granting DelegatedPermissionGrant.ReadWrite.All Graph permission to CD app..."
  local dpg_add_err=""
  if dpg_add_err=$(az ad app permission add \
    --id "${CD_APP_OBJECT_ID}" \
    --api "${GRAPH_APP_ID}" \
    --api-permissions "${DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID}=Role" \
    --output none 2>&1); then
    step "DelegatedPermissionGrant.ReadWrite.All added to ${CD_APP_ID}."
  else
    if echo "${dpg_add_err}" | grep -qi "already"; then
      step "DelegatedPermissionGrant.ReadWrite.All already present on ${CD_APP_ID}."
    else
      warn "Could not add DelegatedPermissionGrant.ReadWrite.All to CD app registration."
      warn "Azure CLI output: ${dpg_add_err}"
      warn "Add manually: az ad app permission add --id ${CD_APP_OBJECT_ID} --api ${GRAPH_APP_ID} --api-permissions ${DELEGATED_PERM_GRANT_RW_ALL_ROLE_ID}=Role"
    fi
  fi

  # Admin consent is required for application-level (non-delegated) Graph permissions.
  # Without it the permission appears in the portal but the token will not include it.
  local consent_err=""
  if consent_err=$(az ad app permission admin-consent \
    --id "${CD_APP_OBJECT_ID}" \
    --output none 2>&1); then
    step "Admin consent granted for CD app Graph permissions."
  else
    warn "Could not grant admin consent for CD app Graph permissions."
    warn "Azure CLI output: ${consent_err}"
    warn "Grant manually: az ad app permission admin-consent --id ${CD_APP_OBJECT_ID}"
    warn "Or via Azure Portal: Entra ID → App Registrations → ${CD_APP_ID} → API permissions → Grant admin consent."
  fi

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

  # Resolve the object ID (different from appId / clientId) so the CD workflow
  # can use GET /applications/{objectId} directly.  That endpoint works with
  # Application.ReadWrite.OwnedBy, whereas GET /applications?$filter=appId eq '...'
  # requires the broader Application.Read.All permission.
  API_APP_OBJECT_ID=$(az ad app show --id "${API_APP_ID}" --query id -o tsv 2>/dev/null || echo "")
  if [[ -z "${API_APP_OBJECT_ID}" || "${API_APP_OBJECT_ID}" == "None" ]]; then
    die "Failed to resolve object ID for API app registration '${app_display_name}'. Ensure you have sufficient permissions and that the Azure AD app exists, then re-run this script."
  fi

  # Set requestedAccessTokenVersion=2 (v2 tokens — best practice and required by
  # some tenants before a friendly identifier URI can be set).
  az ad app update \
    --id "${API_APP_ID}" \
    --set "api.requestedAccessTokenVersion=2" \
    --output none 2>/dev/null \
    || true

  # Use api://{APP_ID} as the identifier URI.  This format is guaranteed to be
  # accepted under ANY tenant policy because it contains the app's own client ID.
  # A friendly name (e.g. api://nova-circle-dev) requires the tenant to have a
  # verified domain or the requestedAccessTokenVersion to already be 2.
  local app_id_uri="api://${API_APP_ID}"

  local current_uri
  current_uri=$(az ad app show \
    --id "${API_APP_ID}" \
    --query "identifierUris[0]" -o tsv 2>/dev/null || echo "")
  if [[ "${current_uri}" != "${app_id_uri}" ]]; then
    step "Setting Application ID URI: ${app_id_uri}"
    az ad app update \
      --id "${API_APP_ID}" \
      --identifier-uris "${app_id_uri}" \
      --output none 2>/dev/null \
      || warn "Could not set identifier URI — set manually in Azure Portal: ${app_id_uri}"
  else
    step "Application ID URI already set: ${app_id_uri}"
  fi

  # Register SPA platform redirect URIs (idempotent — preserves existing URIs).
  #
  # Always include http://localhost:5173 for non-production environments so local
  # development works without any extra configuration.  Include the operator-supplied
  # --app-redirect-uri value (e.g. the live site origin) when provided.
  #
  # The MSAL client always uses window.location.origin as the redirectUri, so that
  # origin must be registered here before Entra ID will accept the OIDC redirect.
  # Entra ID performs an exact URI match, so the registered value must be an origin
  # (scheme + host + optional port, no path, query, or fragment).

  # Validate and normalize APP_REDIRECT_URI when provided.
  if [[ -n "${APP_REDIRECT_URI:-}" ]]; then
    # Strip a single trailing slash to normalize.
    APP_REDIRECT_URI="${APP_REDIRECT_URI%/}"
    # Reject values that include a path, query string, or fragment — Entra ID will
    # not match them against window.location.origin and sign-in will fail silently.
    if [[ "${APP_REDIRECT_URI}" =~ ^https?://[^/?#]+(:[0-9]+)?(/[^/?#].*)? ]]; then
      local uri_path="${BASH_REMATCH[2]:-}"
      if [[ -n "${uri_path}" ]]; then
        warn "APP_REDIRECT_URI '${APP_REDIRECT_URI}' contains a path component ('${uri_path}')."
        warn "Entra ID requires a plain origin (scheme + host + optional port). The URI will not be registered."
        APP_REDIRECT_URI=""
      fi
    fi
  fi

  local -a desired_spa_uris=()
  [[ "${ENVIRONMENT}" != "prod" ]] && desired_spa_uris+=("http://localhost:5173")
  [[ -n "${APP_REDIRECT_URI:-}" ]]  && desired_spa_uris+=("${APP_REDIRECT_URI}")

  # In production, require APP_REDIRECT_URI. Without it, no SPA redirect URI is
  # registered and every sign-in will fail with AADSTS500113.
  if [[ "${ENVIRONMENT}" == "prod" && -z "${APP_REDIRECT_URI:-}" ]]; then
    local auth_blade_url="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/${API_APP_ID}/isMSAApp~/false"
    warn "ENVIRONMENT=prod but --app-redirect-uri is not set. No SPA redirect URI will be registered."
    warn "SPA sign-in will fail with AADSTS500113. Register the live-site origin manually:"
    warn "  ${auth_blade_url}"
  fi

  if [[ ${#desired_spa_uris[@]} -gt 0 ]]; then
    step "Registering SPA platform redirect URIs..."

    # Read existing SPA redirect URIs from the app registration.
    # Strip \r to handle Windows-style line endings from az CLI output.
    local existing_spa_raw
    existing_spa_raw=$(az ad app show \
      --id "${API_APP_ID}" \
      --query "spa.redirectUris" -o tsv 2>/dev/null | tr -d '\r' || echo "")

    # Merge existing + desired, deduplicating by exact URI match.
    local -a merged_spa_uris=()
    while IFS= read -r uri; do
      [[ -n "${uri}" ]] && merged_spa_uris+=("${uri}")
    done <<< "${existing_spa_raw}"

    for uri in "${desired_spa_uris[@]}"; do
      local already_present=false
      for existing in "${merged_spa_uris[@]-}"; do
        [[ "${existing}" == "${uri}" ]] && already_present=true && break
      done
      [[ "${already_present}" == "false" ]] && merged_spa_uris+=("${uri}")
    done

    # az ad app update does not support --spa-redirect-uris on all az CLI versions;
    # use the Microsoft Graph REST API directly via az rest instead (same approach
    # as the CD workflow — see .github/workflows/cd.yml "Add revision URL to Azure
    # AD SPA redirect URIs").
    local spa_uris_json
    spa_uris_json=$(${PYTHON_CMD} -c "
import sys, json
uris = sys.argv[1:]
print(json.dumps({'spa': {'redirectUris': uris}}))" \
      "${merged_spa_uris[@]}")

    local spa_update_err=""
    if ! spa_update_err=$(az rest \
      --method PATCH \
      --uri "https://graph.microsoft.com/v1.0/applications/${API_APP_OBJECT_ID}" \
      --body "${spa_uris_json}" \
      --headers 'Content-Type=application/json' \
      --output none 2>&1); then
      local auth_blade_url="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/${API_APP_ID}/isMSAApp~/false"
      warn "Could not register SPA redirect URIs — add them manually in Azure Portal → Authentication:"
      warn "  ${auth_blade_url}"
      warn "Azure CLI output: ${spa_update_err}"
      if [[ "${ENVIRONMENT}" == "prod" ]]; then
        die "SPA redirect URI registration failed in prod. Fix the error above and re-run bootstrap."
      fi
    else
      step "SPA redirect URIs: ${merged_spa_uris[*]}"
    fi
  fi

  # Grant the CD service principal ownership of the API app registration so the
  # CD workflow can add/remove SPA redirect URIs around Playwright E2E tests.
  # App owners can call `az ad app update` without directory-level admin roles.
  if [[ -n "${CD_SP_ID:-}" ]]; then
    step "Granting CD service principal ownership of API app registration..."
    local cd_owner_add_output=""
    if cd_owner_add_output=$(az ad app owner add \
      --id "${API_APP_ID}" \
      --owner-object-id "${CD_SP_ID}" \
      --output none 2>&1); then
      step "CD service principal (${CD_SP_ID}) is now an owner of ${API_APP_ID}."
    else
      warn "Could not grant CD service principal ownership of API app registration."
      warn "Azure CLI output: ${cd_owner_add_output}"
      warn "Grant ownership manually: az ad app owner add --id ${API_APP_ID} --owner-object-id ${CD_SP_ID}"
    fi
  else
    warn "CD_SP_ID not set — skipping CD ownership grant for API app registration."
    warn "Grant ownership manually: az ad app owner add --id ${API_APP_ID} --owner-object-id <CD_SP_OBJECT_ID>"
  fi

  # Expose the user_impersonation OAuth2 permission scope on the API app registration.
  # This allows the MSAL-based SPA to request access tokens for the API using
  # scope 'api://<clientId>/user_impersonation'.  Without this scope the token
  # acquisition silently fails and every API call returns a JS error on the client.
  #
  # The Graph PATCH for oauth2PermissionScopes must include ALL existing scopes or
  # they are removed, so we merge the new scope with the existing list.
  step "Ensuring user_impersonation OAuth2 scope is exposed on the API app registration..."
  local current_scopes_json
  current_scopes_json=$(az rest \
    --method GET \
    --uri "https://graph.microsoft.com/v1.0/applications/${API_APP_OBJECT_ID}" \
    --query "api.oauth2PermissionScopes" \
    --output json 2>/dev/null || echo "[]")

  local has_user_impersonation
  has_user_impersonation=$(echo "${current_scopes_json}" | \
    "${PYTHON_CMD}" -c "import sys,json; data=json.load(sys.stdin); print(len([x for x in data if x.get('value')=='user_impersonation' and x.get('isEnabled')==True]))" \
    2>/dev/null || echo "0")

  if [[ "${has_user_impersonation}" == "0" ]]; then
    # Generate a stable UUID for the scope.  Use /proc/sys/kernel/random/uuid on
    # Linux, uuidgen on macOS, or python3 as a universal fallback.
    local scope_id
    scope_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null \
      || uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' \
      || "${PYTHON_CMD}" -c "import uuid; print(uuid.uuid4())")

    local _py_build_scope
    _py_build_scope='import sys, json, os
d = json.load(sys.stdin)
d.append({
    "id": os.environ["SCOPE_ID"],
    "value": "user_impersonation",
    "type": "User",
    "isEnabled": True,
    "adminConsentDisplayName": "Access Nova Circle API on your behalf",
    "adminConsentDescription": "Allows the application to access the Nova Circle API on your behalf.",
    "userConsentDisplayName": "Access Nova Circle API on your behalf",
    "userConsentDescription": "Allows this application to access the Nova Circle API on your behalf.",
})
print(json.dumps(d))'
    local updated_scopes
    updated_scopes=$(SCOPE_ID="${scope_id}" "${PYTHON_CMD}" -c "${_py_build_scope}" <<< "${current_scopes_json}")

    local patch_body
    patch_body=$(printf '{"api":{"oauth2PermissionScopes":%s}}' "${updated_scopes}")

    if az rest \
      --method PATCH \
      --uri "https://graph.microsoft.com/v1.0/applications/${API_APP_OBJECT_ID}" \
      --headers "Content-Type=application/json" \
      --body "${patch_body}" \
      --output none 2>/dev/null; then
      step "Exposed user_impersonation scope on ${API_APP_ID}."
    else
      warn "Could not expose user_impersonation scope automatically."
      warn "Add it manually: Azure Portal → App registrations → ${API_APP_ID} → Expose an API → Add a scope → user_impersonation"
    fi
  else
    step "user_impersonation scope is already exposed and enabled."
  fi

  # Grant admin consent for the user_impersonation scope so E2E test users are
  # not prompted for consent during headless sign-in.
  #
  # The correct way to pre-consent a delegated OAuth2 scope for all users is via
  # the oauth2PermissionGrants Graph API (POST /oauth2PermissionGrants with
  # consentType=AllPrincipals).  The legacy `az ad app permission admin-consent`
  # command only consents permissions listed in requiredResourceAccess, which
  # does not include the self-referencing user_impersonation scope exposed here.
  step "Granting admin consent for user_impersonation scope via oauth2PermissionGrants (best-effort)..."
  local api_sp_id=""
  api_sp_id=$(az ad sp show --id "${API_APP_ID}" --query id -o tsv 2>/dev/null || echo "")
  if [[ -z "${api_sp_id}" || "${api_sp_id}" == "None" ]]; then
    step "Service principal for API app not found — creating it..."
    api_sp_id=$(az ad sp create --id "${API_APP_ID}" --query id -o tsv 2>/dev/null || echo "")
  fi

  if [[ -n "${api_sp_id}" && "${api_sp_id}" != "None" ]]; then
    # Retrieve any existing AllPrincipals grant for this SP (clientId == resourceId).
    local all_grants existing_grant grant_id current_scope
    all_grants=$(az rest --method GET \
      --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${api_sp_id}/oauth2PermissionGrants" \
      --output json 2>/dev/null || echo '{"value":[]}')
    existing_grant=$(SP_ID="${api_sp_id}" "${PYTHON_CMD}" -c "import sys,json,os; data=json.load(sys.stdin); sp=os.environ.get('SP_ID'); matches=[x for x in data.get('value',[]) if x.get('resourceId')==sp and x.get('clientId')==sp and x.get('consentType')=='AllPrincipals']; matches and print(json.dumps(matches[0]))" <<< "${all_grants}" 2>/dev/null || echo "")

    if [[ -z "${existing_grant}" ]]; then
      # No AllPrincipals grant yet — create one.
      if az rest --method POST \
        --uri "https://graph.microsoft.com/v1.0/oauth2PermissionGrants" \
        --headers 'Content-Type=application/json' \
        --body "{\"clientId\":\"${api_sp_id}\",\"consentType\":\"AllPrincipals\",\"resourceId\":\"${api_sp_id}\",\"scope\":\"user_impersonation\"}" \
        --output none 2>/dev/null; then
        step "Admin consent (AllPrincipals) granted for user_impersonation scope."
      else
        warn "Could not create oauth2PermissionGrant — a tenant admin may need to grant consent manually."
        warn "Azure Portal: Entra ID → Enterprise applications → ${API_APP_ID} → Permissions → Grant admin consent"
      fi
    else
      current_scope=$(${PYTHON_CMD} -c "import sys,json; d=json.load(sys.stdin); print(d.get('scope',''))" <<< "${existing_grant}" 2>/dev/null || echo "")
      grant_id=$(${PYTHON_CMD} -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" <<< "${existing_grant}" 2>/dev/null || echo "")
      if [[ "${current_scope}" != *"user_impersonation"* && -n "${grant_id}" ]]; then
        # Grant exists but is missing user_impersonation — add it.
        local new_scope
        new_scope=$(printf '%s user_impersonation' "${current_scope}" | tr -s ' ' | sed 's/^ //;s/ $//')
        if az rest --method PATCH \
          --uri "https://graph.microsoft.com/v1.0/oauth2PermissionGrants/${grant_id}" \
          --headers 'Content-Type=application/json' \
          --body "{\"scope\":\"${new_scope}\"}" \
          --output none 2>/dev/null; then
          step "Updated oauth2PermissionGrant to include user_impersonation scope."
        else
          warn "Could not update oauth2PermissionGrant — check tenant permissions."
        fi
      else
        step "Admin consent for user_impersonation scope already granted."
      fi
    fi
  else
    warn "Could not determine API service principal ID — admin consent for user_impersonation may need to be granted manually."
    warn "Azure Portal: Entra ID → Enterprise applications → ${API_APP_ID} → Permissions → Grant admin consent"
  fi

  step "API app registration ready: ${API_APP_ID}"
}

# ── Pre-deployment: deactivate stale Container App revisions ──────────────────
# When re-running bootstrap with the MCR placeholder image, Bicep sets
# registries:[] on the Container Apps (useAcr=false).  Azure rejects that
# update with ContainerAppRegistryInUse if any active revision still references
# the old ACR.  Deactivating stale revisions beforehand removes that block.
#
# Safety: when there are 2+ active revisions and a live-traffic revision can
# be identified (ingress weight > 0), that revision is preserved so the app
# stays reachable if the subsequent Bicep deployment fails.  In all other
# cases (single revision, or no live-traffic revision found) all active
# revisions are deactivated — brief downtime is accepted because Bicep
# immediately creates a new revision, and leaving any ACR-referencing revision
# active would cause ContainerAppRegistryInUse regardless.
#
# Guard: deactivation is skipped entirely for an app when its registry list is
# already empty — no mutation needed, no disruption risk.
deactivate_container_app_revisions() {
  local -a app_names=(
    "ca-nova-circle-${ENVIRONMENT}"
    "ca-nova-circle-client-${ENVIRONMENT}"
  )

  for app in "${app_names[@]}"; do
    # Skip if the Container App does not exist yet (first deploy).
    if ! az containerapp show \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${app}" \
        --output none 2>/dev/null; then
      continue
    fi

    # Pre-check: skip deactivation when the app's registry list is already
    # empty.  Bicep only triggers ContainerAppRegistryInUse when it needs to
    # remove a registry entry from the configuration; if there is nothing to
    # remove, deactivating revisions is unnecessary and risks availability.
    local current_registries
    current_registries=$(az containerapp show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${app}" \
      --query "properties.configuration.registries" \
      -o tsv 2>/dev/null || echo "")

    if [[ -z "${current_registries}" ]]; then
      step "Registry list already empty for '${app}'; skipping revision deactivation."
      continue
    fi

    local revisions
    # Pipe through tr -d '\r' to strip Windows-style carriage returns from az CLI
    # TSV output.  Without this, revision names on Windows contain a trailing \r
    # that makes az containerapp revision deactivate fail with "Bad Request -
    # Invalid URL" and corrupts the step messages printed to the terminal.
    if ! revisions=$(az containerapp revision list \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${app}" \
      --query "[?properties.active].name" \
      -o tsv 2>/dev/null | tr -d '\r'); then
      warn "Failed to list active revisions for '${app}'. Skipping revision deactivation; subsequent deploy may fail with ContainerAppRegistryInUse."
      continue
    fi

    if [[ -z "${revisions}" ]]; then
      continue
    fi

    # Build an array to iterate revisions and apply the preservation logic below.
    local -a revisions_array=()
    while IFS= read -r rev; do
      [[ -z "${rev}" ]] && continue
      revisions_array+=("${rev}")
    done <<< "${revisions}"

    if (( ${#revisions_array[@]} == 0 )); then
      continue
    fi

    # Identify the revision currently serving live traffic (weight > 0) so we
    # preserve the right one and avoid unexpected downtime.  Using the ingress
    # traffic config (same approach as cd.yml) is correct even when traffic was
    # previously pinned to an older revision after a rollback.
    local live_revision
    live_revision=$(az containerapp show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${app}" \
      --query 'properties.configuration.ingress.traffic[?weight>`0`].revisionName | [0]' \
      -o tsv 2>/dev/null | tr -d '\r' || echo "")

    # Preserve the live-traffic revision only when there are 2+ active
    # revisions AND we can identify which one is serving traffic.  With a
    # single active revision, or when no live-traffic revision is found, all
    # revisions are deactivated — brief downtime is accepted because Bicep
    # brings the app back online immediately with the new revision, and leaving
    # any ACR-referencing revision active would cause ContainerAppRegistryInUse.
    local protected_revision=""
    if (( ${#revisions_array[@]} > 1 )) && [[ -n "${live_revision}" ]]; then
      protected_revision="${live_revision}"
      step "Deactivating active revisions of '${app}' to allow registry update, preserving '${protected_revision}' (live traffic) to keep the app online..."
    else
      step "Deactivating active revisions of '${app}' to allow registry update (brief downtime expected)..."
    fi

    local current_revision
    for current_revision in "${revisions_array[@]}"; do
      if [[ -n "${protected_revision}" && "${current_revision}" == "${protected_revision}" ]]; then
        step "Preserved active revision (not deactivated): ${current_revision}"
        continue
      fi

      az containerapp revision deactivate \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${app}" \
        --revision "${current_revision}" \
        --output none
      step "Deactivated: ${current_revision}"
    done
  done
}

# ── Step 6: Deploy Bicep infrastructure ────────────────────────────────────────
deploy_infrastructure() {
  local mode_label=""
  [[ "${WHAT_IF}" == "true" ]] && mode_label=" (what-if — no changes applied)"
  info "Deploying Bicep infrastructure${mode_label}..."

  # Deactivate stale Container App revisions that still reference the old ACR.
  # This prevents the ContainerAppRegistryInUse error when Bicep updates the
  # registry list (e.g. switching from the old ACR to [] for placeholder images
  # on a re-run).  Deactivation is skipped in what-if mode and guarded per app
  # — see deactivate_container_app_revisions() for details.
  if [[ "${WHAT_IF}" == "false" ]]; then
    deactivate_container_app_revisions
  fi

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
    CLIENT_URL=$(az deployment group show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${deployment_name}" \
      --query "properties.outputs.clientUrl.value" \
      -o tsv 2>/dev/null || echo "")
    pg_fqdn=$(az deployment group show \
      --resource-group "${RESOURCE_GROUP}" \
      --name "${deployment_name}" \
      --query "properties.outputs.postgresFqdn.value" \
      -o tsv 2>/dev/null || echo "")

    step "ACR:         ${REGISTRY_LOGIN_SERVER}"
    step "API URL:     ${api_url}"
    step "Client URL:  ${CLIENT_URL}"
    step "PostgreSQL:  ${pg_fqdn}"

    # ── Auto-resolve CORS_ORIGIN after first deploy ──────────────────────────
    # On first deploy CORS_ORIGIN is empty because the frontend URL is not
    # known until Bicep has created the Container App.  Now that we have the
    # client URL, update the API container's CORS_ORIGIN env var so the backend
    # accepts requests from the frontend.  This is a belt-and-suspenders
    # measure — nginx reverse-proxies /api requests so browsers see same-origin
    # traffic, but an explicit CORS whitelist avoids surprises if the proxy is
    # misconfigured or the frontend is accessed via a different URL.
    if [[ -z "${CORS_ORIGIN:-}" && -n "${CLIENT_URL:-}" ]]; then
      CORS_ORIGIN="${CLIENT_URL}"
      step "CORS_ORIGIN auto-resolved from deployment output: ${CORS_ORIGIN}"

      local api_app_name="ca-nova-circle-${ENVIRONMENT}"
      step "Updating CORS_ORIGIN on API container (${api_app_name})..."
      az containerapp update \
        --name "${api_app_name}" \
        --resource-group "${RESOURCE_GROUP}" \
        --set-env-vars "CORS_ORIGIN=${CORS_ORIGIN}" \
        --output none \
        || warn "Could not update CORS_ORIGIN on API container. Set it manually or re-run bootstrap."
    fi
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

  # URL-encode the password so special characters don't break the connection
  # string when it is parsed by pg's URL parser (new URL()).
  if [[ -z "${POSTGRES_ADMIN_PASSWORD:-}" ]]; then
    die "POSTGRES_ADMIN_PASSWORD is not set — cannot construct migration connection string."
  fi
  local encoded_pw
  # URL-encode the password byte-by-byte so this step works on Linux, macOS,
  # and Windows Git Bash without requiring Python.  LC_ALL=C is set for the
  # duration of the loop to ensure byte-wise (not character-wise) iteration,
  # which is required for RFC 3986-correct percent-encoding of non-ASCII
  # passwords in multi-byte (e.g. UTF-8) locales.
  # Only RFC 3986 unreserved characters (letters, digits, ~, _, ., -) are left
  # unencoded; everything else is percent-encoded.
  encoded_pw=""
  local _i _c _hex _saved_lc_all="${LC_ALL:-}"
  LC_ALL=C
  for (( _i = 0; _i < ${#POSTGRES_ADMIN_PASSWORD}; _i++ )); do
    _c="${POSTGRES_ADMIN_PASSWORD:${_i}:1}"
    case "${_c}" in
      [a-zA-Z0-9~_.-]) encoded_pw+="${_c}" ;;
      *) printf -v _hex '%02X' "'${_c}"; encoded_pw+="%${_hex}" ;;
    esac
  done
  LC_ALL="${_saved_lc_all}"
  DATABASE_URL="postgresql://${pg_admin_user}:${encoded_pw}@${pg_fqdn}:5432/${pg_db}?sslmode=require"

  # Detect current IP address for the temporary firewall rule
  local runner_ip
  runner_ip=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null \
    || curl -s --max-time 10 https://ifconfig.me 2>/dev/null \
    || die "Could not determine current IP address for PostgreSQL firewall rule.")

  step "Opening PostgreSQL firewall for IP: ${runner_ip}"
  # Note: public network access is controlled by Bicep (always Enabled so that
  # firewall rules take effect). Bootstrap must not change that setting — only
  # the AllowAllAzureServicesAndResourcesWithinAzureIps rule (0.0.0.0/0.0.0.0)
  # persists after this script completes.  The bootstrap-runner rule is
  # temporary and is always removed before the script exits.
  az postgres flexible-server firewall-rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${PG_SERVER_NAME}" \
    --rule-name "bootstrap-runner" \
    --start-ip-address "${runner_ip}" \
    --end-ip-address "${runner_ip}" \
    --output none
  PG_FIREWALL_ADDED=true

  step "Waiting 30s for firewall rule to propagate..."
  sleep 30

  step "Installing Node dependencies..."
  (cd "${REPO_ROOT}" && npm ci)

  step "Running: npm run migrate"
  local migrate_attempt=0
  while true; do
    migrate_attempt=$((migrate_attempt + 1))
    if (cd "${REPO_ROOT}" && DATABASE_URL="${DATABASE_URL}" npm run migrate); then
      break
    fi
    if [[ $migrate_attempt -ge 5 ]]; then
      die "Migration failed after ${migrate_attempt} attempts. Verify PostgreSQL is accessible from IP ${runner_ip} and that the server '${PG_SERVER_NAME}' exists."
    fi
    warn "Migration attempt ${migrate_attempt}/5 failed — firewall rule may still be propagating. Retrying in 30s..."
    sleep 30
  done
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

  # ── Resolve CORS_ORIGIN ────────────────────────────────────────────────────
  # 1. Use value passed via --cors-origin or env var (already in CORS_ORIGIN).
  # 2. Fall back to the clientUrl captured from the Bicep deployment output.
  # 3. Fall back to querying the frontend Container App FQDN directly from Azure.
  # 4. Prompt explicitly if still unknown.
  if [[ -z "${CORS_ORIGIN:-}" && -n "${CLIENT_URL:-}" ]]; then
    CORS_ORIGIN="${CLIENT_URL}"
    step "CORS_ORIGIN resolved from deployment output: ${CORS_ORIGIN}"
  fi

  if [[ -z "${CORS_ORIGIN:-}" ]]; then
    # Container App name follows the convention defined in container-app-frontend.bicep:
    # var appName = 'ca-nova-circle-client-${environmentName}'
    local frontend_app_name="ca-nova-circle-client-${ENVIRONMENT}"
    local detected_fqdn
    detected_fqdn=$(az containerapp show \
      --name "${frontend_app_name}" \
      --resource-group "${RESOURCE_GROUP}" \
      --query "properties.configuration.ingress.fqdn" \
      -o tsv 2>/dev/null || echo "")
    if [[ -n "${detected_fqdn}" ]]; then
      CORS_ORIGIN="https://${detected_fqdn}"
      step "CORS_ORIGIN resolved from Container App ingress: ${CORS_ORIGIN}"
    fi
  fi

  if [[ -z "${CORS_ORIGIN:-}" ]]; then
    warn "CORS_ORIGIN could not be determined automatically."
    warn "This is the frontend URL that the API will accept cross-origin requests from."
    warn "Example: https://ca-nova-circle-client-${ENVIRONMENT}.<hash>.${LOCATION}.azurecontainerapps.io"
    read -r -p "  Enter CORS_ORIGIN (frontend URL): " CORS_ORIGIN
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
  if [[ -n "${API_APP_OBJECT_ID:-}" && "${API_APP_OBJECT_ID}" != "None" ]]; then
    gh variable set API_AZURE_OBJECT_ID       --repo "${repo}" --body "${API_APP_OBJECT_ID}"
  else
    warn "API_APP_OBJECT_ID is not set — skipping API_AZURE_OBJECT_ID variable. The CD workflow will fail to manage SPA redirect URIs until this is populated. Re-run bootstrap.sh to fix."
  fi
  if [[ -n "${CORS_ORIGIN:-}" ]]; then
    gh variable set CORS_ORIGIN               --repo "${repo}" --body "${CORS_ORIGIN}"
  else
    warn "Skipping CORS_ORIGIN variable — value is empty. Set it manually in GitHub repository variables."
  fi

  # ── Repository secrets (encrypted at rest) ────────────────────────────────
  step "Setting repository secrets..."
  gh secret set POSTGRES_ADMIN_PASSWORD --repo "${repo}" --body "${POSTGRES_ADMIN_PASSWORD}"

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
    echo    "  2. Expose OAuth2 scopes on the API app registration if JWT auth is"
    echo    "     needed (e.g. user_impersonation) for your client apps:"
    local tenant_portal_url="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${API_APP_ID:-}"
    echo    "     ${tenant_portal_url}"
    echo    ""
    echo    "  3. Push or merge a change to 'main' to trigger the first CD run."
  else
    echo -e "  ${YELLOW}${BOLD}Required next steps:${RESET}"
    echo    ""
    echo    "  1. Configure GitHub variables and secrets (see docs/cd.md)."
    echo    "  2. Add required reviewers to the 'production' environment."
    echo    "  3. Expose OAuth2 scopes on the API app registration if JWT auth is needed."
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
