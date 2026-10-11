// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import fs from "node:fs";
import process from "node:process";
import { TSDocConfiguration, TSDocParser } from "@microsoft/tsdoc";

const ignoredDirectories = new Set([".git", "coverage", "dist", "lib", "node_modules"]);
const roots = process.argv.length > 2 ? process.argv.slice(2) : ["."];
const files = process.argv.slice(2, 2);

/** Add TypeScript sources below a file or directory to the validation set. */
function collectTypeScriptSources(path = ".") {
  const stats = fs.statSync(path);
  if (stats.isDirectory()) {
    const directoryName = path.split("/").at(-1);
    if (directoryName !== undefined && ignoredDirectories.has(directoryName)) return;
    for (const entry of fs.readdirSync(path).toSorted()) {
      collectTypeScriptSources(`${path}/${entry}`);
    }
    return;
  }
  if (/\.(?:ts|tsx)$/u.test(path)) files.push(path);
}

for (const root of roots) collectTypeScriptSources(root);

const configuration = new TSDocConfiguration();
configuration.setSupportForTags(configuration.tagDefinitions, true);
configuration.validation.ignoreUndefinedTags = false;
configuration.validation.reportUnsupportedTags = true;
const parser = new TSDocParser(configuration);
const failures = [];

for (const file of files) {
  const sourceText = fs.readFileSync(file, "utf8");
  for (const match of sourceText.matchAll(/\/\*\*[\s\S]*?\*\//gu)) {
    const comment = match[0];
    const line = sourceText.slice(0, match.index).split("\n").length;
    const context = parser.parseString(comment);
    for (const message of context.log.messages) {
      failures.push(`${file}:${line}: ${message.text}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Strict TSDoc validation passed for ${files.length} file(s).`);
}
