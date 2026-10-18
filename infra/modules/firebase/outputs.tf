# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

output "function_service_accounts" {
  description = "Runtime service-account emails keyed by Firebase Functions parameter name."
  value = {
    for parameter, account in google_service_account.runtime : parameter => account.email
  }
}

output "enabled_apis" {
  description = "Public Google Cloud APIs intentionally managed by this module."
  value       = sort(tolist(local.required_apis))
}

output "deployment_service_account_email" {
  description = "Bootstrap-owned deployment identity configured by this module."
  value       = var.deployment_service_account_email
}
