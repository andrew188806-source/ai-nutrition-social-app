#!/usr/bin/env node
// RA-2A-P1-R1 guard. Scope, topology, successor integrity, predecessor freeze and hygiene.
// Behaviour is asserted by the smoke and mutation runners; a real cluster apply is the postgres gate.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  auditMigrationSource, readMigrationSource, readNormalized, SECRET_SHAPE,
  R1_BASELINE, R1_BASELINE_MIGRATION_COUNT, R1_CLIENT_ROLES, R1_FORBIDDEN_BRANCHES,
  R1_FORBIDDEN_TARGETS, R1_FROZEN_P1_MIGRATION, R1_FROZEN_P1_SHA256, R1_FROZEN_PATHS,
  R1_GOVERNED_ROLES, R1_MIGRATION, R1_MIGRATION_SHA256, R1_ORIGIN_MAIN, R1_PACKAGE_KEYS,
  R1_PATHS, R1_PREVIEW, R1_SEALED_ROLE, R1_SUBJECT
} from "./restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs";

const SUITE = "restaurant-owner-sold-out-preview-ra-2a-p1-r1-guard";
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
const committed = head === R1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === R1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is still the canonical pushed baseline", originMain === R1_ORIGIN_MAIN,
  { originMain, expected: R1_ORIGIN_MAIN });
check("RA-2A-P1 remains the immediate predecessor, unamended",
  phase === "candidate" ? head === R1_BASELINE : git(["rev-parse", "HEAD^"]) === R1_BASELINE,
  { phase, head, p1: R1_BASELINE });
check("the round is exactly two commits ahead once frozen, one while a candidate",
  behind === 0 && ((phase === "candidate" && ahead === 1) || (phase === "frozen" && ahead === 2)),
  { phase, ahead, behind });
check("nothing is staged and nothing is deleted",
  staged.length === 0 && lines(git(["diff", "--name-only", "--diff-filter=D"])).length === 0, { staged });
check("the changed paths are exactly the authorized manifest",
  JSON.stringify(manifest) === JSON.stringify([...R1_PATHS]),
  { expected: [...R1_PATHS], actual: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the RA-2A-P1-R1 subject",
    git(["log", "-1", "--format=%s"]) === R1_SUBJECT, git(["log", "-1", "--format=%s"]));
}

// ---------------------------------------------------------------- successor integrity
const migrationDir = path.join(root, "supabase/migrations");
const migrations = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === R1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: R1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after RA-2A-P1",
  migrations[migrations.length - 1] === path.basename(R1_MIGRATION)
  && migrations[migrations.length - 2] === path.basename(R1_FROZEN_P1_MIGRATION), migrations.slice(-2));
const migrationSql = readMigrationSource(root);
check("the successor migration matches its frozen SHA-256",
  sha(migrationSql) === R1_MIGRATION_SHA256, sha(migrationSql));

// ---------------------------------------------------------------- predecessor freeze
check("the frozen RA-2A-P1 migration is byte-identical to its pinned hash",
  sha(read(R1_FROZEN_P1_MIGRATION)) === R1_FROZEN_P1_SHA256, sha(read(R1_FROZEN_P1_MIGRATION)));
const frozenChanged = R1_FROZEN_PATHS.filter((file) =>
  git(["diff", "--name-only", R1_BASELINE, "--", file]).length > 0);
check("no frozen predecessor file is modified by this round", frozenChanged.length === 0, frozenChanged);
check("no predecessor migration is touched",
  !manifest.some((file) => file.startsWith("supabase/migrations/") && file !== R1_MIGRATION),
  manifest.filter((f) => f.startsWith("supabase/migrations/")));

// ---------------------------------------------------------------- scope
check("the round creates no new role, so the governed manifest is unchanged",
  !/create role/i.test(migrationSql) && R1_GOVERNED_ROLES.some((e) => e.role === R1_SEALED_ROLE));
check("the round adds no application, server or UI path",
  !manifest.some((file) => file.startsWith("apps/") || file.startsWith("lib/")), manifest);
check("the round adds no new schema, table, policy, trigger or index",
  !/^create (schema|table|policy|trigger|index)/im.test(migrationSql));
check("the preview reuses the existing sealed writer rather than a new authority",
  new RegExp(`owner to ${R1_SEALED_ROLE}`).test(migrationSql)
  && (migrationSql.replace(/^\s*--.*$/gm, "").match(/owner to /g) ?? []).length === 1);
check("no client or runtime role is granted anything by this round",
  R1_CLIENT_ROLES.filter((r) => r !== "authenticated")
    .every((role) => !new RegExp(`grant [^;]*to [^;]*\\b${role}\\b`).test(migrationSql)));

// ---------------------------------------------------------------- hygiene
check("the package manifest declares exactly the RA-2A-P1-R1 commands",
  R1_PACKAGE_KEYS.every((key) => JSON.parse(read("package.json")).scripts[key] !== undefined),
  R1_PACKAGE_KEYS.filter((key) => JSON.parse(read("package.json")).scripts[key] === undefined));
check("no credential-shaped value appears in any RA-2A-P1-R1 path",
  R1_PATHS.every((file) => !SECRET_SHAPE.test(read(file))));
check("no forbidden public demo target is named outside the mutation runner",
  R1_PATHS.filter((f) => f !== "package.json" && !f.includes("mutations")).every((file) =>
    [...R1_FORBIDDEN_TARGETS, ...R1_FORBIDDEN_BRANCHES].every((id) => !read(file).includes(id))));
check("every declared RA-2A-P1-R1 path exists and carries content",
  R1_PATHS.every((file) => {
    const full = path.join(root, file);
    return fs.existsSync(full) && fs.statSync(full).size > 0;
  }), R1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));
check("the preview name is pinned, not pattern-matched",
  migrationSql.includes(`create function ${R1_PREVIEW}(`));

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
  migrationSha256: R1_MIGRATION_SHA256, frozenP1Sha256: R1_FROZEN_P1_SHA256,
  migrations: migrations.length, contractClaims: contract.length, changedPaths: manifest
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
