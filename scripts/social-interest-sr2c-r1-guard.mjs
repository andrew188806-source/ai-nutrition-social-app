#!/usr/bin/env node
// SR-2C-R1 local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2cr1CanonicalManifest,
  SR2CR1_BASELINE, SR2CR1_COMPACT_VISIBLE, SR2CR1_DATA_MIGRATION, SR2CR1_FOOD_CATEGORIES,
  SR2CR1_FORBIDDEN_MARKERS, SR2CR1_FROZEN_MIGRATIONS, SR2CR1_GENERAL_CATEGORIES,
  SR2CR1_MAX_FOOD, SR2CR1_MAX_GENERAL, SR2CR1_MIGRATIONS, SR2CR1_MODULE_ROOT,
  SR2CR1_PROJECTION_MIGRATION, SR2CR1_SCHEMA_MIGRATION, SR2CR1_SUCCESSOR_PATHS
} from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";
import { SR2HB_MIGRATION } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
import { SR2JA_MIGRATION } from "./meal-buddy-chat-sr2j-a-successor-manifest.mjs";
import { SR2KB_PATHS } from "./social-final-sr2k-b-successor-manifest.mjs";
import { GEO1A_PATHS } from "./geo-shared-authority-geo-1a-successor-manifest.mjs";
// GEO-1A's migration, named exactly. A pattern here would admit any future migration.
const GEO1A_MIGRATION_BASENAME = "20260825010000_geo_shared_candidate_authority.sql";

// SR-2K-B's enumerated successor migrations. Naming them keeps this guard's inventory EXACT: any
// migration it has not been told about still fails.
const SR2KB_MIGRATION_BASENAMES = ["20260824010000_meal_buddy_unfriend_authority.sql", "20260824020000_meal_buddy_chat_realtime_authority.sql", "20260824030000_meal_buddy_push_notification_authority.sql"];


// SR-2G-F successor awareness: the one migration that round adds.
const SR2GF_MIGRATION_BASENAME = "20260820010000_meal_buddy_food_context_authority.sql";
const root = process.cwd();
const packageScripts = Object.freeze({
  "test:social-interest-sr2c-r1": "node scripts/social-interest-sr2c-r1-guard.mjs",
  "test:social-interest-sr2c-r1-smoke": "node scripts/social-interest-sr2c-r1-smoke.mjs",
  "test:social-interest-sr2c-r1-mutations": "node scripts/social-interest-sr2c-r1-mutations.mjs",
  "test:social-interest-sr2c-r1-development-acceptance": "node scripts/social-interest-sr2c-r1-development-acceptance.mjs"
});

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout;
}
function gitBytes(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: null, windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return r.stdout;
}
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex");
const lines = (v) => v.split(/\r?\n/).map((e) => e.trim()).filter(Boolean).sort();
const exact = (l, r) => l.length === r.length && l.every((e, i) => e === r[i]);
const sqlExec = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const tsExec = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

function statusPaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0").filter(Boolean).map((e) => e.slice(3).replaceAll("\\", "/")).sort();
}
function deltaEntries(commit = "HEAD") {
  return lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit]))
    .map((e) => { const [status, file] = e.split("\t"); return Object.freeze({ status, path: file.replaceAll("\\", "/") }); });
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
  const baselinePackage = JSON.parse(git(["show", `${SR2CR1_BASELINE}:package.json`]));
  const packageWithout = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithout.scripts[key];
  // SR-2K-A adds three validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:meal-buddy-closure-sr2k-a", "test:meal-buddy-closure-sr2k-a-smoke", "test:meal-buddy-closure-sr2k-a-mutations"]) delete packageWithout.scripts[key];
  // SR-2K-B adds five validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:social-final-sr2k-b", "test:social-final-sr2k-b-smoke", "test:social-final-sr2k-b-mutations", "test:social-final-sr2k-b-concurrency", "test:social-final-sr2k-b-postgres"]) delete packageWithout.scripts[key];
  // GEO-1A registers the shared Geo authority's four command keys. Named exactly, never by pattern.
  for (const key of ["test:geo-shared-authority-geo-1a","test:geo-shared-authority-geo-1a-smoke","test:geo-shared-authority-geo-1a-mutations","test:geo-shared-authority-geo-1a-postgres"]) delete packageWithout.scripts[key];

  const schema = sqlExec(read(SR2CR1_SCHEMA_MIGRATION));
  const data = sqlExec(read(SR2CR1_DATA_MIGRATION));
  const projection = sqlExec(read(SR2CR1_PROJECTION_MIGRATION));
  const allSql = `${schema}\n${data}\n${projection}`;
  const types = tsExec(read(`${SR2CR1_MODULE_ROOT}/types.ts`));
  const aggregate = tsExec(read(`${SR2CR1_MODULE_ROOT}/aggregate.ts`));
  const allTs = `${types}\n${aggregate}\n${tsExec(read(`${SR2CR1_MODULE_ROOT}/index.ts`))}`;

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2CR1_BASELINE}:supabase/migrations`])).filter((f) => f.endsWith(".sql")).sort();
  const fsManifest = createSr2cr1CanonicalManifest((f) => fs.readFileSync(path.join(root, f)));
  const expectedManifestText = SR2CR1_SUCCESSOR_PATHS.map((f) => `${sha256(f)}  ${f}\n`).join("");
  const frozenIndex = lifecycle.frozenShape ? createSr2cr1CanonicalManifest((f) => gitBytes(["show", `:${f}`])) : null;
  const frozenTree = lifecycle.frozenShape ? createSr2cr1CanonicalManifest((f) => gitBytes(["cat-file", "blob", `${state.head}:${f}`])) : null;

  // --- lifecycle / manifest ------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS.length });
  check("3. the baseline is the pushed SR-2G-C-R1 freeze commit", git(["cat-file", "-t", SR2CR1_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2CR1_BASELINE]).trim() === "Repair SR-2G-C pool authority grantor membership");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0);
  check("5. every exact path exists", SR2CR1_SUCCESSOR_PATHS.every((f) => fs.existsSync(path.join(root, f))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2CR1_SUCCESSOR_PATHS).size === SR2CR1_SUCCESSOR_PATHS.length && SR2CR1_SUCCESSOR_PATHS.every((e) => !/[*?[\]{}]/.test(e)));
  check("7. package exposes the exact canonical commands", Object.entries(packageScripts).every(([k, v]) => packageJson.scripts[k] === v));
  check("8. package.json differs from frozen authority only by the SR-2C-R1 scripts", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  const sr2cr1MigrationFiles = migrationFiles.filter((f) => !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE2_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GG_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && `supabase/migrations/${f}` !== SR2HB_MIGRATION && !SR2IA_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && `supabase/migrations/${f}` !== SR2JA_MIGRATION);
  check("9. exactly three migrations are added", SR2CR1_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 3
    && exact(sr2cr1MigrationFiles, [...baselineMigrations, SR2GF_MIGRATION_BASENAME, ...SR2CR1_MIGRATIONS.map((m) => path.basename(m)), ...SR2KB_MIGRATION_BASENAMES, GEO1A_MIGRATION_BASENAME].sort()));
  check("10. no prior migration byte is modified", lines(git(["diff", "--name-only", SR2CR1_BASELINE, "--", "supabase/migrations"])).filter((e) => !SR2CR1_MIGRATIONS.includes(e) && !SR2GD_SUCCESSOR_PATHS.includes(e) && !SR2GE1_SUCCESSOR_PATHS.includes(e) && !SR2GE2_SUCCESSOR_PATHS.includes(e) && !SR2GF_SUCCESSOR_PATHS.includes(e) && !SR2GG_SUCCESSOR_PATHS.includes(e) && e !== SR2HB_MIGRATION && !SR2IA_SUCCESSOR_PATHS.includes(e) && e !== SR2JA_MIGRATION && !SR2KB_PATHS.includes(e) && !GEO1A_PATHS.includes(e)).length === 0);
  check("11. every frozen predecessor migration is byte-unchanged", lines(git(["diff", "--name-only", SR2CR1_BASELINE, "--", ...SR2CR1_FROZEN_MIGRATIONS])).length === 0);
  check("12. every migration is transactional", [schema, data, projection].every((m) => /^begin;/m.test(m) && /^commit;/m.test(m)));

  // --- catalog authority ----------------------------------------------------------------------
  check("13. the catalog is a table, not a PostgreSQL enum", /create table public\.social_interest_catalog/.test(schema) && !/create type[^;]*interest[^;]*as enum/i.test(allSql));
  check("14. no enum type is created anywhere in this round", !/as enum/i.test(allSql));
  check("15. tag_key is the primary key, so identity is the stable machine key", /tag_key text primary key/.test(schema));
  check("16. hierarchy is a self-referencing parent with an integer depth", /parent_key text references public\.social_interest_catalog\(tag_key\)/.test(schema) && /depth integer not null/.test(schema));
  check("17. exactly the top level is parentless", /\(depth = 0\) = \(parent_key is null\)/.test(schema));
  check("18. the two namespaces are constrained and separate", /namespace text not null check \(namespace in \('general', 'food'\)\)/.test(schema));
  check("19. selection namespace is pinned by referential integrity, not trust", /foreign key \(tag_key, namespace\)\s*references public\.social_interest_catalog\(tag_key, namespace\)/.test(schema));
  check("20. localized labels live in a separate table, so identity is never zh-TW text", /create table public\.social_interest_catalog_label/.test(schema) && /locale text not null/.test(schema));
  check("21. no Traditional Chinese appears in any machine key", !/'[a-z_.]*[一-鿿]/.test(data.replace(/'zh-TW', '[^']*'/g, "")));
  check("22. display order is explicit and deterministic", /display_order integer not null/.test(schema) && /order by .*display_order/.test(projection));
  check("23. both namespaces carry exactly eight top categories", SR2CR1_GENERAL_CATEGORIES.length === 8 && SR2CR1_FOOD_CATEGORIES.length === 8
    && SR2CR1_GENERAL_CATEGORIES.every((c) => data.includes(`('general.${c}', 'general', null, 0, false,`))
    && SR2CR1_FOOD_CATEGORIES.every((c) => data.includes(`('food.${c}', 'food', null, 0, false,`)));
  check("24. top categories are never selectable and fine tags always are", !/, 0, true,/.test(data) && !/, 1, false,/.test(data));
  check("25. retirement posture exists", /active boolean not null default true/.test(schema));

  // --- settings write authority ----------------------------------------------------------------
  check("26. the actor comes from authentication only", /v_user_id uuid := auth\.uid\(\)/.test(schema) && !/p_user_id|p_owner/.test(schema));
  check("27. an unauthenticated caller is rejected", /AUTHENTICATION_REQUIRED/.test(schema));
  check("28. general max 8 and food max 5 are enforced server-side",
    new RegExp(`when 'general' then ${SR2CR1_MAX_GENERAL} else ${SR2CR1_MAX_FOOD} end`).test(schema) && /SOCIAL_INTEREST_LIMIT_EXCEEDED/.test(schema));
  check("29. arbitrary, unknown, inactive, non-selectable and cross-namespace keys are all rejected",
    /c\.active/.test(schema) && /c\.selectable/.test(schema) && /c\.namespace = v_namespace/.test(schema) && /SOCIAL_INTEREST_TAG_NOT_SELECTABLE/.test(schema));
  check("30. duplicate inputs are deduplicated before any write", /array_agg\(distinct/.test(schema));
  check("31. replacement is whole-namespace and atomic", /delete from public\.social_profile_interest_selection[\s\S]*?and s\.namespace = v_namespace;/.test(schema));
  check("32. duplicate canonical rows are impossible by construction", /primary key \(user_id, tag_key\)/.test(schema));
  check("33. an empty or null request clears rather than fabricating a default", /coalesce\(p_tag_keys, '\{\}'::text\[\]\)/.test(schema));
  check("34. the write RPC is granted to authenticated and denied to anon and public",
    /grant execute on function public\.replace_authenticated_social_interests\(text, text\[\]\) to authenticated;/.test(schema)
    && /revoke all on function public\.replace_authenticated_social_interests\(text, text\[\]\) from anon;/.test(schema));
  check("35. direct table writes stay closed to every client role",
    /revoke insert, update, delete on table public\.social_profile_interest_selection from public, anon, authenticated;/.test(schema));
  check("36. a user may read only their own selections", /for select to authenticated\s*\n\s*using \(auth\.uid\(\) = user_id\)/.test(schema));

  // --- no card ownership -------------------------------------------------------------------------
  check("37. no migration in this round references meal_buddy_cards", !/meal_buddy_cards/.test(allSql));
  check("38. no snapshot, override or interest-at-creation concept exists anywhere",
    !/interest_snapshot|interestAtCardCreation|cardInterestOverride|interestSnapshot/i.test(`${allSql}\n${allTs}`));
  check("39. the projection reads the CURRENT selection table, never a card", /join public\.social_profile_interest_selection as selection/.test(projection) && !/meal_buddy/.test(projection));
  check("40. no Meal Buddy card API file is part of this candidate", !SR2CR1_SUCCESSOR_PATHS.some((f) => /meal-buddy-card/.test(f)));

  // --- projection ---------------------------------------------------------------------------------
  check("41. the frozen SR-2C five-column primitive is not redefined", !/project_exposed_social_profiles/.test(allSql));
  check("42. the interest primitive is server-internal and denied to every client role",
    ["public", "anon", "authenticated", "authenticator", "service_role"].every((r) =>
      new RegExp(`revoke all on function social_internal\\.project_public_social_interests\\(uuid, uuid\\[\\]\\) from ${r};`).test(projection)));
  check("43. only the executor receives EXECUTE", /grant execute on function social_internal\.project_public_social_interests\(uuid, uuid\[\]\)\s*to social_runtime_executor;/.test(projection));
  check("44. the projection re-checks the canonical candidate pool", /social_internal\.canonical_candidate_pool\(p_actor_user_id\)/.test(projection));
  check("45. the projection returns the parent category explicitly", /category_key text/.test(projection) && /catalog\.parent_key/.test(projection));
  check("46. the projection exposes no user id or surrogate row id", !/select[^;]*requested\.user_id\s*,/.test(projection) && !/selection\.id|catalog\.id/.test(projection));
  check("47. the SR-2B Premium exposure cap is reused, never raised", /if v_count > 10 then/.test(projection));

  // --- aggregation and compact --------------------------------------------------------------------
  check("48. aggregation collapses duplicates to unique top categories", /const seen = new Set<string>\(\)/.test(aggregate) && /if \(seen\.has\(tag\.categoryKey\)\) continue;/.test(aggregate));
  check("49. ordering authority is the catalog display order", /left\.display_order - right\.display_order/.test(aggregate));
  check("50. the compact line shows at most three categories", new RegExp(`SOCIAL_INTEREST_COMPACT_VISIBLE = ${SR2CR1_COMPACT_VISIBLE}`).test(types) && /slice\(0, SOCIAL_INTEREST_COMPACT_VISIBLE\)/.test(aggregate));
  check("51. overflow is derived, never persisted", /Math\.max\(categories\.length - SOCIAL_INTEREST_COMPACT_VISIBLE, 0\)/.test(aggregate) && !/\+N/.test(allSql));
  check("52. canonical fine tags are never truncated to the compact limit", !/publicInterestTags[^\n]*slice\(0, 3\)|foodInterestTags[^\n]*slice\(0, 3\)/.test(aggregate));
  check("53. the module is pure: no clock, randomness, network or database", !/Date\.now|Math\.random|fetch\(|createClient/.test(allTs));

  // --- privacy and isolation -----------------------------------------------------------------------
  const forbidden = SR2CR1_FORBIDDEN_MARKERS.filter((m) => new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${allSql}\n${allTs}`));
  check("54. no inference, Taste, meal, favorite, restriction or health source is referenced", forbidden.length === 0, { forbidden });
  check("55. interests never become ranking input", !/rank|score|boost|match_reason/i.test(allTs.replace(/display_order|displayOrder/g, "")));
  check("56. interests never affect Meal Buddy eligibility", !/dining_date|meal_period|canonical_meal_buddy_candidate_cards/.test(allSql));
  check("57. SR-2B exposure caps and entitlement logic are untouched", !/subscription_entitlements|entitlement/i.test(allSql));
  check("58. no Free or Premium rule is introduced", !/premium|free_tier/i.test(`${allSql}\n${allTs}`));
  check("59. no Mobile path is part of this candidate", !SR2CR1_SUCCESSOR_PATHS.some((f) => f.startsWith("apps/") || f.startsWith("packages/")));
  check("60. no deployable Edge Function is added", !SR2CR1_SUCCESSOR_PATHS.some((f) => /^supabase\/functions\/(?!_shared)/.test(f)));
  check("61. SR-2G-D is not begun", !SR2CR1_SUCCESSOR_PATHS.some((f) => /candidate-list|sr2g-d/i.test(f)));

  // --- privilege discipline --------------------------------------------------------------------------
  check("62. every transient grantor borrow is restored by grantor",
    (projection.match(/grant \w+ to postgres with inherit false, set true;/g) ?? []).length ===
    (projection.match(/revoke \w+ from postgres granted by postgres;/g) ?? []).length);
  check("63. the proven-incorrect WITH SET FALSE restoration is never used", !/with set false/i.test(allSql));
  check("64. no new Social authority role is created", !/create role/i.test(allSql));
  check("65. transient schema CREATE is revoked again", /revoke create on schema social_internal from social_profile_projection_authority;/.test(projection));

  // --- hygiene ----------------------------------------------------------------------------------------
  const secret = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("66. candidate files contain no credential-shaped secret", !SR2CR1_SUCCESSOR_PATHS.map(read).some((t) => secret.test(t)));
  check("67. no candidate file carries a CRLF byte pair", SR2CR1_SUCCESSOR_PATHS.every((f) => !fs.readFileSync(path.join(root, f)).includes(Buffer.from("\r\n"))));
  check("68. no candidate file carries a UTF-8 BOM", SR2CR1_SUCCESSOR_PATHS.every((f) => { const b = fs.readFileSync(path.join(root, f)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));
  check("69. no Production project reference exists", !SR2CR1_SUCCESSOR_PATHS.map(read).some((t) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));

  // --- manifest integrity ---------------------------------------------------------------------------------
  check("70. filesystem manifest text is canonical", fsManifest.text === expectedManifestText);
  check("71. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(fsManifest.aggregateSha256));
  check("72. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndex.aggregateSha256 === fsManifest.aggregateSha256);
  check("73. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTree.aggregateSha256 === fsManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2C-R1", baseline: SR2CR1_BASELINE, phase: effectivePhase,
    paths: SR2CR1_SUCCESSOR_PATHS.length,
    migrationSha256: Object.fromEntries(SR2CR1_MIGRATIONS.map((m) => [path.basename(m), sha256(m)])),
    aggregateSha256: fsManifest.aggregateSha256,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2C-R1", error: error.message }, null, 2));
  process.exit(1);
}
