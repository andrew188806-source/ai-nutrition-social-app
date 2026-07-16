import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const expectedHead = "3d5340f489cc6fb29fa77da6d1d32f38e22c16e8";
const expectedLatest = "20260716060000_restore_restaurant_internal_reader_set_option.sql";
const issues = [];
const checks = [];
const historicalScripts = {
  "scripts/restaurant-supabase-phase-1a-guard.mjs": "693479c975b6a7e51c2378aaac64e56e112ff1575a31df1ab6cb0247cf3afa67",
  "scripts/restaurant-supabase-phase-1b-rest-guard.mjs": "4ce5c7320a4566b1481c1bcc5b91f6b6aa101b07120d36144a9bc2e5b132b9d5",
  "scripts/restaurant-supabase-phase-1d-live-read-parity.mjs": "b34e4d036cab6ef93c9e00f6f920871f69be7aba9e0b162bd338f46ad60ffe25",
  "scripts/nutrition-direct-read-revocation-phase-2u-c-b-guard.mjs": "932b503878cf6a60b8a45fe6d06c7fd27e70f4707a27ceb8ed14a8cfe1856174",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-guard.mjs": "718e0a5c6f4889767226b9cea506534b06f547be1adb2abd30f86b5966966bec",
  "scripts/restaurant-public-nutrition-phase-2u-c-a-smoke.mjs": "8ab4def463ee50b899bfbd7579fa97a9be6e28fbf1c0cf9625f0c65c684e28a0"
};

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function check(name, condition, details = "") {
  checks.push({ name, pass: Boolean(condition), details });
  if (!condition) issues.push({ name, details });
}

const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql")).sort();
const frozenPaths = [
  "docs/runtime-integration-phase-2v",
  "docs/runtime-integration-phase-2v-b",
  "docs/runtime-integration-phase-2v-c",
  "docs/runtime-integration-phase-2v-d",
  "supabase/migrations"
];
const frozenDiff = git(["diff", "--name-only", "HEAD", "--", ...frozenPaths]);
const status = git(["status", "--short", "--untracked-files=all"]);
const generated = status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)).filter((file) =>
  /(^|\/)(?:\.next|node_modules|dist|build|coverage|\.cache)(?:\/|$)|\.(?:tsbuildinfo|log|tmp|cache)$/i.test(file)
);

check("branch is main", git(["branch", "--show-current"]) === "main");
check("HEAD is the frozen Phase 2V-D commit", git(["rev-parse", "HEAD"]) === expectedHead);
check("staged diff is empty", git(["diff", "--cached", "--name-only"]) === "");
check("local migration count is 33", migrations.length === 33, `found ${migrations.length}`);
check("latest migration is exact", migrations.at(-1) === expectedLatest, migrations.at(-1));
check("frozen Phase 2V-A/B/C/D docs and migrations are unchanged", frozenDiff === "", frozenDiff);
for (const [file, expectedHash] of Object.entries(historicalScripts)) {
  const actualHash = fs.existsSync(path.join(root, file))
    ? crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")
    : "missing";
  check(`historical script is byte-identical: ${file}`, actualHash === expectedHash, actualHash);
}
check("historical script diff against HEAD is empty", git(["diff", "--name-only", "HEAD", "--", ...Object.keys(historicalScripts)]) === "");
check("no generated artifact is visible to Git", generated.length === 0, generated.join(", "));

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2V-E-preflight",
  checks,
  issues,
  localMigrationCount: migrations.length,
  latestMigration: migrations.at(-1),
  remoteOperationUsed: false,
  databaseWriteExecuted: false
}, null, 2));
process.exit(issues.length ? 1 : 0);
