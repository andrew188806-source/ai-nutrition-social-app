#!/usr/bin/env node
// SR-2G-A local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gaCanonicalManifest,
  SR2GA_BASELINE,
  SR2GA_CARD_TYPES,
  SR2GA_COLUMNS,
  SR2GA_FORBIDDEN_COLUMN_MARKERS,
  SR2GA_FORBIDDEN_GRANTEES,
  SR2GA_FORBIDDEN_KEY_MARKERS,
  SR2GA_INTENTION_TYPES,
  SR2GA_MEAL_PERIODS,
  SR2GA_MIGRATION,
  SR2GA_REF_ROOT,
  SR2GA_SUCCESSOR_PATHS,
  SR2GA_TABLE
} from "./social-candidate-sr2g-a-successor-manifest.mjs";
// Lifecycle classification always belongs to the newest round: SR-2G-A's own byte assertions stay
// anchored to SR2GA_BASELINE, while "which commit are we sitting on" is now SR-2G-B's question.
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import {
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_BASELINE, SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_BASELINE, SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";

// SR-2G-F successor awareness: the one migration that round adds.
const SR2GF_MIGRATION_BASENAME = "20260820010000_meal_buddy_food_context_authority.sql";
const root = process.cwd();

const refFiles = ["crypto.ts", "index.ts", "policy.ts", "types.ts"];
const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-a": "node scripts/social-candidate-sr2g-a-guard.mjs",
  "test:social-candidate-sr2g-a-smoke": "node scripts/social-candidate-sr2g-a-smoke.mjs",
  "test:social-candidate-sr2g-a-mutations": "node scripts/social-candidate-sr2g-a-mutations.mjs",
  "test:social-candidate-sr2g-a-development-acceptance": "node scripts/social-candidate-sr2g-a-development-acceptance.mjs"
});

// Frozen predecessor authority that SR-2G-A must not touch by a single byte.
const frozenBackendFiles = [
  "supabase/functions/social-candidate-list/handler.ts",
  "supabase/functions/social-candidate-list/index.ts",
  "supabase/functions/_shared/social-candidate-api/composeCandidateList.ts",
  "supabase/functions/_shared/social-candidate-api/toCandidateDto.ts",
  "supabase/functions/_shared/social-candidate-ref/crypto.ts",
  "supabase/functions/_shared/social-candidate-ref/policy.ts",
  "supabase/functions/_shared/social-exposure/policy.ts",
  "supabase/functions/_shared/social-ranking/policy.ts",
  "supabase/config.toml"
];

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
function gitBytes(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const blobSha256 = (file, ref) => crypto.createHash("sha256").update(gitBytes(["cat-file", "blob", `${ref}:${file}`])).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
// SQL comment stripping: `--` to end of line. The migration's rationale lives in comments and must
// never satisfy a structural assertion.
const sqlExecutable = (source) => source.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const tsExecutable = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
const count = (haystack, needle) => haystack.split(needle).length - 1;

function statusPaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function deltaEntries(commit = "HEAD") {
  return lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit]))
    .map((entry) => { const [status, file] = entry.split("\t"); return Object.freeze({ status, path: file.replaceAll("\\", "/") }); });
}
function lifecycleState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const originHead = git(["rev-parse", "origin/main"]).trim();
  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
  return Object.freeze({
    head, originHead, ahead, behind,
    headParent: head === SR2GF_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GF_BASELINE ? [] : deltaEntries()
  });
}

try {
  const state = lifecycleState();
  const lifecycle = classifySr2gfLifecycle(state);
  const successorLifecycle = classifySr2ggLifecycle({ ...state, headDeltaPaths: state.headDeltaEntries.map(({ path }) => path), headDeleted: state.headDeltaEntries.some(({ status }) => status === "D") });
  const frozenAuthorityAtHead = git(["rev-parse", `${SR2GG_BASELINE}^`]).trim() === SR2GF_BASELINE
    && exact(lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", SR2GG_BASELINE])), SR2GF_SUCCESSOR_PATHS);
  const effectivePhase = lifecycle.valid ? lifecycle.phase : frozenAuthorityAtHead && successorLifecycle.valid ? `successor_${successorLifecycle.phase}` : "invalid";
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2GA_BASELINE}:package.json`]));
  const packageWithoutSr2ga = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2ga.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithoutSr2ga.scripts[key];
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithoutSr2ga.scripts[key];

  const migrationRaw = read(SR2GA_MIGRATION);
  const migration = sqlExecutable(migrationRaw);
  const policy = read(`${SR2GA_REF_ROOT}/policy.ts`);
  const cryptoSource = read(`${SR2GA_REF_ROOT}/crypto.ts`);
  const typesSource = read(`${SR2GA_REF_ROOT}/types.ts`);
  const barrel = read(`${SR2GA_REF_ROOT}/index.ts`);
  const refExecutable = [policy, cryptoSource, typesSource, barrel].map(tsExecutable).join("\n");

  // The CREATE TABLE body, which is where every column and constraint assertion must be evaluated.
  const tableMatch = migration.match(/create table public\.meal_buddy_cards\s*\(([\s\S]*?)\n\);/);
  const tableBody = tableMatch ? tableMatch[1] : "";
  // A column is any body line of the form `<identifier> <type…>` that is not a constraint clause or
  // its continuation. Enumerating accepted TYPES instead would be a blind spot: an `integer`,
  // `boolean` or `numeric` column would simply not be seen, and every forbidden-column assertion
  // below would then pass without ever having looked at it.
  const sqlClauseKeywords = new Set([
    "constraint", "references", "check", "foreign", "primary", "unique", "on", "default", "not", "null"
  ]);
  const declaredColumns = tableBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[a-z_]+\s+[a-z(]/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter((name) => !sqlClauseKeywords.has(name))
    .sort();

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2GA_BASELINE}:supabase/migrations`]))
    .filter((f) => f.endsWith(".sql")).sort();
  const refDirectory = fs.readdirSync(path.join(root, SR2GA_REF_ROOT), { withFileTypes: true })
    .filter((e) => e.isFile()).map(({ name }) => name).sort();

  const filesystemManifest = createSr2gaCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2GA_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2gaCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2gaCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- lifecycle / manifest ---------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS });
  check("3. the SR-2G-A baseline is the frozen SR-2F freeze commit", git(["cat-file", "-t", SR2GA_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2GA_BASELINE]).trim() === "Complete SR-2F Social candidate app composition activation");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2G-A path exists", SR2GA_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2GA_SUCCESSOR_PATHS).size === SR2GA_SUCCESSOR_PATHS.length && SR2GA_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical SR-2G-A commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2G-A scripts", JSON.stringify(packageWithoutSr2ga) === JSON.stringify(baselinePackage));
  check("9. predecessor delta is validation-only successor lifecycle support", SR2GA_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2g-a")).every((file) => file.endsWith("-guard.mjs")));
  check("10. no dependency or lockfile is touched", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies));

  // --- migration scope --------------------------------------------------------------------------
  check("11. SR-2G-A adds exactly one migration", SR2GA_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1);
  const sr2gaMigrationFiles = migrationFiles.filter((f) => !SR2GB_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GC_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GBR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GCR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2CR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE2_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GG_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`));
  check("12. the migration is the only new migration file outside an enumerated successor", exact(sr2gaMigrationFiles, [...baselineMigrations, SR2GF_MIGRATION_BASENAME, path.basename(SR2GA_MIGRATION)].sort()), { added: sr2gaMigrationFiles.filter((f) => !baselineMigrations.includes(f)) });
  // Compared through git rather than raw worktree bytes. The repository runs core.autocrlf=true with
  // no .gitattributes, so older migrations are materialised with CRLF while the object store holds
  // LF: a worktree-vs-blob digest comparison would report every historical migration as drifted and
  // could never pass. git diff applies the same normalisation git itself uses to decide "changed".
  // This round's own migration is excused: once frozen it necessarily appears in the diff against
  // the baseline, and the assertion is about PRE-EXISTING migrations. Without the exclusion the
  // check would pass as a candidate and fail the moment the commit exists.
  const migrationDrift = lines(git(["diff", "--name-only", SR2GA_BASELINE, "--", "supabase/migrations"]))
    .filter((entry) => entry !== SR2GA_MIGRATION && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry) && !SR2GE2_SUCCESSOR_PATHS.includes(entry) && !SR2GF_SUCCESSOR_PATHS.includes(entry) && !SR2GG_SUCCESSOR_PATHS.includes(entry));
  check("13. no pre-existing migration changed", migrationDrift.length === 0, { migrationDrift });
  check("14. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));
  const sr2gaFrozenBackend = frozenBackendFiles.filter((file) => !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file) && !SR2GG_SUCCESSOR_PATHS.includes(file));
  check("15. every frozen predecessor backend file outside an enumerated successor is byte-unchanged", sr2gaFrozenBackend.every((file) => sha256(file) === blobSha256(file, SR2GA_BASELINE)), { drifted: sr2gaFrozenBackend.filter((file) => sha256(file) !== blobSha256(file, SR2GA_BASELINE)) });
  check("16. no Edge function directory is added or modified", !SR2GA_SUCCESSOR_PATHS.some((file) => /^supabase\/functions\/(?!_shared\/meal-buddy-card-ref\/)/.test(file)));
  check("17. SR-2G-A itself registers no Edge function", !SR2GA_SUCCESSOR_PATHS.includes("supabase/config.toml") && (SR2GB_SUCCESSOR_PATHS.includes("supabase/config.toml") || sha256("supabase/config.toml") === blobSha256("supabase/config.toml", SR2GA_BASELINE)));

  // --- schema: identity, columns, enums ----------------------------------------------------------
  check("18. the canonical card table is created", new RegExp(`create table ${SR2GA_TABLE.replace(".", "\\.")}\\s*\\(`).test(migration));
  check("19. card identity is an internal uuid primary key defaulting to gen_random_uuid()", /id uuid not null default gen_random_uuid\(\)/.test(migration) && /primary key \(id\)/.test(migration));
  check("20. the column set is exactly the declared minimum", exact(declaredColumns, SR2GA_COLUMNS), { expected: SR2GA_COLUMNS, actual: declaredColumns });
  check("21. card_type is constrained to the exact enum", SR2GA_CARD_TYPES.every((value) => new RegExp(`card_type in \\([^)]*'${value}'`).test(migration)) && /card_type in \('general', 'restaurant'\)/.test(migration));
  check("22. intention_type is constrained to the exact enum", /intention_type in \('chat_first', 'eat_together'\)/.test(migration));
  check("23. meal_period is constrained to the exact four-value enum", /meal_period in \('breakfast', 'lunch', 'dinner', 'late_night'\)/.test(migration) && SR2GA_MEAL_PERIODS.every((value) => migration.includes(`'${value}'`)));
  check("24. a restaurant card structurally requires a restaurant", /check \(card_type <> 'restaurant' or restaurant_id is not null\)/.test(migration));
  check("25. expiry must follow creation", /check \(expires_at > created_at\)/.test(migration));
  check("26. owner is a cascading foreign key to auth.users", /foreign key \(owner_user_id\)\s*references auth\.users \(id\) on delete cascade/.test(migration));
  check("27. restaurant is a foreign key to the canonical restaurant table", /foreign key \(restaurant_id\)\s*references public\.restaurants \(id\)/.test(migration));
  check("28. dining_date is a local calendar date, not an instant", /dining_date date not null/.test(migration));
  check("29. preferred_time is optional and is not a matching predicate", /preferred_time time,/.test(migration) && !/preferred_time[^\n]*not null/.test(migration));

  // --- schema: what must NOT be there ------------------------------------------------------------
  const forbiddenPresent = SR2GA_FORBIDDEN_COLUMN_MARKERS.filter((marker) => declaredColumns.some((column) => column.includes(marker)));
  check("30. no ranking, score, entitlement, verification, seen, action or geo column exists", forbiddenPresent.length === 0, { forbiddenPresent });
  check("31. lifecycle is derived from cancelled_at and expires_at, never a mutable status flag", declaredColumns.includes("cancelled_at") && declaredColumns.includes("expires_at") && !declaredColumns.includes("status"));
  check("32. no uniqueness constraint other than the primary key exists, so Premium multiplicity survives", count(migration.toLowerCase(), "unique") === 0, { uniqueMentions: count(migration.toLowerCase(), "unique") });
  check("33. no additional table is created", count(migration, "create table ") === 1);
  // Anchored to the table NAME. A body-spanning pattern would match the canonical migration itself,
  // because `intention_type in ('chat_first', …)` legitimately contains "chat".
  check("34. no action, history or analytics table is created", !/create table\s+(public\.)?\w*(seen|impression|invite|match|chat|history|analytic)\w*/i.test(migration));
  check("35. no ranking or eligibility function is created in this phase", !/create (or replace )?function/i.test(migration));
  check("36. no trigger is created", !/create trigger/i.test(migration));
  check("37. area is nullable and carries no constraint, so it is not hard authority", /area text,/.test(migration) && !/check \([^)]*area/.test(migration));

  // --- privilege and RLS --------------------------------------------------------------------------
  check("38. row level security is enabled on the card table", new RegExp(`alter table ${SR2GA_TABLE.replace(".", "\\.")} enable row level security`).test(migration));
  check("39. the only policy is an owner-scoped select", count(migration, "create policy ") === 1 && /create policy meal_buddy_cards_owner_read[\s\S]*?for select[\s\S]*?using \(auth\.uid\(\) = owner_user_id\)/.test(migration));
  check("40. the owner policy is scoped to authenticated, never to public", /create policy meal_buddy_cards_owner_read[\s\S]*?to authenticated/.test(migration));
  check("41. no policy grants insert, update or delete", !/for (insert|update|delete|all)/i.test(migration));
  check("42. default privileges are revoked from public, anon and authenticated", /revoke all on table public\.meal_buddy_cards from public;/.test(migration) && /revoke all on table public\.meal_buddy_cards from anon;/.test(migration) && /revoke all on table public\.meal_buddy_cards from authenticated;/.test(migration));
  check("43. authenticated receives select and nothing else", /grant select on table public\.meal_buddy_cards to authenticated;/.test(migration) && count(migration, "grant ") === 1);
  check("44. no write privilege is granted to any role", !/grant (insert|update|delete|all)/i.test(migration));
  const granted = SR2GA_FORBIDDEN_GRANTEES.filter((role) => new RegExp(`grant [^;]*to ${role}\\b`).test(migration));
  check("45. no forbidden role receives any privilege on the card table", granted.length === 0, { granted });
  check("46. no new database role is created", !/create role/i.test(migration));
  check("47. no schema CREATE is granted to anyone", !/grant create on schema/i.test(migration));

  // --- indexes ------------------------------------------------------------------------------------
  check("48. exactly three indexes are declared", count(migration, "create index ") === 3);
  check("49. the owner index is non-partial so it also serves the auth.users cascade", /create index meal_buddy_cards_owner_idx\s*on public\.meal_buddy_cards \(owner_user_id, dining_date\);/.test(migration));
  check("50. the pool index covers date and period and excludes cancelled cards", /create index meal_buddy_cards_pool_idx\s*on public\.meal_buddy_cards \(dining_date, meal_period\)\s*where cancelled_at is null;/.test(migration));
  check("51. the restaurant index covers the referencing column", /create index meal_buddy_cards_restaurant_idx\s*on public\.meal_buddy_cards \(restaurant_id\)/.test(migration));

  // --- card reference crypto ------------------------------------------------------------------------
  check("52. the reference module contains exactly the four declared files", exact(refDirectory, refFiles), { refDirectory });
  check("53. the reference uses a dedicated secret name", /MEAL_BUDDY_CARD_REF_KEY_ENV = "MEAL_BUDDY_CARD_REF_KEY_V1"/.test(policy));
  const keyReuse = SR2GA_FORBIDDEN_KEY_MARKERS.filter((marker) => refExecutable.includes(marker));
  check("54. no broader or foreign credential is reused as the sealing key", keyReuse.length === 0, { keyReuse });
  check("55. the algorithm is AES-GCM with a validated 32-byte key", /MEAL_BUDDY_CARD_REF_ALGORITHM = "AES-GCM"/.test(policy) && /MEAL_BUDDY_CARD_REF_KEY_BYTES = 32/.test(policy) && /binary\.length !== MEAL_BUDDY_CARD_REF_KEY_BYTES/.test(cryptoSource));
  check("56. the IV is 96 bits and freshly drawn per seal from a CSPRNG", /MEAL_BUDDY_CARD_REF_IV_BYTES = 12/.test(policy) && /crypto\.getRandomValues\(new Uint8Array\(byteLength\)\)/.test(cryptoSource) && /randomIv\(MEAL_BUDDY_CARD_REF_IV_BYTES\)/.test(cryptoSource));
  check("57. the TTL is exactly 24 hours and is enforced, not merely reported", /MEAL_BUDDY_CARD_REF_TTL_MS = 86_400_000/.test(policy) && /nowMs >= \(claims\.expiresAtMs as number\)/.test(cryptoSource));
  check("58. the actor and the purpose are bound as additional authenticated data", /additionalAuthenticatedData\(actorUserId: string, purpose: MealBuddyCardRefPurpose\)/.test(cryptoSource) && /\$\{MEAL_BUDDY_CARD_REF_VERSION\}\|\$\{purpose\}\|\$\{actorUserId\}/.test(cryptoSource));
  check("59. the AAD is used on both seal and open", count(tsExecutable(cryptoSource), "additionalData: additionalAuthenticatedData(") === 2);
  check("60. the purpose is additionally validated in the opened claims", /claims\.purpose !== expectedPurpose/.test(cryptoSource));
  check("61. the two purposes are exactly source and candidate", /MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE = "source"/.test(policy) && /MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE = "candidate"/.test(policy));
  check("62. the token prefix is the versioned mbc1 marker", /MEAL_BUDDY_CARD_REF_PREFIX = "mbc1\."/.test(policy));
  check("63. the seal structurally refuses to emit a token containing the card or the actor", /token\.includes\(card\) \|\| token\.includes\(actor\)/.test(cryptoSource));
  check("64. the reference primitive has no database, HTTP, environment or persistence surface", !/Deno\.env|process\.env|fetch\(|createClient|postgres|INSERT|SELECT /i.test(tsExecutable(cryptoSource) + tsExecutable(policy)));
  check("65. no logging exists anywhere in the reference primitive", !/console\.|logger\./.test(refExecutable));
  check("66. every failure path is one indistinguishable contract violation", count(tsExecutable(cryptoSource), "mealBuddyCardRefContractViolation()") >= 10 && !/catch[\s\S]{0,80}(reason|message|detail)/.test(tsExecutable(cryptoSource)));

  // --- scope: no later-round authority leaked in -----------------------------------------------------
  check("67. no candidate list, pool or eligibility API is added", !SR2GA_SUCCESSOR_PATHS.some((file) => /meal-buddy-candidate|candidate-list|card-create|card-cancel/.test(file)));
  check("68. no Mobile path is touched", !SR2GA_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/") || file.startsWith("packages/")));
  check("69. the raw card id never appears in a public DTO authority", !/meal_buddy_cards\.id|cardId/.test(read("supabase/functions/_shared/social-candidate-api/types.ts")));
  check("70. no Production project reference exists in the candidate", !SR2GA_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(text)));

  // --- secrets and encoding ---------------------------------------------------------------------------
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("71. candidate files contain no credential-shaped secret", !SR2GA_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => secretPattern.test(text)), { offenders: SR2GA_SUCCESSOR_PATHS.filter((file) => secretPattern.test(read(file))) });
  check("72. no environment file is part of the candidate", !SR2GA_SUCCESSOR_PATHS.some((file) => /(^|\/)\.env/.test(file)));
  check("73. no candidate file carries a CRLF byte pair", SR2GA_SUCCESSOR_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))), { crlf: SR2GA_SUCCESSOR_PATHS.filter((file) => fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))) });
  check("74. no candidate file carries a UTF-8 BOM", SR2GA_SUCCESSOR_PATHS.every((file) => { const b = fs.readFileSync(path.join(root, file)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));

  // --- manifest integrity ------------------------------------------------------------------------------
  check("75. filesystem manifest text is canonical", filesystemManifest.text === expectedManifestText);
  check("76. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(filesystemManifest.aggregateSha256));
  check("77. manifest entry count equals the declared path count", filesystemManifest.entries.length === SR2GA_SUCCESSOR_PATHS.length);
  check("78. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256, { frozen: lifecycle.frozenShape });
  check("79. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256, { frozen: lifecycle.frozenShape });

  const summary = Object.freeze({
    round: "SR-2G-A",
    baseline: SR2GA_BASELINE,
    phase: effectivePhase,
    paths: SR2GA_SUCCESSOR_PATHS.length,
    migration: SR2GA_MIGRATION,
    migrationSha256: sha256(SR2GA_MIGRATION),
    aggregateSha256: filesystemManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-A", error: error.message }, null, 2));
  process.exit(1);
}
