# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

variable "project_id" {
  description = "Google Cloud project that hosts the Firebase environment."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid 6-30 character Google Cloud project ID."
  }
}

variable "deployment_service_account_email" {
  description = "Bootstrap-owned service account used by the Firebase deployment workflow."
  type        = string

  validation {
    condition = endswith(
      var.deployment_service_account_email,
      "@${var.project_id}.iam.gserviceaccount.com",
    )
    error_message = "deployment_service_account_email must belong to project_id."
  }
}
