# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

locals {
  # Compute is a documented Cloud Run functions dependency and supplies the
  # Google-managed default identity still inspected by Firebase trigger deploys.
  required_apis = toset([
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "eventarc.googleapis.com",
    "eventarcpublishing.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappcheck.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaseinstallations.googleapis.com",
    "firebaseremoteconfig.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "maps-backend.googleapis.com",
    "pubsub.googleapis.com",
    "recaptchaenterprise.googleapis.com",
    "run.googleapis.com",
    "securetoken.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
  ])

  # Read-only functions receive viewer roles; Firestore writers receive
  # datastore.user; only applyUserManagement can mutate Firebase Auth users.
  # Event-driven identities also invoke their own Cloud Run service and receive
  # events; run.invoker must be project-scoped until Firebase can bind it per service.
  runtime_accounts = {
    GET_MY_AUTHORIZATION_SERVICE_ACCOUNT = {
      account_id   = "get-my-authorization"
      display_name = "Get authorization Function"
      roles        = ["roles/datastore.viewer", "roles/firebaseauth.viewer"]
    }
    SEARCH_USERS_SERVICE_ACCOUNT = {
      account_id   = "search-users"
      display_name = "Search users Function"
      roles        = ["roles/datastore.viewer", "roles/firebaseauth.viewer"]
    }
    REVEAL_USER_EMAIL_SERVICE_ACCOUNT = {
      account_id   = "reveal-user-email"
      display_name = "Reveal user email Function"
      roles        = ["roles/datastore.viewer", "roles/firebaseauth.viewer"]
    }
    SAVE_MY_PROFILE_SERVICE_ACCOUNT = {
      account_id   = "save-my-profile"
      display_name = "Save profile Function"
      roles        = ["roles/datastore.user", "roles/firebaseauth.viewer"]
    }
    APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT = {
      account_id   = "apply-user-management"
      display_name = "Apply user management Function"
      roles        = ["roles/datastore.user", "roles/firebaseauth.editor"]
    }
    GET_USER_AUDIT_HISTORY_SERVICE_ACCOUNT = {
      account_id   = "get-user-audit-history"
      display_name = "Get audit history Function"
      # Reads can complete a pending cross-system audit operation, so this
      # identity needs Firestore writes on that recovery path.
      roles = ["roles/datastore.user", "roles/firebaseauth.viewer"]
    }
    RECORD_ACCOUNT_CREATION_SERVICE_ACCOUNT = {
      account_id   = "record-account-creation"
      display_name = "Record account creation Function"
      roles = [
        "roles/datastore.user",
        "roles/eventarc.eventReceiver",
        "roles/run.invoker",
      ]
    }
    REPORT_REVIEW_SERVICE_ACCOUNT = {
      account_id   = "report-review"
      display_name = "Report review Function"
      roles        = ["roles/datastore.user", "roles/firebaseauth.viewer"]
    }
    MODERATE_REVIEW_SERVICE_ACCOUNT = {
      account_id   = "moderate-review"
      display_name = "Moderate review Function"
      roles        = ["roles/datastore.user", "roles/firebaseauth.viewer"]
    }
    LOAD_REVIEW_MODERATION_QUEUE_SERVICE_ACCOUNT = {
      account_id   = "load-review-moderation-queue"
      display_name = "Load review queue Function"
      roles        = ["roles/datastore.viewer", "roles/firebaseauth.viewer"]
    }
    PROCESS_REVIEW_REVISION_SERVICE_ACCOUNT = {
      account_id   = "process-review-revision"
      display_name = "Process review revision Function"
      roles = [
        "roles/datastore.user",
        "roles/eventarc.eventReceiver",
        "roles/run.invoker",
      ]
    }
    PROCESS_REVIEW_RATING_SERVICE_ACCOUNT = {
      account_id   = "process-review-rating"
      display_name = "Process review rating Function"
      roles = [
        "roles/datastore.user",
        "roles/eventarc.eventReceiver",
        "roles/run.invoker",
      ]
    }
  }

  runtime_role_memberships = {
    for membership in flatten([
      for parameter, account in local.runtime_accounts : [
        for role in account.roles : {
          key       = "${parameter}:${role}"
          parameter = parameter
          role      = role
        }
      ]
    ]) : membership.key => membership
  }

  # Project-level roles needed by direct Terraform execution and by Firebase CLI.
  # The bootstrap grants project IAM administration with a condition that limits
  # policy changes to this exact set and the runtime roles above.
  deployment_roles = toset([
    "roles/cloudfunctions.admin",
    "roles/datastore.indexAdmin",
    "roles/firebasehosting.admin",
    "roles/firebaserules.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/serviceusage.apiKeysViewer",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/serviceusage.serviceUsageConsumer",
  ])
}

resource "google_project_service" "required" {
  for_each = local.required_apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  for_each = local.runtime_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name
  description  = "Dedicated least-privilege runtime identity for ${each.key}."

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "runtime" {
  for_each = local.runtime_role_memberships

  project = var.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.runtime[each.value.parameter].email}"
}

resource "google_project_iam_member" "deployment" {
  for_each = local.deployment_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${var.deployment_service_account_email}"

  depends_on = [google_project_service.required]
}

resource "google_service_account_iam_member" "deployment_can_use_runtime" {
  for_each = google_service_account.runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployment_service_account_email}"
}

# Firebase CLI checks this legacy default identity before every Functions deploy.
# Keep the project-level grant constrained to that single service account.
resource "google_project_iam_member" "deployment_can_use_app_engine_default" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${var.deployment_service_account_email}"

  condition {
    title       = "firebase-functions-default-service-account"
    description = "Allow Firebase CLI to validate the legacy Functions identity."
    expression  = "resource.name == \"projects/-/serviceAccounts/${var.project_id}@appspot.gserviceaccount.com\""
  }
}
