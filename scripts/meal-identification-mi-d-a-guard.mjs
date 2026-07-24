import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function trackedModifiedPaths() {
  const diff = git(["diff", "--name-only", "HEAD"]).trim();
  return diff.length === 0 ? [] : diff.split("\n");
}

function untrackedPaths() {
  const out = git(["ls-files", "--others", "--exclude-standard"]).trim();
  return out.length === 0 ? [] : out.split("\n");
}

const results = [];
function check(name, fn) {
  try {
    const ok = fn();
    results.push({ name, ok: ok === true, detail: typeof ok === "string" ? ok : "" });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
}

const MI_D_A_FROZEN_BASE = "b6843d8376d6757e5bf91986f35d4ce42ddb9d1f";
const CANONICAL_RPC = "finalize_current_user_meal_identification_v1";
const PROTECTED_MIGRATION = "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const PROTECTED_MIGRATION_SHA256 = "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";
const PLAN_DOC = "docs/meal-identification-mi-d-a-ui-integration-plan.md";
const GUARD_SCRIPT = "scripts/meal-identification-mi-d-a-guard.mjs";
const ALLOWED_TRACKED_MODIFIED = new Set(["package.json"]);
const ALLOWED_UNTRACKED = new Set([PROTECTED_MIGRATION, PLAN_DOC, GUARD_SCRIPT]);

check("planning document exists", () => existsSync(path.join(repoRoot, PLAN_DOC)));

check("planning document references the correct frozen MI-C-D commit SHA", () => {
  const text = readFileSync(path.join(repoRoot, PLAN_DOC), "utf8");
  return text.includes(MI_D_A_FROZEN_BASE);
});

check("planning document references the correct canonical RPC name", () => {
  const text = readFileSync(path.join(repoRoot, PLAN_DOC), "utf8");
  return text.includes(CANONICAL_RPC);
});

check("planning document does not silently omit deferred-scope statement", () => {
  const text = readFileSync(path.join(repoRoot, PLAN_DOC), "utf8");
  return /MI-D-B/.test(text) && /(not implemented|out of scope|deferred|not this round|not yet)/i.test(text);
});

check("only package.json is tracked-modified relative to HEAD (all other frozen files byte-identical)", () => {
  const modified = trackedModifiedPaths();
  const unexpected = modified.filter((p) => !ALLOWED_TRACKED_MODIFIED.has(p));
  return unexpected.length === 0 ? true : `unexpected tracked modifications: ${unexpected.join(", ")}`;
});

check("package.json diff adds only the single MI-D-A guard script entry, nothing else", () => {
  const diff = git(["diff", "HEAD", "--", "package.json"]);
  const addedLines = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const removedLines = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  if (removedLines.length !== 0) return `unexpected removed lines in package.json: ${removedLines.join(" | ")}`;
  if (addedLines.length !== 1) return `expected exactly 1 added line in package.json, found ${addedLines.length}: ${addedLines.join(" | ")}`;
  const expected = '"test:meal-identification-mi-d-a": "node scripts/meal-identification-mi-d-a-guard.mjs",';
  return addedLines[0].includes(expected) ? true : `unexpected added line content: ${addedLines[0]}`;
});

check("no staged changes present before freeze commit", () => {
  const diff = git(["diff", "--cached", "--name-only"]).trim();
  return diff.length === 0 ? true : `unexpected staged paths: ${diff}`;
});

check("only the authorized MI-D-A candidate paths are untracked", () => {
  const untracked = untrackedPaths();
  const unexpected = untracked.filter((p) => !ALLOWED_UNTRACKED.has(p));
  return unexpected.length === 0 ? true : `unexpected untracked paths: ${unexpected.join(", ")}`;
});

check("protected migration path unchanged", () => existsSync(path.join(repoRoot, PROTECTED_MIGRATION)));

check("protected migration SHA-256 unchanged (path/hash only, content never opened for comprehension)", () => {
  const actual = sha256(path.join(repoRoot, PROTECTED_MIGRATION));
  return actual === PROTECTED_MIGRATION_SHA256 ? true : `sha256 mismatch: expected ${PROTECTED_MIGRATION_SHA256}, got ${actual}`;
});

check("no generated build artifacts present (.tsbuildinfo / stray compiled js / map files)", () => {
  const untracked = untrackedPaths();
  const suspicious = untracked.filter((p) => /\.tsbuildinfo$/.test(p) || /\.map$/.test(p));
  return suspicious.length === 0 ? true : `unexpected generated artifacts: ${suspicious.join(", ")}`;
});

check("no Mobile production UI code paths modified (app/, features/ untouched)", () => {
  const diff = git(["diff", "--name-only", "HEAD", "--", "apps/mobile/app", "apps/mobile/features"]).trim();
  return diff.length === 0 ? true : `unexpected Mobile production changes: ${diff}`;
});

check("no migration files modified or added under supabase/migrations besides the pre-existing protected candidate", () => {
  const trackedDiff = git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).trim();
  const untracked = untrackedPaths().filter((p) => p.startsWith("supabase/migrations"));
  const unexpectedUntracked = untracked.filter((p) => p !== PROTECTED_MIGRATION);
  if (trackedDiff.length !== 0) return `unexpected tracked migration diff: ${trackedDiff}`;
  if (unexpectedUntracked.length !== 0) return `unexpected untracked migration paths: ${unexpectedUntracked.join(", ")}`;
  return true;
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"} - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
