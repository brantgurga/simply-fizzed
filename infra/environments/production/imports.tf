# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

# These imports adopt only the twelve identities that predate Terraform in the
# existing production project. Future environment roots must not copy this file.
locals {
  production_runtime_account_ids = {
    GET_MY_AUTHORIZATION_SERVICE_ACCOUNT         = "get-my-authorization"
    SEARCH_USERS_SERVICE_ACCOUNT                 = "search-users"
    REVEAL_USER_EMAIL_SERVICE_ACCOUNT            = "reveal-user-email"
    SAVE_MY_PROFILE_SERVICE_ACCOUNT              = "save-my-profile"
    APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT        = "apply-user-management"
    GET_USER_AUDIT_HISTORY_SERVICE_ACCOUNT       = "get-user-audit-history"
    RECORD_ACCOUNT_CREATION_SERVICE_ACCOUNT      = "record-account-creation"
    REPORT_REVIEW_SERVICE_ACCOUNT                = "report-review"
    MODERATE_REVIEW_SERVICE_ACCOUNT              = "moderate-review"
    LOAD_REVIEW_MODERATION_QUEUE_SERVICE_ACCOUNT = "load-review-moderation-queue"
    PROCESS_REVIEW_REVISION_SERVICE_ACCOUNT      = "process-review-revision"
    PROCESS_REVIEW_RATING_SERVICE_ACCOUNT        = "process-review-rating"
  }
}

import {
  for_each = var.import_existing_runtime_service_accounts ? local.production_runtime_account_ids : {}

  to = module.firebase.google_service_account.runtime[each.key]
  id = "projects/${var.project_id}/serviceAccounts/${each.value}@${var.project_id}.iam.gserviceaccount.com"
}
