// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import fs from "node:fs";
import process from "node:process";
import { TSDocConfiguration, TSDocParser } from "@microsoft/tsdoc";

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("Provide at least one TypeScript source file.");

const configuration = new TSDocConfiguration();
configuration.validation.ignoreUndefinedTags = false;
configuration.validation.reportUnsupportedTags = true;
const parser = new TSDocParser(configuration);
const failures = [];

for (const file of files) {
  const sourceText = fs.readFileSync(file, "utf8");
  const declarations = [
    ...sourceText.matchAll(/export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/gu),
  ];
  const documented = new Map(
    [
      ...sourceText.matchAll(
        /(\/\*\*[\s\S]*?\*\/)\s*export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/gu,
      ),
    ].map((match) => [match[2], match[1]]),
  );

  for (const declaration of declarations) {
    const name = declaration[1];
    const comment = documented.get(name);
    if (comment === undefined) {
      failures.push(`${file}: ${name} is missing a TSDoc comment.`);
      continue;
    }

    const context = parser.parseString(comment);
    if (context.docComment.summarySection.nodes.length === 0) {
      failures.push(`${file}: ${name} has an empty TSDoc summary.`);
    }
    for (const message of context.log.messages) {
      failures.push(`${file}: ${name}: ${message.text}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Strict TSDoc validation passed for ${files.length} file(s).`);
}
