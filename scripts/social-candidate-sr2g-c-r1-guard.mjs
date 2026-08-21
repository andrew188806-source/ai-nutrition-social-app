#!/usr/bin/env node
// SR-2G-C-R1 local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gcr1CanonicalManifest,
  SR2GCR1_BASELINE,
  SR2GCR1_FORBIDDEN_MARKERS,
  SR2GCR1_FROZEN_BODY_MD5,
  SR2GCR1_FROZEN_MEMBERSHIPS,
  SR2GCR1_FROZEN_MIGRATIONS,
  SR2GCR1_MIGRATION,
  SR2GCR1_POOL_CAPABILITIES,
  SR2GCR1_SUCCESSOR_PATHS,
  SR2GCR1_TARGET_ROLE
} from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";

// SR-2G-F successor awareness: the one migration that round adds.
const SR2GF_MIGRATION_BASENAME = "20260820010000_meal_buddy_food_context_authority.sql";
const root = process.cwd();

const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-c-r1": "node scripts/social-candidate-sr2g-c-r1-guard.mjs",
  "test:social-candidate-sr2g-c-r1-smoke": "node scripts/social-candidate-sr2g-c-r1-smoke.mjs",
  "test:social-candidate-sr2g-c-r1-mutations": "node scripts/social-candidate-sr2g-c-r1-mutations.mjs",
  "test:social-candidate-sr2g-c-r1-development-acceptance": "node scripts/social-candidate-sr2g-c-r1-development-acceptance.mjs"
});

// The SR-2G-C migration whose semantics this round must leave entirely alone.
const POOL_MIGRATION = "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql";

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
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const sqlExecutable = (source) => source.replace(/(^|\n)\s*--[^\n]*/g, "$1");
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
  const baselinePackage = JSON.parse(git(["show", `${SR2GCR1_BASELINE}:package.json`]));
  const packageWithout = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[key];

  const migrationRaw = read(SR2GCR1_MIGRATION);
  const migration = sqlExecutable(migrationRaw);
  const poolMigration = sqlExecutable(read(POOL_MIGRATION));
  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2GCR1_BASELINE}:supabase/migrations`])).filter((f) => f.endsWith(".sql")).sort();

  const filesystemManifest = createSr2gcr1CanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2GCR1_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2gcr1CanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2gcr1CanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- lifecycle / manifest ---------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, ahead: state.ahead });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS.length });
  check("3. the baseline is the pushed SR-2G-B-R1 freeze commit", git(["cat-file", "-t", SR2GCR1_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2GCR1_BASELINE]).trim() === "Repair SR-2G-B write authority grantor membership");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact path exists", SR2GCR1_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2GCR1_SUCCESSOR_PATHS).size === SR2GCR1_SUCCESSOR_PATHS.length && SR2GCR1_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2G-C-R1 scripts", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  check("9. predecessor delta is validation-only successor lifecycle support", SR2GCR1_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2g-c-r1")).every((file) => file.endsWith("-guard.mjs")));

  // --- migration containment ------------------------------------------------------------------------
  const sr2gcr1MigrationFiles = migrationFiles.filter((f) => !SR2CR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE2_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GG_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`));
  check("10. exactly one migration is added", SR2GCR1_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 1
    && exact(sr2gcr1MigrationFiles, [...baselineMigrations, SR2GF_MIGRATION_BASENAME, path.basename(SR2GCR1_MIGRATION)].sort()), { sr2gcr1MigrationFiles });
  check("11. no prior migration byte is modified", lines(git(["diff", "--name-only", SR2GCR1_BASELINE, "--", "supabase/migrations"])).filter((e) => e !== SR2GCR1_MIGRATION && !SR2CR1_SUCCESSOR_PATHS.includes(e) && !SR2GD_SUCCESSOR_PATHS.includes(e) && !SR2GE1_SUCCESSOR_PATHS.includes(e) && !SR2GE2_SUCCESSOR_PATHS.includes(e) && !SR2GF_SUCCESSOR_PATHS.includes(e) && !SR2GG_SUCCESSOR_PATHS.includes(e)).length === 0);
  check("12. the four frozen Meal Buddy migrations are byte-unchanged", lines(git(["diff", "--name-only", SR2GCR1_BASELINE, "--", ...SR2GCR1_FROZEN_MIGRATIONS])).length === 0);
  check("13. the migration sorts after every frozen Meal Buddy migration", SR2GCR1_FROZEN_MIGRATIONS.every((file) => path.basename(SR2GCR1_MIGRATION) > path.basename(file)));
  check("14. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));

  // --- the repair itself ------------------------------------------------------------------------------
  check("15. the migration contains exactly one executable statement", count(migration.replace(/^begin;|^commit;/gm, ""), ";") === 1);
  check("16. the repair targets the candidate pool authority only",
    new RegExp(`revoke ${SR2GCR1_TARGET_ROLE} from postgres granted by postgres;`).test(migration));
  check("17. the revoke is scoped by GRANTED BY, so only the postgres-granted row is removed", /granted by postgres/.test(migration));
  check("18. the proven-incorrect WITH SET FALSE restoration is never used", !/with set false/i.test(migration));
  check("19. no other role's membership is revoked",
    count(migration, "revoke ") === 1
    && !/revoke (social_authority|social_pair_read_authority|social_profile_projection_authority|social_runtime_executor|meal_buddy_card_write_authority)\b/.test(migration));
  check("20. no membership is granted, so no new grantor path is created", !/^\s*grant /m.test(migration));
  check("21. the revoke names a grantor, never a bare indiscriminate revoke",
    !new RegExp(`revoke ${SR2GCR1_TARGET_ROLE} from postgres;`).test(migration));
  check("22. SR-2G-B-R1's already-repaired write authority is not revoked again", !/meal_buddy_card_write_authority/.test(migration));

  // --- nothing but membership changes -------------------------------------------------------------------
  const forbidden = SR2GCR1_FORBIDDEN_MARKERS.filter((marker) => new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(migration));
  check("23. the migration changes no schema, function, policy, role or privilege object", forbidden.length === 0, { forbidden });
  check("24. the pool primitive is never redefined", !/canonical_meal_buddy_candidate_cards/.test(migration));
  check("25. the frozen authorization primitive is never referenced", !/authorized_candidates/.test(migration));
  check("26. no hard-eligibility or reduction rule appears", !/dining_date|meal_period|restaurant_id|row_number|owner_rank|cancelled_at|expires_at/.test(migration));
  check("27. no Taste ranking or SR-2B exposure is introduced", !/rank|score|similarity|exposure|jaccard|cold[_ ]?start/i.test(migration));
  check("28. no quota, cap or business rule appears", !/quota|cap|\blimit\b|free|premium/i.test(migration));
  check("29. social_authority membership is untouched", !/social_authority/.test(migration));
  check("30. no client role is granted anything", !/(anon|authenticated|authenticator|service_role)/.test(migration));

  // --- the frozen SR-2G-C authority is still whole -------------------------------------------------------
  check("31. the SR-2G-C migration still creates the pool authority as NOLOGIN NOINHERIT NOBYPASSRLS",
    /create role meal_buddy_candidate_pool_authority with\s+nologin\s+noinherit\s+nobypassrls/.test(poolMigration.replace(/ +/g, " ")));
  check("32. the SR-2G-C migration still owns the primitive with the pool authority",
    /owner to meal_buddy_candidate_pool_authority;/.test(poolMigration));
  check("33. the SR-2G-C migration still grants the executor EXECUTE on the primitive",
    /grant execute on function social_internal\.canonical_meal_buddy_candidate_cards\([^)]*\)\s*to social_runtime_executor;/.test(poolMigration));
  check("34. the SR-2G-C migration still grants the pool authority EXECUTE on authorized_candidates",
    /grant execute on function social_internal\.authorized_candidates\([^)]*\)\s*to meal_buddy_candidate_pool_authority;/.test(poolMigration));
  check("35. the SR-2G-C migration still revokes its transient grantor borrow",
    /revoke social_authority from postgres granted by postgres;/.test(poolMigration));
  check("36. the pinned frozen body digests are 32-character lowercase hex",
    Object.values(SR2GCR1_FROZEN_BODY_MD5).every((digest) => /^[0-9a-f]{32}$/.test(digest)));
  check("37. the pinned pool capability set grants no schema CREATE and no broad membership",
    SR2GCR1_POOL_CAPABILITIES.schemaCreate.length === 0
    && exact([...SR2GCR1_POOL_CAPABILITIES.tablePrivileges], ["SELECT"])
    && !SR2GCR1_POOL_CAPABILITIES.executeGrantees.some((role) => ["anon", "authenticated", "service_role", "social_authority"].includes(role)));
  check("38. every other Social authority is pinned to a single supabase_admin row without SET or INHERIT",
    Object.values(SR2GCR1_FROZEN_MEMBERSHIPS).every((row) => row.rows === 1 && row.grantor === "supabase_admin" && row.admin === true && row.inherit === false && row.set === false));

  // --- scope ---------------------------------------------------------------------------------------------
  check("39. no Edge function path is touched", !SR2GCR1_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/functions/")));
  check("40. supabase/config.toml is untouched", !SR2GCR1_SUCCESSOR_PATHS.includes("supabase/config.toml") && !SR2CR1_SUCCESSOR_PATHS.includes("supabase/config.toml"));
  check("41. no Mobile or shared package path is touched", !SR2GCR1_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/") || file.startsWith("packages/")));
  check("42. no later-round authority is begun", !SR2GCR1_SUCCESSOR_PATHS.some((file) => /candidate-list|sr2g-d/i.test(file)));
  check("43. no Production project reference exists", !SR2GCR1_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(text)));

  // --- hygiene --------------------------------------------------------------------------------------------
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("44. candidate files contain no credential-shaped secret", !SR2GCR1_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => secretPattern.test(text)));
  check("45. no environment file is part of the candidate", !SR2GCR1_SUCCESSOR_PATHS.some((file) => /(^|\/)\.env/.test(file)));
  check("46. no candidate file carries a CRLF byte pair", SR2GCR1_SUCCESSOR_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
  check("47. no candidate file carries a UTF-8 BOM", SR2GCR1_SUCCESSOR_PATHS.every((file) => { const b = fs.readFileSync(path.join(root, file)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));

  // --- manifest integrity ------------------------------------------------------------------------------------
  check("48. filesystem manifest text is canonical", filesystemManifest.text === expectedManifestText);
  check("49. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(filesystemManifest.aggregateSha256));
  check("50. manifest entry count equals the declared path count", filesystemManifest.entries.length === SR2GCR1_SUCCESSOR_PATHS.length);
  check("51. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256);
  check("52. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2G-C-R1",
    baseline: SR2GCR1_BASELINE,
    phase: effectivePhase,
    paths: SR2GCR1_SUCCESSOR_PATHS.length,
    migration: SR2GCR1_MIGRATION,
    migrationSha256: sha256(SR2GCR1_MIGRATION),
    aggregateSha256: filesystemManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-C-R1", error: error.message }, null, 2));
  process.exit(1);
}
