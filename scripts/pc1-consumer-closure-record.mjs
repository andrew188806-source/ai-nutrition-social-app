#!/usr/bin/env node
// Regenerates the PC-1 exact successor record (path -> LF SHA-256) from the current product delta since
// the predecessor. Run once when the PC-1 bytes are final; the guard then pins exactly these bytes.
import fs from "node:fs";
import path from "node:path";
import { collectPc1Evidence } from "./pc1-consumer-closure-manifest.mjs";

const root = process.cwd();
const manifest = path.join(root, "scripts/pc1-consumer-closure-manifest.mjs");
const evidence = collectPc1Evidence(root);
if (!evidence.predecessorInHistory) throw new Error("predecessor not in history");
const entries = evidence.productDelta.sort().map((file) => {
  if (evidence.sha256[file] === null) throw new Error(`deleted product path is not part of PC-1: ${file}`);
  return `  ${JSON.stringify(file)}: ${JSON.stringify(evidence.sha256[file])}`;
});
const block = `// PC1-RECORD-BEGIN\nexport const PC1_PRODUCT_SHA256 = Object.freeze({\n${entries.join(",\n")}\n});\n// PC1-RECORD-END`;
const source = fs.readFileSync(manifest, "utf8");
const next = source.replace(/\/\/ PC1-RECORD-BEGIN[\s\S]*?\/\/ PC1-RECORD-END/, block);
fs.writeFileSync(manifest, next);
console.log(`recorded ${entries.length} product paths`);
