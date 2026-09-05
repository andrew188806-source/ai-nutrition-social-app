#!/usr/bin/env node
// RA-2B-P1 guard. Scope, topology, successor integrity, RA-2A freeze and hygiene.
// Behaviour is asserted by the smoke and mutation runners; a real cluster apply is the postgres gate.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  auditMigrationSource, readMigrationSource, readNormalized, SECRET_SHAPE,
  B1_BASELINE, B1_BASELINE_MIGRATION_COUNT, B1_CLIENT_ROLES, B1_FORBIDDEN_BRANCHES,
  B1_FORBIDDEN_TARGETS, B1_FROZEN_MIGRATIONS, B1_FROZEN_ROLE, B1_MIGRATION, B1_MIGRATION_SHA256,
  B1_MUTATION, B1_ORIGIN_MAIN, B1_PACKAGE_KEYS, B1_PATHS, B1_PERMISSIVE_POLICIES, B1_PREVIEW,
  B1_RESTRICTIVE_POLICIES, B1_ROLE, B1_SUBJECT
} from "./restaurant-owner-availability-ra-2b-p1-contract.mjs";

const SUITE = "restaurant-owner-availability-ra-2b-p1-guard";
const root = process.cwd();
const git = (args) => child.execFileSync("git", args,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => (value ? value.split(/\r?\n/).filter(Boolean) : []);
const read = (file) => readNormalized(root, file);
const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

// ---------------------------------------------------------------- lifecycle
const head = git(["rev-parse", "HEAD"]);
const originMain = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const staged = lines(git(["diff", "--cached", "--name-only"]));
const worktree = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const committed = head === B1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === B1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the canonical pushed baseline", originMain === B1_ORIGIN_MAIN,
  { originMain, expected: B1_ORIGIN_MAIN });
check("the round is exactly one commit ahead once frozen, and a clean candidate before that",
  behind === 0 && ((phase === "candidate" && ahead === 0) || (phase === "frozen" && ahead === 1)),
  { phase, ahead, behind, head });
check("nothing is staged and nothing is deleted",
  staged.length === 0 && lines(git(["diff", "--name-only", "--diff-filter=D"])).length === 0, { staged });
check("the changed paths are exactly the authorized manifest",
  JSON.stringify(manifest) === JSON.stringify([...B1_PATHS]),
  { expected: [...B1_PATHS], actual: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the RA-2B-P1 subject",
    git(["log", "-1", "--format=%s"]) === B1_SUBJECT, git(["log", "-1", "--format=%s"]));
  check("the parent of the freeze commit is the canonical pushed baseline",
    git(["rev-parse", "HEAD^"]) === B1_BASELINE);
}

// ---------------------------------------------------------------- successor integrity
const migrationDir = path.join(root, "supabase/migrations");
const migrations = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === B1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: B1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(B1_MIGRATION), migrations.slice(-2));
const migrationSql = readMigrationSource(root);
check("the successor migration matches its frozen SHA-256",
  sha(migrationSql) === B1_MIGRATION_SHA256, sha(migrationSql));
check("no predecessor migration is touched by this round",
  !manifest.some((file) => file.startsWith("supabase/migrations/") && file !== B1_MIGRATION),
  manifest.filter((f) => f.startsWith("supabase/migrations/")));

// ---------------------------------------------------------------- RA-2A freeze
for (const frozen of B1_FROZEN_MIGRATIONS) {
  check(`the frozen RA-2A migration ${path.basename(frozen.path)} is byte-identical to its pinned hash`,
    sha(read(frozen.path)) === frozen.sha256, sha(read(frozen.path)));
}
const ra2aPaths = lines(git(["ls-files", "scripts/restaurant-owner-sold-out-ra-2a-p1-*",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-*"]));
const ra2aChanged = ra2aPaths.filter((file) =>
  git(["diff", "--name-only", B1_BASELINE, "--", file]).length > 0);
check("no RA-2A file is modified by this round", ra2aChanged.length === 0, ra2aChanged);
check("the frozen RA-2A writer receives no new grant in this migration",
  !new RegExp(`grant [^;]*to ${B1_FROZEN_ROLE}`).test(migrationSql));

// ---------------------------------------------------------------- scope
check("the round creates exactly one new role, and it is not the frozen writer",
  (migrationSql.match(/^create role /gm) ?? []).length === 1
  && new RegExp(`create role ${B1_ROLE}\\b`).test(migrationSql));
check("the round adds no application, server or UI path",
  !manifest.some((file) => file.startsWith("apps/") || file.startsWith("lib/")), manifest);
check("the round creates no new schema or table outside its own audit relation",
  (migrationSql.match(/^create table /gm) ?? []).length === 1
  && !/^create schema /m.test(migrationSql));
check("both RPCs are created in this one migration",
  migrationSql.includes(`create function ${B1_PREVIEW}(`)
  && migrationSql.includes(`create function ${B1_MUTATION}(`)
  && (migrationSql.match(/^create function public\./gm) ?? []).length === 2);
check("the two tenant policies are declared RESTRICTIVE and the visibility pair is not",
  B1_RESTRICTIVE_POLICIES.every((p) =>
    new RegExp(`create policy ${p}[\\s\\S]{0,120}as restrictive`).test(migrationSql))
  && B1_PERMISSIVE_POLICIES.every((p) =>
    !new RegExp(`create policy ${p}[\\s\\S]{0,120}as restrictive`).test(migrationSql)));

// ---------------------------------------------------------------- hygiene
check("the package manifest declares exactly the RA-2B-P1 commands",
  B1_PACKAGE_KEYS.every((key) => JSON.parse(read("package.json")).scripts[key] !== undefined),
  B1_PACKAGE_KEYS.filter((key) => JSON.parse(read("package.json")).scripts[key] === undefined));
check("no credential-shaped value appears in any RA-2B-P1 path",
  B1_PATHS.every((file) => !SECRET_SHAPE.test(read(file))));
check("no forbidden public demo target is named outside the contract and mutation runner",
  B1_PATHS.filter((f) => f !== "package.json" && !f.includes("mutations") && !f.includes("contract"))
    .every((file) => [...B1_FORBIDDEN_TARGETS, ...B1_FORBIDDEN_BRANCHES]
      .every((id) => !read(file).includes(id))));
check("no client or runtime role is granted anything by this round",
  B1_CLIENT_ROLES.filter((r) => r !== "authenticated")
    .every((role) => !new RegExp(`grant [^;]*to [^;]*\\b${role}\\b`).test(migrationSql)));
check("every declared RA-2B-P1 path exists and carries content",
  B1_PATHS.every((file) => {
    const full = path.join(root, file);
    return fs.existsSync(full) && fs.statSync(full).size > 0;
  }), B1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// ---------------------------------------------------------------- delegated source contract
const contract = auditMigrationSource(migrationSql);
const contractFailures = contract.filter((item) => !item.pass);
check(`the frozen successor satisfies all ${contract.length} source contract claims`,
  contractFailures.length === 0, contractFailures.map((item) => item.name));

console.log("\n" + JSON.stringify({
  suite: SUITE, phase, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  head, originMain, ahead, behind,
  migrationSha256: B1_MIGRATION_SHA256,
  frozenRa2a: B1_FROZEN_MIGRATIONS.map((f) => f.sha256),
  migrations: migrations.length, contractClaims: contract.length, changedPaths: manifest
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
