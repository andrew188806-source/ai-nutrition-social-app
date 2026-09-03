#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RA1A_BASELINE, RA1A_BASELINE_MIGRATION_COUNT, RA1A_BASELINE_SUBJECT, RA1A_COMMIT_SUBJECT,
  RA1A_MIGRATION, RA1A_MIGRATION_SHA256, RA1A_NPM_KEYS, RA1A_PATHS, RA1A_PRODUCT_PATHS,
  auditRa1aSources, classifyRa1aLifecycle, createRa1aManifest
} from "./platform-admin-ra-1a-successor-manifest.mjs";

const root = process.cwd();
const readBuffer = (file) => fs.readFileSync(path.join(root, file));
const read = (file) => readBuffer(file).toString("utf8").replace(/\r\n/g, "\n");
const git = (args) => child.execFileSync("git", args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

// ---------------------------------------------------------------- lifecycle
const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const worktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const deltaPaths = head === RA1A_BASELINE ? []
  : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const lifecycle = classifyRa1aLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths, deltaPaths,
  parent: head === RA1A_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});

check("lifecycle is exactly candidate, frozen-local or frozen-pushed from the RA-1A baseline",
  lifecycle.valid, { phase: lifecycle.phase, head, originHead, behind, ahead, worktreePaths, deltaPaths });
check("the RA-1A baseline commit is the audited handoff baseline",
  git(["log", "-1", "--format=%s", RA1A_BASELINE]) === RA1A_BASELINE_SUBJECT);
check("the manifest is exactly the authorized twelve paths",
  JSON.stringify(lifecycle.manifest) === JSON.stringify([...RA1A_PATHS]),
  { expected: [...RA1A_PATHS], actual: lifecycle.manifest });
check("nothing is staged and nothing is deleted",
  stagedPaths.length === 0 && lines(git(["diff", "--name-only", "--diff-filter=D"])).length === 0);
if (lifecycle.phase !== "candidate") {
  check("the freeze commit carries the RA-1A subject",
    git(["log", "-1", "--format=%s"]) === RA1A_COMMIT_SUBJECT, git(["log", "-1", "--format=%s"]));
}

// ---------------------------------------------------------------- migration lifecycle protection
const migrationDir = path.join(root, "supabase/migrations");
const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
check("RA-1A adds exactly one migration",
  migrations.length === RA1A_BASELINE_MIGRATION_COUNT + 1, migrations.length);
check("the new migration is the last one and is the RA-1A migration",
  migrations[migrations.length - 1] === path.basename(RA1A_MIGRATION), migrations[migrations.length - 1]);
const migrationSha = crypto.createHash("sha256").update(read(RA1A_MIGRATION), "utf8").digest("hex");
check("the RA-1A migration matches its recorded SHA-256",
  migrationSha === RA1A_MIGRATION_SHA256, { expected: RA1A_MIGRATION_SHA256, actual: migrationSha });

const frozenMigrations = migrations.filter((name) => name !== path.basename(RA1A_MIGRATION));
const touchedMigrations = lifecycle.manifest.filter((file) => file.startsWith("supabase/migrations/"));
check("no frozen migration byte is modified",
  touchedMigrations.length === 1 && touchedMigrations[0] === RA1A_MIGRATION,
  touchedMigrations);
check("every predecessor migration filename is untouched",
  frozenMigrations.length === RA1A_BASELINE_MIGRATION_COUNT, frozenMigrations.length);

// ---------------------------------------------------------------- security contract
const sources = Object.fromEntries(RA1A_PATHS.map((file) => [file, read(file)]));
const violations = auditRa1aSources(sources);
check("the RA-1A source security contract holds in full", violations.length === 0, violations);

// ---------------------------------------------------------------- scope containment
const productOutsideRound = lifecycle.manifest.filter((file) =>
  (file.startsWith("apps/") || file.startsWith("packages/") || file.startsWith("supabase/") || file.startsWith("lib/"))
  && !RA1A_PRODUCT_PATHS.includes(file));
check("RA-1A touches no product path outside its own three", productOutsideRound.length === 0, productOutsideRound);
check("RA-1A changes no Edge Function",
  lifecycle.manifest.every((file) => !file.startsWith("supabase/functions/")));
check("RA-1A changes no Consumer, Social, GEO or Restaurant runtime",
  lifecycle.manifest.every((file) => !/^apps\/(mobile|restaurant-web)\//.test(file)));
check("RA-1A adds no Admin page, repository, service or mock",
  lifecycle.manifest.every((file) => !/^apps\/admin-web\/(app|repositories|services|adapters|components|view-models)\//.test(file)));
check("RA-1A does not modify .env.example or any lockfile",
  lifecycle.manifest.every((file) => file !== ".env.example" && !/lock/i.test(file)));

const pkg = JSON.parse(read("package.json"));
check("package.json adds exactly the three RA-1A script keys and nothing else",
  RA1A_NPM_KEYS.every((key) => typeof pkg.scripts[key] === "string")
  && Object.keys(pkg.scripts).filter((key) => key.includes("platform-admin")).length === RA1A_NPM_KEYS.length,
  Object.keys(pkg.scripts).filter((key) => key.includes("platform-admin")));
check("RA-1A adds no dependency", (() => {
  const baseline = JSON.parse(git(["show", `${RA1A_BASELINE}:package.json`]));
  return JSON.stringify(baseline.dependencies ?? {}) === JSON.stringify(pkg.dependencies ?? {})
    && JSON.stringify(baseline.devDependencies ?? {}) === JSON.stringify(pkg.devDependencies ?? {});
})());

// ---------------------------------------------------------------- prepared acceptance harness
const acceptance = sources["scripts/platform-admin-ra-1a-development-acceptance.mjs"];
check("the Development acceptance harness is opt-in and cannot run by default",
  /TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_ACCEPTANCE/.test(acceptance)
  && /status: "skipped"/.test(acceptance));
// Pinned to the Development ref, with no other project ref or Supabase host reachable from it.
// The word "Production" may legitimately appear in prose stating that it is never touched.
check("the acceptance harness is pinned to Development and names no other project",
  /const DEV_REF = "msbgnnoorsoefuiwluye"/.test(acceptance)
  && (acceptance.match(/[a-z]{20}\.supabase\.co|projects\/[a-z]{20}/g) ?? [])
    .every((match) => match.includes("msbgnnoorsoefuiwluye") || match === "projects/${DEV_REF}"));
// Only the SQL the harness actually sends is scanned, and all of it is. Stripping quotes out of the
// whole file and scanning the remainder was not structurally meaningful: it read the prose in a
// check name — "the audit log has no UPDATE policy" — as a mutation, while its pairing of quotes
// shifted whenever an unrelated comment changed. Template literals are where this harness's SQL
// lives, so that is what is examined.
//
// The harness has two gates. Everything reachable on the acceptance gate alone must be read-only;
// the mutating membership lifecycle sits behind a second, separate gate. The split is asserted by
// position, so a mutation cannot migrate out of the gated region unnoticed.
const MUTATING_SQL =
  /\b(insert\s+into|update\s+\w|delete\s+from|grant\s+\w|revoke\s+\w|alter\s+(table|role|function)|drop\s+\w|create\s+(table|role|schema|function|policy|index))/i;
const lifecycleGateAt = acceptance.indexOf(`process.env[LIFECYCLE_OPT_IN] === "1"`);
const literals = (source) => [...source.matchAll(/`([^`]*)`/g)].map((match) => match[1]).join("\n");
check("the acceptance harness declares a lifecycle gate distinct from its acceptance gate",
  lifecycleGateAt > 0
  && /const LIFECYCLE_OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_LIFECYCLE"/.test(acceptance)
  && !/TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_ACCEPTANCE[^\n]*LIFECYCLE/.test(acceptance));
check("on the acceptance gate alone the harness only reads: it provisions nothing and mutates no row",
  !MUTATING_SQL.test(literals(acceptance.slice(0, acceptance.lastIndexOf(`process.env[LIFECYCLE_OPT_IN] === "1"`)))));
check("no operator function is invoked outside the lifecycle gate",
  !/(grant|revoke)_platform_admin\s*\(/.test(
    literals(acceptance.slice(0, acceptance.lastIndexOf(`process.env[LIFECYCLE_OPT_IN] === "1"`)))));
check("the lifecycle target is pinned by UUID and its password is never stored in the repository",
  /const LIFECYCLE_TARGET = "[0-9a-f-]{36}"/.test(acceptance)
  && /LIFECYCLE_TARGET_PASSWORD = process\.env\./.test(acceptance)
  && !/password"?\s*[:=]\s*["'][^"']{6,}["']/i.test(acceptance));
check("the lifecycle widens the sealed writer transiently, inside one transaction, without SET ROLE",
  /grant \$\{WRITER\} to postgres with inherit true, set false;/.test(acceptance)
  && /revoke \$\{WRITER\} from postgres granted by postgres;/.test(acceptance)
  && !/set\s+(local\s+)?role\s+/i.test(literals(acceptance)));
check("the lifecycle never fabricates membership or audit state by direct write",
  !/insert into admin_internal\.|update admin_internal\.|delete from admin_internal\./i.test(literals(acceptance)));
check("the acceptance harness asserts membership with both MEMBER and USAGE",
  /pg_has_role\('\$\{client\}', '\$\{sealed\}', 'MEMBER'\)/.test(acceptance)
  && /pg_has_role\('\$\{client\}', '\$\{sealed\}', 'USAGE'\)/.test(acceptance));
check("the acceptance harness covers every client role against both sealed roles",
  /CLIENT_ROLES = \["authenticated", "anon", "authenticator", "service_role"\]/.test(acceptance));
check("the acceptance harness proves table, column and function privilege absence",
  /has_table_privilege/.test(acceptance) && /column_privileges/.test(acceptance)
  && /has_function_privilege/.test(acceptance) && /has_schema_privilege/.test(acceptance));

// ---------------------------------------------------------------- Development reset utility
// The only path in RA-1A that can drop anything. It is acceptance infrastructure, so it is held to
// tighter rules than the read-only harness: it must be opt-in, pinned to Development, unable to
// reach any other project, and structurally incapable of dropping a non-RA-1A object.
const reset = sources["scripts/platform-admin-ra-1a-development-reset.mjs"];
check("the reset utility is opt-in and inert without its own explicit gate",
  /TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_RESET/.test(reset)
  && /status: "skipped"/.test(reset)
  && /process\.env\[OPT_IN\] !== "1"/.test(reset));
check("the reset utility is pinned to Development and can reach no other project",
  /const DEV_REF = "msbgnnoorsoefuiwluye"/.test(reset)
  && /const DEV_NAME = "tastkind-development"/.test(reset)
  && (reset.match(/[a-z]{20}\.supabase\.co|projects\/[a-z]{20}/g) ?? [])
    .every((match) => match.includes("msbgnnoorsoefuiwluye") || match === "projects/${DEV_REF}"));
check("the reset utility refuses to run when more than Development is reachable",
  /no project other than Development is reachable/.test(reset)
  && /refs\.length === 1/.test(reset));
check("the reset utility proves a pristine installation before it composes any drop",
  /PRECONDITION_BLOCKED/.test(reset)
  && /no Platform Admin membership exists/.test(reset)
  && /no Platform Admin audit history exists/.test(reset)
  && /no object outside admin_internal depends on an RA-1A object/.test(reset)
  && reset.indexOf("PRECONDITION_BLOCKED") < reset.indexOf("drop schema admin_internal"));
check("the reset utility drops only RA-1A objects, each named explicitly",
  (reset.match(/drop (schema|role|table|owned by|function)[^\n]*/g) ?? []).every((line) =>
    /admin_internal|platform_admin_|\$\{READER\}|\$\{WRITER\}|\$\{fn\}|\$\{table\}/.test(line)));
check("the reset utility drops the private schema with RESTRICT, so an unexpected object aborts it",
  /drop schema admin_internal restrict;/.test(reset)
  && !/drop schema[^\n]*cascade/i.test(reset));
check("the reset utility never drops a database or an unrelated schema",
  !/drop database/i.test(reset)
  && (reset.match(/drop schema [^\n]*/g) ?? []).every((line) => /admin_internal/.test(line))
  && (reset.match(/drop table [^\n]*/g) ?? []).every((line) => /admin_internal\.\$\{table\}/.test(line)));
check("the reset runs as one transaction that can be rolled back whole",
  /"begin;"/.test(reset) && /"commit;"/.test(reset));
check("the reset utility provisions nothing and writes no application row",
  !/\binsert into\b/i.test(reset.replace(/`[^`]*`/g, "")));
// The migration and the Admin server module must not know this utility exists. Validation scripts
// and documentation may name it; product code may not, because that would be a runtime reset path.
check("no product or runtime path can reach the reset utility",
  RA1A_PRODUCT_PATHS.every((file) => !/platform-admin-ra-1a-development-reset|admin_internal.*cascade/
    .test(sources[file])), RA1A_PRODUCT_PATHS);

// ---------------------------------------------------------------- documentation truthfulness
const handoff = read("ENGINEER_HANDOFF.md");
const roundDoc = read("docs/platform-admin-authority-ra-1a.md");
const docs = `${handoff}\n${roundDoc}`;
check("documentation does not claim an Admin console capability",
  !/Admin (console|surface) is (now )?(live|complete|implemented)/i.test(docs));
check("documentation states RA-1A grants no console capability",
  /grants no (Admin )?console capability|no console capability/i.test(docs));
check("documentation records that the migration is not applied anywhere yet",
  /not applied|unapplied|awaiting .{0,40}acceptance/i.test(docs));
check("documentation keeps Platform Admin distinct from Restaurant Owner and Consumer",
  /Restaurant Owner/i.test(docs) && /Consumer/i.test(docs) && /Nutritionist/i.test(docs));
// Markdown may wrap EXECUTE in backticks, so formatting characters are stripped before matching.
const docsPlain = docs.replace(/[`*_]/g, "");
check("documentation states the role-graph invariant precisely — EXECUTE, never membership",
  /never a member|not a member|no role membership/i.test(docsPlain)
  && /EXECUTE\s+on\s+(the\s+|those\s+)?(three\s+)?(public\.\s*functions[\s\S]{0,40}?)?reader-owned|GRANT EXECUTE[\s\S]{0,80}?sealed reader/i
    .test(docsPlain));
check("documentation never claims a sealed role is granted to a client role",
  !/(reader|writer|context_reader|write_authority)\s+is\s+granted\s+to\s+(authenticated|anon|service_role)/i.test(docs));

// ---------------------------------------------------------------- secret hygiene
// The detector scripts necessarily contain the very patterns they look for, so scanning them for
// their own regex literals would be a guaranteed self-match rather than a finding. Everything that
// could actually carry a credential is scanned.
const scannable = RA1A_PATHS.filter((file) => !/^scripts\/platform-admin-ra-1a-/.test(file));
check("the credential scan covers every path that could carry one",
  scannable.length === RA1A_PATHS.length - 6, scannable);
check("no credential-shaped material is introduced",
  !/\bsk-[A-Za-z0-9_-]{16,}|sb_secret_|service_role_key|eyJ[A-Za-z0-9_-]{20,}\./
    .test(scannable.map((file) => sources[file]).join("\n")), scannable);
check("no service-role secret reaches the Admin bundle",
  !/service_role/.test(sources["apps/admin-web/server/platformAdminAuthority.ts"]));

const manifest = createRa1aManifest(readBuffer);
console.log("\n" + JSON.stringify({
  suite: "platform-admin-ra-1a-guard",
  phase: lifecycle.phase,
  migrationSha256: migrationSha,
  aggregateSha256: manifest.aggregateSha256,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
