// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// @ts-check

import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_EXTENSION = /\.[cm]?[jt]sx?$/iu;

/** @param {string} path */
function caseFold(path) {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

/** @param {string[]} paths */
export function findModulePathCollisions(paths) {
  const errors = [];
  const exactPaths = new Map();
  const modulePaths = new Map();

  for (const path of paths) {
    const exactKey = caseFold(path);
    const exactMatch = exactPaths.get(exactKey);
    if (exactMatch !== undefined && exactMatch !== path) {
      errors.push(`${exactMatch} and ${path} differ only by case`);
    } else {
      exactPaths.set(exactKey, path);
    }

    if (!MODULE_EXTENSION.test(path)) continue;
    const moduleKey = caseFold(path.replace(MODULE_EXTENSION, ""));
    const moduleMatch = modulePaths.get(moduleKey);
    if (
      moduleMatch !== undefined &&
      moduleMatch !== path &&
      caseFold(extname(moduleMatch)) !== caseFold(extname(path))
    ) {
      errors.push(
        `${moduleMatch} and ${path} resolve to the same case-insensitive extensionless module path`,
      );
    } else {
      modulePaths.set(moduleKey, path);
    }
  }

  return errors;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = findModulePathCollisions(trackedFiles());
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("No case-insensitive module path collisions found.");
  }
}
