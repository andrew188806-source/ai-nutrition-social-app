#!/usr/bin/env node
// SR-1B-D2-B2 guard — MINIMAL SOCIAL RUNTIME LOGIN EXECUTOR.
//
// Fully local: no network, database, Supabase, credential, or Production access.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";
import { SR2A_SUCCESSOR_PATHS } from "./social-ranking-sr2a-successor-manifest.mjs";
import { SR2B_SUCCESSOR_MIGRATION, SR2B_SUCCESSOR_PATHS } from "./social-exposure-sr2b-successor-manifest.mjs";
import { SR2C_SUCCESSOR_MIGRATION, SR2C_SUCCESSOR_PATHS } from "./social-profile-sr2c-successor-manifest.mjs";
import { SR2D_SUCCESSOR_PATHS } from "./social-candidate-sr2d-successor-manifest.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import { SR2GC_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";

const root = process.cwd();
const baseline = "73ee5e0c224c278f3b536c4cd5978ee3f25a9be7";
const freezeMessage = "Add minimal Social runtime executor role";
const MIGRATION = "supabase/migrations/20260810050000_social_runtime_executor_role.sql";
const D1 = "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql";
const B1 = "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql";
const ROLE = "social_runtime_executor";
const B3_SUCCESSOR_PATHS = Object.freeze([
  "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
]);

const successorGuards = [
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs"
];
const manifest = [
  "package.json", MIGRATION,
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-smoke.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-mutations.mjs",
  ...successorGuards
].sort();

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
function changedSince(ref, pathspec) {
  const tracked = lines(git(["diff", "--name-only", ref, "--", pathspec]));
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]));
  return [...new Set([...tracked, ...untracked])].map((entry) => entry.replaceAll("\\", "/")).sort();
}
function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function executableSql(source) {
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) return "";
    const commentAt = line.indexOf("--");
    return commentAt === -1 ? line : line.slice(0, commentAt);
  }).join("\n");
}

try {
  const freeze = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).find(([, subject]) => subject === freezeMessage)?.[0] ?? null;
  const lifecycleManifest = freeze
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freeze]))
    : candidatePaths();
  const raw = read(MIGRATION);
  const sql = executableSql(raw);
  const executableWithoutRoleComment = sql.replace(/comment on role[\s\S]*?;\s*/gi, "");
  const createRole = (sql.match(/create role social_runtime_executor with([\s\S]*?);/i) ?? [])[1] ?? "";

  check("1. the candidate/freeze manifest is exactly enumerated", same(lifecycleManifest, manifest),
    { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists", manifest.every((entry) => fs.existsSync(path.join(root, entry))));
  const pkgBefore = JSON.parse(git(["show", `${baseline}:package.json`]));
  const pkgAfter = JSON.parse(freeze ? git(["show", `${freeze}:package.json`]) : read("package.json"));
  for (const key of ["test:social-runtime-executor-sr1b-d2-b2", "test:social-runtime-executor-sr1b-d2-b2-smoke",
    "test:social-runtime-executor-sr1b-d2-b2-mutations"]) delete pkgAfter.scripts[key];
  check("3. package.json adds only the three D2-B2 validation commands",
    JSON.stringify(pkgBefore) === JSON.stringify(pkgAfter));

  check("4. no app or package production path changed", changedSince(baseline, "apps").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry)).length === 0
    && changedSince(baseline, "packages").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry)).length === 0);
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry));
  check("5. the only Supabase change attributable to B2 is the single executor migration",
    same(supabaseChanged, [MIGRATION]), { changed: supabaseChanged });
  check("6. D1's frozen migration is byte-unchanged", changedSince(baseline, D1).length === 0);
  check("7. D2-B1's frozen migration is byte-unchanged", changedSince(baseline, B1).length === 0);
  check("8. B3 adds only its exact non-deployable shared transport paths",
    B3_SUCCESSOR_PATHS.length === 3
    && new Set(B3_SUCCESSOR_PATHS).size === B3_SUCCESSOR_PATHS.length
    && B3_SUCCESSOR_PATHS.every((entry) => entry.startsWith("supabase/functions/_shared/social-runtime-transport/"))
    && !B3_SUCCESSOR_PATHS.some((entry) => /[*?\[\]{}]/.test(entry)));
  check("8a. SR-2A successor paths are wildcard-free and any Supabase delta is confined to the pure shared ranking module", SR2A_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2A_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-ranking/"))
    && !SR2A_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry.startsWith("supabase/migrations/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("8c. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("8d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("9. every predecessor guard amendment is validation-only and names this exact successor migration",
    successorGuards.every((file) => read(file).includes(MIGRATION)));

  check("10. exactly one role is created and it is the canonical executor",
    (sql.match(/\bcreate role\b/gi) ?? []).length === 1 && /create role social_runtime_executor with/i.test(sql));
  for (const attribute of ["login", "noinherit", "nobypassrls", "nocreatedb", "nocreaterole", "nosuperuser", "noreplication"]) {
    check(`11. executor is explicitly ${attribute.toUpperCase()}`, new RegExp(`\\b${attribute}\\b`, "i").test(createRole));
  }
  check("12. PASSWORD NULL is explicit", /\bpassword\s+null\b/i.test(createRole));
  check("13. no password material or password-setting ALTER ROLE exists",
    !/\bpassword\s+(?!null\b)('[^']*'|\S+)/i.test(createRole)
    && !/alter role[^;]*password/i.test(executableWithoutRoleComment));
  check("14. no authority role is created, altered, dropped, or granted",
    !/\b(create|alter|drop) role\s+(social_authority|social_pair_read_authority)\b/i.test(executableWithoutRoleComment)
    && !/\bgrant\s+(social_authority|social_pair_read_authority)\b/i.test(executableWithoutRoleComment));
  check("15. executor receives no role membership and grants membership to no standard role",
    !/\bgrant\s+[a-z_][a-z0-9_]*\s+to\s+social_runtime_executor\b/i.test(executableWithoutRoleComment)
    && !/\bgrant\s+social_runtime_executor\s+to\s+[a-z_][a-z0-9_]*\b/i.test(executableWithoutRoleComment));

  check("16. migration introduces no GRANT, REVOKE, or default privilege change",
    !/\b(grant|revoke)\b/i.test(executableWithoutRoleComment) && !/alter default privileges/i.test(executableWithoutRoleComment));
  check("17. migration introduces no schema, table, sequence, policy, function, or ownership DDL",
    !/\b(create|alter|drop)\s+(schema|table|sequence|policy|function|view)\b/i.test(executableWithoutRoleComment)
    && !/\bowner\s+to\b/i.test(executableWithoutRoleComment));
  check("18. no direct SELECT or function EXECUTE privilege is introduced",
    !/\bselect\b/i.test(executableWithoutRoleComment) && !/\bexecute\b/i.test(executableWithoutRoleComment));
  check("19. no internal or public schema traversal is granted", !/\busage\s+on\s+schema\b/i.test(executableWithoutRoleComment));
  check("20. anon/authenticated/authenticator/service_role/postgres posture is untouched",
    !/\b(anon|authenticated|authenticator|service_role|postgres)\b/i.test(executableWithoutRoleComment));
  check("21. no service-role or Supavisor credential/configuration is introduced",
    !/service[_-]?role|supavisor|postgres(?:ql)?:\/\/|database_url|db_password/i.test(executableWithoutRoleComment));
  check("22. no PostgREST exposure or remote operation construct is introduced",
    !/pgrst|db_schemas|notify\s+pgrst|alter\s+system|http|net\./i.test(executableWithoutRoleComment));
  check("23. migration is one explicit transaction with no data statement",
    (sql.match(/\bbegin\s*;/gi) ?? []).length === 1 && (sql.match(/\bcommit\s*;/gi) ?? []).length === 1
    && !/\b(insert|update|delete|merge|copy|truncate)\b/i.test(executableWithoutRoleComment));
  check("24. no D1/D2-B1 function payload or signature is mentioned in executable SQL",
    !/authorized_candidates|may_evaluate_candidate|authorized_pair_sources/i.test(executableWithoutRoleComment));
  check("25. migration timestamp is the unique successor after D2-B1",
    MIGRATION > B1
    && fs.readdirSync(path.join(root, "supabase/migrations"))
      .filter((entry) => entry === path.basename(MIGRATION)).length === 1);

  console.log(JSON.stringify({ suite: "social-runtime-executor-sr1b-d2-b2-guard",
    status: failures.length ? "failed" : "passed", totalChecks: checks.length,
    passed: checks.length - failures.length, failed: failures.length, failures,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(JSON.stringify({ suite: "social-runtime-executor-sr1b-d2-b2-guard", status: "crashed",
    error: error instanceof Error ? error.message : String(error), networkUsed: false, databaseUsed: false,
    credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(1);
}
