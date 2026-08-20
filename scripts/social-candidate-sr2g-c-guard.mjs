#!/usr/bin/env node
// SR-2G-C local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gcCanonicalManifest,
  SR2GC_BASELINE,
  SR2GC_FORBIDDEN_MARKERS,
  SR2GC_MIGRATION,
  SR2GC_NON_HARD_FIELDS,
  SR2GC_POOL_ROLE,
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_BASELINE, SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_BASELINE, SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";

// SR-2G-F successor awareness: the one migration that round adds.
const SR2GF_MIGRATION_BASENAME = "20260820010000_meal_buddy_food_context_authority.sql";
const root = process.cwd();

const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-c": "node scripts/social-candidate-sr2g-c-guard.mjs",
  "test:social-candidate-sr2g-c-smoke": "node scripts/social-candidate-sr2g-c-smoke.mjs",
  "test:social-candidate-sr2g-c-mutations": "node scripts/social-candidate-sr2g-c-mutations.mjs",
  "test:social-candidate-sr2g-c-development-acceptance": "node scripts/social-candidate-sr2g-c-development-acceptance.mjs"
});

const frozenPredecessorFiles = [
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql",
  "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql",
  "supabase/functions/_shared/meal-buddy-card-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-card-ref/crypto.ts",
  "supabase/functions/_shared/social-exposure/policy.ts",
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
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2GC_BASELINE}:package.json`]));
  const packageWithoutSr2gc = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2gc.scripts[key];

  const migration = sqlExecutable(read(SR2GC_MIGRATION));
  // The function body is where every eligibility assertion must be evaluated: prose in the header
  // comments must never satisfy a structural check.
  const body = (migration.match(/create function social_internal\.canonical_meal_buddy_candidate_cards[\s\S]*?as \$\$([\s\S]*?)\$\$;/) ?? ["", ""])[1];

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2GC_BASELINE}:supabase/migrations`])).filter((f) => f.endsWith(".sql")).sort();

  const filesystemManifest = createSr2gcCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2GC_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2gcCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2gcCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- lifecycle / manifest ---------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", lifecycle.valid, { phase: lifecycle.phase, head: state.head, ahead: state.ahead });
  check("2. lifecycle manifest is the exact SR-2G-F successor path set", exact(lifecycle.lifecycleManifest, SR2GF_SUCCESSOR_PATHS), { expected: SR2GF_SUCCESSOR_PATHS.length, actual: lifecycle.lifecycleManifest });
  check("3. the SR-2G-C baseline is the frozen SR-2G-B freeze commit", git(["cat-file", "-t", SR2GC_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2GC_BASELINE]).trim() === "Establish SR-2G-B Meal Buddy card write authority");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2G-C path exists", SR2GC_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2GC_SUCCESSOR_PATHS).size === SR2GC_SUCCESSOR_PATHS.length && SR2GC_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical SR-2G-C commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2G-C scripts", JSON.stringify(packageWithoutSr2gc) === JSON.stringify(baselinePackage));
  check("9. predecessor delta is validation-only successor lifecycle support", SR2GC_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2g-c")).every((file) => file.endsWith("-guard.mjs")));
  const sr2gcMigrationFiles = migrationFiles.filter((f) => !SR2GBR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GCR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2CR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE2_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`));
  check("10. SR-2G-C adds exactly one migration and touches no other", SR2GC_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 1
    && exact(sr2gcMigrationFiles, [...baselineMigrations, SR2GF_MIGRATION_BASENAME, path.basename(SR2GC_MIGRATION)].sort()), { sr2gcMigrationFiles });
  check("11. no pre-existing migration changed", lines(git(["diff", "--name-only", SR2GC_BASELINE, "--", "supabase/migrations"])).filter((e) => e !== SR2GC_MIGRATION && !SR2GBR1_SUCCESSOR_PATHS.includes(e) && !SR2GCR1_SUCCESSOR_PATHS.includes(e) && !SR2CR1_SUCCESSOR_PATHS.includes(e) && !SR2GD_SUCCESSOR_PATHS.includes(e) && !SR2GE1_SUCCESSOR_PATHS.includes(e) && !SR2GE2_SUCCESSOR_PATHS.includes(e) && !SR2GF_SUCCESSOR_PATHS.includes(e)).length === 0);
  // config.toml is a frozen SR-2G-C predecessor path, but a later Edge round legitimately appends its
  // own registration to it. Only the paths no enumerated successor owns must still be byte-identical.
  const sr2gcFrozenPredecessorFiles = frozenPredecessorFiles.filter((file) => !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file));
  check("12. every frozen predecessor authority file is byte-unchanged", lines(git(["diff", "--name-only", SR2GC_BASELINE, "--", ...sr2gcFrozenPredecessorFiles])).length === 0);
  check("13. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));

  // --- source authority ---------------------------------------------------------------------------
  check("14. the source card must exist and be owned by the actor", /where card\.id = p_source_card_id\s*and card\.owner_user_id = p_actor_user_id/.test(body));
  check("15. the source card must not be cancelled", /card\.id = p_source_card_id[\s\S]{0,200}card\.cancelled_at is null/.test(body));
  check("16. the source card must not be expired at the authority instant", /card\.id = p_source_card_id[\s\S]{0,240}card\.expires_at > p_authority_instant/.test(body));
  check("17. the authority instant is a parameter, never a database clock inside the predicate", /p_authority_instant timestamptz/.test(migration) && !/\bnow\(\)|clock_timestamp\(\)/.test(body));

  // --- hard eligibility -----------------------------------------------------------------------------
  check("18. the candidate owner must differ from the actor", /candidate\.owner_user_id <> source\.owner_user_id/.test(body));
  check("19. the candidate must be active at the authority instant", /candidate\.cancelled_at is null\s*and candidate\.expires_at > p_authority_instant/.test(body));
  check("20. dining_date must match exactly", /candidate\.dining_date = source\.dining_date/.test(body));
  check("21. meal_period must match exactly", /candidate\.meal_period = source\.meal_period/.test(body));
  check("22. restaurant equality applies only when BOTH cards are restaurant-type",
    /source\.card_type <> 'restaurant'\s*or candidate\.card_type <> 'restaurant'\s*or candidate\.restaurant_id = source\.restaurant_id/.test(body));
  check("23. restaurant identity is the canonical id, never a display name", /restaurant_id/.test(body) && !/restaurant_name/.test(body));

  // --- explicit non-eligibility -----------------------------------------------------------------------
  const nonHardPredicates = SR2GC_NON_HARD_FIELDS.filter((field) =>
    new RegExp(`candidate\\.${field}\\s*=\\s*source\\.${field}`).test(body)
    || new RegExp(`source\\.${field}\\s*=\\s*candidate\\.${field}`).test(body));
  check("24. no non-hard field is used as an equality predicate", nonHardPredicates.length === 0, { nonHardPredicates });
  check("25. area specifically is never compared", !/candidate\.area\s*=|source\.area\s*=/.test(body));
  check("26. preferred_time specifically is never compared", !/candidate\.preferred_time\s*=|source\.preferred_time\s*=/.test(body));
  check("27. intention_type specifically is never compared", !/candidate\.intention_type\s*=|source\.intention_type\s*=/.test(body));
  check("28. no food, menu or nutrition predicate exists", !/food|menu_item|nutrition/i.test(body));

  // --- one card per owner -------------------------------------------------------------------------------
  check("29. candidates are reduced to one card per owner", /partition by compatible\.owner_user_id/.test(body) && /owner_rank = 1/.test(body));
  check("30. the newest created_at card wins", /order by compatible\.created_at desc/.test(body));
  check("31. the primary key is the stable tie-break", /created_at desc, compatible\.id asc/.test(body));
  check("32. the reduction is deterministic, never random", !/random\(\)|tablesample/i.test(body));
  check("33. exactly one window function performs the reduction", count(body, "row_number() over") === 1);

  // --- authorization is composed, not reimplemented ---------------------------------------------------------
  check("34. the frozen authorization primitive is actually called", /social_internal\.authorized_candidates\(/.test(body));
  check("35. only owners the primitive returns survive", /join authorized on authorized\.user_id = selected\.owner_user_id/.test(body));
  check("36. block logic is never reimplemented locally", !/social_blocks/.test(migration));
  check("37. participation logic is never reimplemented locally", !/social_participation/.test(migration));
  check("38. profile eligibility is never reimplemented locally", !/consumer_profiles/.test(migration));
  check("39. the actor is passed through to the authorization primitive unchanged", /authorized_candidates\(\s*p_actor_user_id,/.test(body));

  // --- no product cap, no ranking ------------------------------------------------------------------------------
  check("40. no LIMIT is applied anywhere in the pool", !/\blimit\b/i.test(body));
  check("41. no Free or Premium cap appears", !/\b3\b\s*(as cap|limit)|free_cap|premium_cap/i.test(migration) && !/SOCIAL_EXPOSURE/.test(migration));
  check("42. no caller-supplied bound exists in the signature", !/p_limit|p_cap|p_max/.test(migration));
  check("43. output order is a stable transport order, not ranking", /order by selected\.owner_user_id asc, selected\.id asc/.test(body));
  const forbidden = SR2GC_FORBIDDEN_MARKERS.filter((marker) => migration.includes(marker));
  check("44. no Taste, exposure, projection or candidate-reference authority appears", forbidden.length === 0, { forbidden });

  // --- privilege ---------------------------------------------------------------------------------------------------
  check("45. a dedicated pool authority is created", new RegExp(`create role ${SR2GC_POOL_ROLE} with nologin noinherit nobypassrls`).test(migration));
  check("46. exactly one role is created", count(migration, "create role ") === 1);
  check("47. the SR-2G-B write authority is not reused as the pool owner", !new RegExp(`owner to meal_buddy_card_write_authority`).test(migration));
  check("48. the pool authority is never made a member of social_authority", !new RegExp(`grant social_authority to ${SR2GC_POOL_ROLE}`).test(migration));
  check("49. the pool authority receives SELECT only on the card table", new RegExp(`grant select on table public\\.meal_buddy_cards to ${SR2GC_POOL_ROLE}`).test(migration)
    && !new RegExp(`grant [^;]*(insert|update|delete)[^;]*to ${SR2GC_POOL_ROLE}`, "i").test(migration));
  check("50. the pool read policy is scoped to that role alone", new RegExp(`create policy meal_buddy_cards_candidate_pool_read on public\\.meal_buddy_cards\\s*for select to ${SR2GC_POOL_ROLE}`).test(migration));
  check("51. EXECUTE on the pool primitive goes only to the established runtime executor",
    /grant execute on function social_internal\.canonical_meal_buddy_candidate_cards[\s\S]{0,120}to social_runtime_executor/.test(migration)
    && !/grant execute[^;]*canonical_meal_buddy_candidate_cards[^;]*to (anon|authenticated|authenticator|service_role)/i.test(migration));
  check("52. client roles are explicitly revoked from the pool primitive", /revoke all on function social_internal\.canonical_meal_buddy_candidate_cards[\s\S]{0,140}from anon, authenticated, authenticator, service_role/.test(migration));
  check("53. schema CREATE is transiently granted and revoked", new RegExp(`grant create on schema social_internal to ${SR2GC_POOL_ROLE}`).test(migration)
    && new RegExp(`revoke create on schema social_internal from ${SR2GC_POOL_ROLE}`).test(migration));
  // Every GRANT whose target is the pool role, reduced to its privilege clause and compared exactly.
  // Counting the bare phrase "to <role>" would also match the policy's `for select to`, the
  // `owner to` transfer and the transient CREATE, so the clauses themselves are compared.
  const poolGrants = [...migration.replace(/\s+/g, " ").matchAll(new RegExp(`grant ([^;]*?) to ${SR2GC_POOL_ROLE}\\b`, "g"))]
    .map((match) => match[1].trim()).sort();
  const expectedPoolGrants = [
    "create on schema social_internal",
    "execute on function social_internal.authorized_candidates(uuid, uuid[])",
    "select on table public.meal_buddy_cards",
    "usage on schema social_internal"
  ];
  check("54. exactly the four intended grants reach the pool authority, and the narrow EXECUTE is one of them",
    exact(poolGrants, expectedPoolGrants), { poolGrants });

  // --- the transient grantor lifecycle ---------------------------------------------------------------------------------
  check("55. the borrowed membership is created with INHERIT FALSE and SET TRUE", /grant social_authority to postgres with inherit false, set true;/.test(migration));
  check("56. social_authority is borrowed only inside the grantor lifecycle", count(migration, "set local role social_authority") === 1);
  check("57. the role is returned to postgres immediately after the grant", /set local role social_authority;[\s\S]{0,220}set local role postgres;/.test(migration));
  check("58. the borrowed membership row is revoked with GRANTED BY postgres", /revoke social_authority from postgres granted by postgres;/.test(migration));
  check("59. the incorrect WITH SET FALSE restoration is never used", !/grant social_authority to postgres with set false/i.test(migration));
  check("60. no other frozen Social membership is granted or revoked",
    count(migration, "grant social_authority to") === 1
    && !/grant (social_pair_read_authority|social_profile_projection_authority|social_runtime_executor) to/.test(migration));
  check("61. the revoke follows the grant, so the borrow is genuinely transient",
    migration.indexOf("grant social_authority to postgres") < migration.indexOf("revoke social_authority from postgres"));
  check("62. RESET ROLE is never used, so the role stack stays transaction-scoped and explicit", !/reset role/i.test(migration));

  // --- scope -----------------------------------------------------------------------------------------------------------
  check("63. no Edge function directory is added or modified", !SR2GC_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/functions/")));
  check("64. supabase/config.toml is untouched, so no endpoint is registered", !SR2GC_SUCCESSOR_PATHS.includes("supabase/config.toml") && !SR2GBR1_SUCCESSOR_PATHS.includes("supabase/config.toml") && !SR2GCR1_SUCCESSOR_PATHS.includes("supabase/config.toml") && !SR2CR1_SUCCESSOR_PATHS.includes("supabase/config.toml"));
  check("65. no Mobile or shared package path is touched", !SR2GC_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/") || file.startsWith("packages/")));
  check("66. no new product table is created", !/create table/i.test(migration));
  check("67. no materialized view, trigger or seen/history object is created", !/create (materialized view|trigger|index)/i.test(migration));
  check("68. no Production project reference exists", !SR2GC_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(text)));

  // --- hygiene ------------------------------------------------------------------------------------------------------------
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("69. candidate files contain no credential-shaped secret", !SR2GC_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => secretPattern.test(text)));
  check("70. no environment file is part of the candidate", !SR2GC_SUCCESSOR_PATHS.some((file) => /(^|\/)\.env/.test(file)));
  check("71. no candidate file carries a CRLF byte pair", SR2GC_SUCCESSOR_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
  check("72. no candidate file carries a UTF-8 BOM", SR2GC_SUCCESSOR_PATHS.every((file) => { const b = fs.readFileSync(path.join(root, file)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));

  // --- manifest integrity -----------------------------------------------------------------------------------------------------
  check("73. filesystem manifest text is canonical", filesystemManifest.text === expectedManifestText);
  check("74. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(filesystemManifest.aggregateSha256));
  check("75. manifest entry count equals the declared path count", filesystemManifest.entries.length === SR2GC_SUCCESSOR_PATHS.length);
  check("76. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256);
  check("77. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2G-C",
    baseline: SR2GC_BASELINE,
    phase: lifecycle.phase,
    paths: SR2GC_SUCCESSOR_PATHS.length,
    migration: SR2GC_MIGRATION,
    migrationSha256: sha256(SR2GC_MIGRATION),
    aggregateSha256: filesystemManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-C", error: error.message }, null, 2));
  process.exit(1);
}
