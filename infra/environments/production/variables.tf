# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

variable "project_id" {
  description = "Google Cloud/Firebase project ID for production."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid 6-30 character Google Cloud project ID."
  }
}

variable "import_existing_runtime_service_accounts" {
  description = "Adopt the twelve runtime identities from the existing production deployment."
  type        = bool
  default     = false
}
