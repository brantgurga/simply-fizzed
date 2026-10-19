#!/usr/bin/env bash
# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/bootstrap-firebase-project.sh PROJECT_ID [options]

Options:
  --workload-identity-provider RESOURCE  Existing provider resource name (required).
  --billing-account BILLING_ACCOUNT_ID   Link billing when supplied.
  --organization ORGANIZATION_ID         Create a new project under this organization.
  --folder FOLDER_ID                     Create a new project under this folder.
  --state-location LOCATION              State bucket location (default: US).
  -h, --help                             Show this help.
USAGE
}

[[ $# -gt 0 ]] || {
  usage
  exit 2
}

project_id=""
billing_account=""
organization_id=""
folder_id=""
state_location="US"
workload_identity_provider=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workload-identity-provider)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--workload-identity-provider requires a value" >&2
        exit 2
      }
      workload_identity_provider=$2
      shift 2
      ;;
    --billing-account)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--billing-account requires a value" >&2
        exit 2
      }
      billing_account=$2
      shift 2
      ;;
    --organization)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--organization requires a value" >&2
        exit 2
      }
      organization_id=$2
      shift 2
      ;;
    --folder)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--folder requires a value" >&2
        exit 2
      }
      folder_id=$2
      shift 2
      ;;
    --state-location)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--state-location requires a value" >&2
        exit 2
      }
      state_location=$2
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      [[ -z "$project_id" ]] || {
        echo "Only one PROJECT_ID may be supplied" >&2
        exit 2
      }
      project_id=$1
      shift
      ;;
  esac
done

[[ "$project_id" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || {
  echo "PROJECT_ID must be a valid 6-30 character Google Cloud project ID" >&2
  exit 2
}
[[ "$state_location" =~ ^[A-Za-z0-9-]+$ ]] || {
  echo "State bucket location contains unsupported characters" >&2
  exit 2
}
[[ -z "$billing_account" || "$billing_account" =~ ^[0-9A-Za-z]{6}-[0-9A-Za-z]{6}-[0-9A-Za-z]{6}$ ]] || {
  echo "Billing account must have the form 000000-000000-000000" >&2
  exit 2
}
[[ -z "$organization_id" || "$organization_id" =~ ^[0-9]+$ ]] || {
  echo "Organization ID must contain only digits" >&2
  exit 2
}
[[ -z "$folder_id" || "$folder_id" =~ ^[0-9]+$ ]] || {
  echo "Folder ID must contain only digits" >&2
  exit 2
}
[[ -z "$organization_id" || -z "$folder_id" ]] || {
  echo "Use only one of --organization or --folder" >&2
  exit 2
}
if [[ "$workload_identity_provider" =~ ^projects/([0-9]+)/locations/global/workloadIdentityPools/([^/]+)/providers/([^/]+)$ ]]; then
  identity_project_number=${BASH_REMATCH[1]}
  workload_identity_pool=${BASH_REMATCH[2]}
else
  echo "--workload-identity-provider must be a full global provider resource name" >&2
  exit 2
fi

for command in firebase gcloud jq; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

readonly project_id billing_account organization_id folder_id state_location
readonly workload_identity_provider identity_project_number workload_identity_pool
readonly state_bucket="${project_id}-terraform-state"
readonly deployer_email="github-deployer@${project_id}.iam.gserviceaccount.com"
readonly database_role_id="terraformFirestoreAdmin"
readonly database_role="projects/${project_id}/roles/${database_role_id}"
readonly repository_id="1320193089"

if ! gcloud projects describe "$project_id" --format="value(projectId)" >/dev/null 2>&1; then
  project_create_args=(--name="$project_id")
  if [[ -n "$organization_id" ]]; then
    project_create_args+=(--organization="$organization_id")
  elif [[ -n "$folder_id" ]]; then
    project_create_args+=(--folder="$folder_id")
  fi
  gcloud projects create "$project_id" "${project_create_args[@]}"
fi

if [[ -n "$billing_account" ]]; then
  current_billing=$(
    gcloud billing projects describe "$project_id" --format="value(billingAccountName)" 2>/dev/null || true
  )
  if [[ "$current_billing" != "billingAccounts/$billing_account" ]]; then
    gcloud billing projects link "$project_id" --billing-account="$billing_account"
  fi
fi

# Enable only the APIs needed to create Terraform's backend and deployment
# identity. Terraform owns all application API enablement.
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  --project="$project_id"

if ! firebase projects:list --json --non-interactive |
  jq -e --arg project_id "$project_id" '.result[]? | select(.projectId == $project_id)' \
    >/dev/null; then
  firebase projects:addfirebase "$project_id" --non-interactive
fi

if ! gcloud storage buckets describe "gs://$state_bucket" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$state_bucket" \
    --project="$project_id" \
    --location="$state_location" \
    --public-access-prevention \
    --uniform-bucket-level-access
fi
gcloud storage buckets update "gs://$state_bucket" \
  --project="$project_id" \
  --public-access-prevention \
  --uniform-bucket-level-access \
  --versioning

if ! gcloud iam service-accounts describe "$deployer_email" \
  --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create github-deployer \
    --project="$project_id" \
    --display-name="GitHub Firebase deployer" \
    --description="Keyless identity for the repository Firebase and Terraform workflow."
fi

readonly -a database_role_permissions=(
  datastore.databases.create
  datastore.databases.getMetadata
  datastore.databases.update
  datastore.locations.get
  datastore.locations.list
  datastore.operations.get
)
printf -v database_permissions "%s," "${database_role_permissions[@]}"
database_permissions="${database_permissions%,}"
readonly database_permissions
if gcloud iam roles describe "$database_role_id" --project="$project_id" >/dev/null 2>&1; then
  gcloud iam roles update "$database_role_id" \
    --project="$project_id" \
    --permissions="$database_permissions" \
    --stage=GA
else
  gcloud iam roles create "$database_role_id" \
    --project="$project_id" \
    --title="Terraform Firestore database administrator" \
    --description="Create and configure Firestore databases without entity access." \
    --permissions="$database_permissions" \
    --stage=GA
fi

readonly -a deployment_roles=(
  "$database_role"
  roles/cloudfunctions.admin
  roles/datastore.indexAdmin
  roles/firebasehosting.admin
  roles/firebaserules.admin
  roles/iam.serviceAccountAdmin
  roles/serviceusage.apiKeysViewer
  roles/serviceusage.serviceUsageAdmin
  roles/serviceusage.serviceUsageConsumer
)
for role in "${deployment_roles[@]}"; do
  gcloud projects add-iam-policy-binding "$project_id" \
    --member="serviceAccount:$deployer_email" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# Terraform needs projects.setIamPolicy for additive member resources, but must
# not be able to grant arbitrary roles. modifiedGrantsByRole restricts every
# policy mutation to roles owned by this module and excludes projectIamAdmin.
readonly -a terraform_managed_project_roles=(
  "$database_role"
  roles/cloudfunctions.admin
  roles/datastore.indexAdmin
  roles/datastore.user
  roles/datastore.viewer
  roles/eventarc.eventReceiver
  roles/firebaseauth.editor
  roles/firebaseauth.viewer
  roles/firebasehosting.admin
  roles/firebaserules.admin
  roles/iam.serviceAccountAdmin
  roles/iam.serviceAccountUser
  roles/run.invoker
  roles/serviceusage.apiKeysViewer
  roles/serviceusage.serviceUsageAdmin
  roles/serviceusage.serviceUsageConsumer
)
printf -v managed_roles "'%s'," "${terraform_managed_project_roles[@]}"
managed_roles="${managed_roles%,}"
readonly managed_roles
readonly iam_condition="api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly([$managed_roles])"
gcloud projects remove-iam-policy-binding "$project_id" \
  --member="serviceAccount:$deployer_email" \
  --role="roles/resourcemanager.projectIamAdmin" \
  --condition=None \
  --quiet >/dev/null 2>&1 || true
gcloud projects add-iam-policy-binding "$project_id" \
  --member="serviceAccount:$deployer_email" \
  --role="roles/resourcemanager.projectIamAdmin" \
  --condition="^:^expression=$iam_condition:title=terraform-managed-roles:description=Restrict Terraform to its declared project roles" \
  --quiet >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://$state_bucket" \
  --member="serviceAccount:$deployer_email" \
  --role="roles/storage.objectAdmin" \
  --condition=None \
  --quiet >/dev/null

readonly github_principal="principalSet://iam.googleapis.com/projects/${identity_project_number}/locations/global/workloadIdentityPools/${workload_identity_pool}/attribute.repository_id/${repository_id}"
gcloud iam service-accounts add-iam-policy-binding "$deployer_email" \
  --project="$project_id" \
  --member="$github_principal" \
  --role="roles/iam.workloadIdentityUser" \
  --condition=None \
  --quiet >/dev/null

cat <<SUMMARY
Bootstrap complete.
Project: $project_id
Terraform state bucket: gs://$state_bucket
Deployment service account: $deployer_email
GCP_WORKLOAD_IDENTITY_PROVIDER: $workload_identity_provider
SUMMARY
