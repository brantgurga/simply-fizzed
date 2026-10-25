# Copyright (C) 2026 Brant Langer Gurganus
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE for copying terms.

tflint {
  required_version = "= 0.65.0"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "google" {
  enabled = true
  version = "0.41.0"
  source  = "github.com/terraform-linters/tflint-ruleset-google"
}

# Supplement the recommended preset with the Terraform rules that enforce
# maintainability and the standard module conventions used in this repository.
rule "terraform_comment_syntax" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_module_shallow_clone" {
  enabled = true
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_standard_module_structure" {
  enabled = true
}

rule "terraform_unused_required_providers" {
  enabled = true
}
