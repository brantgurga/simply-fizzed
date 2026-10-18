#!/usr/bin/env bash
# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/bootstrap-firebase-project.sh PROJECT_ID [options]

Options:
  --billing-account BILLING_ACCOUNT_ID  Link billing when supplied.
  --state-location LOCATION             State bucket location (default: US).
  -h, --help                            Show this help.
USAGE
}

[[ $# -gt 0 ]] || {
  usage
  exit 2
}

project_id=""
billing_account=""
state_location="US"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --billing-account)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--billing-account requires a value" >&2
        exit 2
      }
      billing_account=$2
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

for command in firebase gcloud jq; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

readonly project_id billing_account state_location
readonly state_bucket="${project_id}-terraform-state"
readonly deployer_email="github-deployer@${project_id}.iam.gserviceaccount.com"
readonly pool_id="github"
readonly provider_id="simply-fizzed"
readonly repository_id="1320193089"

if ! gcloud projects describe "$project_id" --format="value(projectId)" >/dev/null 2>&1; then
  gcloud projects create "$project_id" --name="$project_id"
fi
gcloud config set project "$project_id" >/dev/null

if [[ -n "$billing_account" ]]; then
  current_billing=$(
    gcloud billing projects describe "$project_id" --format="value(billingAccountName)" 2>/dev/null || true
  )
  if [[ "$current_billing" != "billingAccounts/$billing_account" ]]; then
    gcloud billing projects link "$project_id" --billing-account="$billing_account"
  fi
fi

gcloud services enable \
  firebase.googleapis.com \
  firestore.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  sts.googleapis.com \
  storage.googleapis.com \
  --project="$project_id"

if ! firebase projects:list --json --non-interactive |
  jq -e --arg project_id "$project_id" '.result[]? | select(.projectId == $project_id)' \
    >/dev/null; then
  firebase projects:addfirebase "$project_id" --non-interactive
fi

if ! gcloud firestore databases describe --database="(default)" \
  --project="$project_id" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database="(default)" \
    --edition=standard \
    --location=us-central1 \
    --project="$project_id" \
    --type=firestore-native
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

if ! gcloud iam workload-identity-pools describe "$pool_id" \
  --project="$project_id" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool_id" \
    --project="$project_id" \
    --location=global \
    --display-name="GitHub Actions"
fi

attribute_mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref"
attribute_condition='assertion.repository_id == "1320193089" && assertion.ref == "refs/heads/main" && assertion.workflow_ref == "brantgurga/simply-fizzed/.github/workflows/firebase-hosting.yml@refs/heads/main"'
provider_common=(
  --project="$project_id"
  --location=global
  --workload-identity-pool="$pool_id"
  --issuer-uri="https://token.actions.githubusercontent.com"
  --attribute-mapping="$attribute_mapping"
  --attribute-condition="$attribute_condition"
)
if gcloud iam workload-identity-pools providers describe "$provider_id" \
  --project="$project_id" --location=global --workload-identity-pool="$pool_id" \
  >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$provider_id" \
    "${provider_common[@]}"
else
  gcloud iam workload-identity-pools providers create-oidc "$provider_id" \
    --display-name="Simply Fizzed CD" \
    "${provider_common[@]}"
fi

if ! gcloud iam service-accounts describe "$deployer_email" \
  --project="$project_id" >/dev/null 2>&1; then
  gcloud iam service-accounts create github-deployer \
    --project="$project_id" \
    --display-name="GitHub Firebase deployer" \
    --description="Keyless identity for the repository Firebase and Terraform workflow."
fi

readonly -a deployment_roles=(
  roles/cloudfunctions.admin
  roles/datastore.indexAdmin
  roles/firebasehosting.admin
  roles/firebaserules.admin
  roles/iam.serviceAccountAdmin
  roles/resourcemanager.projectIamAdmin
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

gcloud storage buckets add-iam-policy-binding "gs://$state_bucket" \
  --member="serviceAccount:$deployer_email" \
  --role="roles/storage.objectAdmin" \
  --condition=None \
  --quiet >/dev/null

project_number=$(gcloud projects describe "$project_id" --format="value(projectNumber)")
readonly project_number
readonly github_principal="principalSet://iam.googleapis.com/projects/${project_number}/locations/global/workloadIdentityPools/${pool_id}/attribute.repository_id/${repository_id}"
gcloud iam service-accounts add-iam-policy-binding "$deployer_email" \
  --project="$project_id" \
  --member="$github_principal" \
  --role="roles/iam.workloadIdentityUser" \
  --condition=None \
  --quiet >/dev/null

provider_name=$(gcloud iam workload-identity-pools providers describe "$provider_id" \
  --project="$project_id" \
  --location=global \
  --workload-identity-pool="$pool_id" \
  --format="value(name)")
cat <<SUMMARY
Bootstrap complete.
Project: $project_id
Terraform state bucket: gs://$state_bucket
Deployment service account: $deployer_email
GCP_WORKLOAD_IDENTITY_PROVIDER: $provider_name
SUMMARY
