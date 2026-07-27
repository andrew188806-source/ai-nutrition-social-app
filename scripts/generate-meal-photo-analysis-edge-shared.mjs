#!/usr/bin/env node
// MI-E-C4: generates a Deno-import-compatible copy of packages/shared/src/domain/
// meal-photo-analysis/*.ts into supabase/functions/_shared/meal-photo-analysis/.
//
// Why this exists: Deno (the Supabase Edge Function runtime) requires every relative import
// specifier to include its file extension (e.g. "./types.ts", not "./types") — unlike Node/Metro,
// which resolve extensionless specifiers automatically. packages/shared's canonical source uses
// the extensionless style throughout this repo (matching every other app's tsconfig, none of
// which want per-file extensions littering ordinary Mobile/web imports). Rather than changing the
// canonical source (which would force a repo-wide tsconfig change to permit extensioned imports
// everywhere, just to satisfy one Deno-only consumer), this script produces a byte-identical
// COPY with only import-specifier extensions rewritten — no logic, wording, or behavior changes.
//
// The companion guard check (scripts/meal-photo-analysis-edge-function-mi-e-c4-guard.mjs)
// regenerates into a temp directory and diffs against the checked-in copy, so any manual edit to
// the generated files (drift) or any un-regenerated change to the canonical source is caught
// mechanically — this is never meant to be hand-edited.
import fs from "node:fs";
import path from "node:path";

export const MEAL_PHOTO_ANALYSIS_GENERATED_FILES = [
  "types.ts",
  "binarySignature.ts",
  "imageHash.ts",
  "requestValidation.ts",
  "providerOutputSchema.ts",
  "responseValidation.ts",
  "index.ts"
];

// Rewrites `from "./foo"` / `from "../foo"` to append ".ts" — only when there is no extension
// already. Does not touch bare/package specifiers (no leading "." ).
function addTsExtensions(source) {
  return source.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, (full, prefix, specifier, suffix) => {
    if (/\.(ts|tsx|js|json)$/.test(specifier)) return full;
    return `${prefix}${specifier}.ts${suffix}`;
  });
}

function generatedHeader(file) {
  return (
    `// GENERATED FILE — do not hand-edit. Mechanically derived from\n` +
    `// packages/shared/src/domain/meal-photo-analysis/${file} by\n` +
    `// scripts/generate-meal-photo-analysis-edge-shared.mjs (MI-E-C4). Only relative import\n` +
    `// specifiers were rewritten to include explicit .ts extensions for Deno's module\n` +
    `// resolution; all other content is byte-identical to the canonical source. Regenerate\n` +
    `// with: node scripts/generate-meal-photo-analysis-edge-shared.mjs\n\n`
  );
}

// Pure: computes { filename -> rewritten content } without touching the filesystem beyond
// reading the canonical source. Reused by both the CLI writer below and the guard's
// regenerate-and-diff check, so neither has a side effect the other doesn't expect.
export function computeGeneratedContents(repoRoot) {
  const sourceDir = path.join(repoRoot, "packages", "shared", "src", "domain", "meal-photo-analysis");
  const contents = new Map();
  for (const file of MEAL_PHOTO_ANALYSIS_GENERATED_FILES) {
    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    contents.set(file, generatedHeader(file) + addTsExtensions(source));
  }
  return contents;
}

export function writeGeneratedFiles(repoRoot, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const contents = computeGeneratedContents(repoRoot);
  const written = [];
  for (const [file, content] of contents) {
    const targetPath = path.join(targetDir, file);
    fs.writeFileSync(targetPath, content, "utf8");
    written.push(targetPath);
  }
  return written;
}

// Always regenerates into the real target when this file is run directly (`node
// scripts/generate-meal-photo-analysis-edge-shared.mjs`). The guard imports
// computeGeneratedContents/writeGeneratedFiles instead of executing this file, so it never
// triggers this side effect merely by importing the module.
if (process.env.MEAL_PHOTO_ANALYSIS_GENERATE_SKIP_CLI !== "true") {
  const repoRoot = process.cwd();
  const targetDir = path.join(repoRoot, "supabase", "functions", "_shared", "meal-photo-analysis");
  const written = writeGeneratedFiles(repoRoot, targetDir);
  for (const file of written) console.log(`generated: ${path.relative(repoRoot, file)}`);
}
