#!/usr/bin/env node
// GQA-3 historical migration manifest: every migration file that existed at the GQA-3 baseline commit,
// with its Git blob id and the SHA-256 of its LF-normalized bytes.
//
// The manifest is generated from Git objects (`git ls-tree <baseline>`), never from the working tree,
// so a locally edited file cannot become its own reference. It is committed next to this script as
// db-migration-baseline-manifest.json and verified against the baseline commit whenever that commit
// is reachable (it stays reachable after push; it is part of main's history).
//
//   node scripts/db-migration-baseline-manifest.mjs --write   regenerate (only from the baseline tree)
//   node scripts/db-migration-baseline-manifest.mjs           verify the committed manifest
import crypto from "node:crypto";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GQA3_MIGRATION_BASELINE = "25157cbb9c2fa41d516265bac665e5230740712b";
export const MIGRATIONS_DIR = "supabase/migrations";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = path.join(HERE, "db-migration-baseline-manifest.json");
export const ROOT = path.resolve(HERE, "..");

const git = (args, options = {}) => cp.execFileSync("git", args, {
  cwd: ROOT, encoding: options.encoding ?? "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024
});
export const lfSha256 = (bytes) => crypto.createHash("sha256")
  .update(Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");

/** Build the manifest entries from the baseline commit's tree (Git objects only). */
export function manifestFromBaselineTree(baseline = GQA3_MIGRATION_BASELINE) {
  const rows = git(["ls-tree", "-r", baseline, "--", MIGRATIONS_DIR]).split(/\r?\n/).filter(Boolean);
  return rows.map((row) => {
    const [meta, file] = row.split("\t");
    const blob = meta.split(/\s+/)[2];
    const bytes = cp.execFileSync("git", ["cat-file", "blob", blob], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    return { path: file, blob, sha256: lfSha256(bytes) };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function aggregateOf(entries) {
  return crypto.createHash("sha256").update(entries.map((e) => `${e.path}\0${e.blob}\0${e.sha256}`).join("\n")).digest("hex");
}

export function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = manifestFromBaselineTree();
  if (process.argv.includes("--write")) {
    const manifest = { baseline: GQA3_MIGRATION_BASELINE, count: entries.length, aggregateSha256: aggregateOf(entries), entries };
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(`wrote ${path.relative(ROOT, MANIFEST_PATH)}: ${entries.length} historical migrations`);
  } else {
    const manifest = readManifest();
    const ok = manifest.baseline === GQA3_MIGRATION_BASELINE && manifest.count === entries.length
      && manifest.aggregateSha256 === aggregateOf(entries) && aggregateOf(manifest.entries) === manifest.aggregateSha256;
    console.log(ok ? `migration baseline manifest matches ${GQA3_MIGRATION_BASELINE}: ${entries.length} files` : "migration baseline manifest MISMATCH");
    process.exitCode = ok ? 0 : 1;
  }
}
