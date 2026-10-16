#!/usr/bin/env bash
# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

set -euo pipefail

readonly project="simply-fizzed-prod"
readonly full_targets="functions,firestore:rules,firestore:indexes"
readonly retry_policy_error="Pass the --force option to deploy functions with a failure policy"
# Add a Function export here in the same change that first enables its retry policy.
readonly -a retry_bootstrap_functions=(
  recordAccountCreation
  processReviewRevision
  processReviewRating
)

deploy_log=$(mktemp "${RUNNER_TEMP:-/tmp}/firebase-deploy.XXXXXX.log")
trap 'rm -f "$deploy_log"' EXIT

deploy() {
  npx --no-install firebase deploy --project "$project" --non-interactive "$@"
}

if deploy --only "$full_targets" 2>&1 | tee "$deploy_log"; then
  exit 0
else
  deploy_status=$?
fi

if ! grep -Fq "$retry_policy_error" "$deploy_log"; then
  exit "$deploy_status"
fi

bootstrap_targets=$(printf 'functions:%s,' "${retry_bootstrap_functions[@]}")
deploy --only "${bootstrap_targets%,}" --force
deploy --only "$full_targets"
