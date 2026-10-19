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

variable "import_existing_production_resources" {
  description = "Adopt the Firestore database and twelve runtime identities from production."
  type        = bool
  default     = false
}
