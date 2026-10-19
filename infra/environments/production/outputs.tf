# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

output "function_service_accounts" {
  description = "Runtime identities consumed by the Firebase Functions deployment."
  value       = module.firebase.function_service_accounts
}

output "enabled_apis" {
  description = "Public Google Cloud APIs managed for production."
  value       = module.firebase.enabled_apis
}

output "deployment_service_account_email" {
  description = "Keyless GitHub deployment identity."
  value       = module.firebase.deployment_service_account_email
}
