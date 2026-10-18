# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

provider "google" {
  project = var.project_id
}

module "firebase" {
  source = "../../modules/firebase"

  project_id                       = var.project_id
  deployment_service_account_email = "github-deployer@${var.project_id}.iam.gserviceaccount.com"
}
