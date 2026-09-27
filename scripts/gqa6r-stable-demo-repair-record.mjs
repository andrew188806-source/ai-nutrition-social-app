#!/usr/bin/env node
// Regenerates the GQA-6R exact successor record (path -> LF SHA-256) from the current product delta since
// the predecessor. Run once when the repair bytes are final; the guard then pins exactly these bytes.
import fs from "node:fs";
import path from "node:path";
import { collectGqa6rRepairEvidence } from "./gqa6r-stable-demo-repair-manifest.mjs";

const root = process.cwd();
const manifest = path.join(root, "scripts/gqa6r-stable-demo-repair-manifest.mjs");
const evidence = collectGqa6rRepairEvidence(root);
if (!evidence.predecessorInHistory) throw new Error("predecessor not in history");
const entries = evidence.productDelta.sort().map((file) => {
  if (evidence.sha256[file] === null) throw new Error(`deleted product path is not part of this repair: ${file}`);
  return `  ${JSON.stringify(file)}: ${JSON.stringify(evidence.sha256[file])}`;
});
const block = `// GQA6R-RECORD-BEGIN\nexport const GQA6R_PRODUCT_SHA256 = Object.freeze({\n${entries.join(",\n")}\n});\n// GQA6R-RECORD-END`;
const source = fs.readFileSync(manifest, "utf8");
const next = source.replace(/\/\/ GQA6R-RECORD-BEGIN[\s\S]*?\/\/ GQA6R-RECORD-END/, block);
fs.writeFileSync(manifest, next);
console.log(`recorded ${entries.length} product paths`);
