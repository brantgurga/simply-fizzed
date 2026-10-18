# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

terraform {
  # The bootstrap script creates the bucket. CI and local operators provide its
  # project-derived name with -backend-config during terraform init.
  backend "gcs" {}
}
