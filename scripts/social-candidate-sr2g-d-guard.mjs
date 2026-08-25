#!/usr/bin/env node
// SR-2G-D local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gdCanonicalManifest,
  SR2GD_API_FILES, SR2GD_API_ROOT, SR2GD_BASELINE, SR2GD_BASELINE_SUBJECT, SR2GD_BRIDGE_FUNCTION,
  SR2GD_CARD_REF_PREFIX, SR2GD_COMPACT_VISIBLE, SR2GD_FORBIDDEN_REQUEST_KEYS,
  SR2GD_FORBIDDEN_RESPONSE_MARKERS, SR2GD_FORBIDDEN_SCOPE_MARKERS, SR2GD_FREE_EXPOSURE,
  SR2GD_FROZEN_MIGRATIONS, SR2GD_FROZEN_MODULES, SR2GD_FUNCTION, SR2GD_FUNCTION_FILES,
  SR2GD_FUNCTION_ROOT, SR2GD_INTEREST_FUNCTION, SR2GD_MIGRATION, SR2GD_PERSON_REF_PREFIX,
  SR2GD_POLICY_VERSION, SR2GD_POOL_FUNCTION, SR2GD_POOL_ROLE, SR2GD_PREMIUM_EXPOSURE,
  SR2GD_PROFILE_FUNCTION, SR2GD_REQUEST_KEY, SR2GD_RESTAURANT_COLUMNS, SR2GD_RESTAURANT_POLICY,
  SR2GD_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_MIGRATION, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";
import { SR2HB_MIGRATION } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_MIGRATION, SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
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
  "test:social-candidate-sr2g-d": "node scripts/social-candidate-sr2g-d-guard.mjs",
  "test:social-candidate-sr2g-d-smoke": "node scripts/social-candidate-sr2g-d-smoke.mjs",
  "test:social-candidate-sr2g-d-mutations": "node scripts/social-candidate-sr2g-d-mutations.mjs",
  "test:social-candidate-sr2g-d-development-acceptance": "node scripts/social-candidate-sr2g-d-development-acceptance.mjs"
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
const count = (haystack, needle) => haystack.split(needle).length - 1;

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
  const baselinePackage = JSON.parse(git(["show", `${SR2GD_BASELINE}:package.json`]));
  const packageWithout = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
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

  const migration = sqlExec(read(SR2GD_MIGRATION));
  const policy = read(`${SR2GD_API_ROOT}/policy.ts`);
  const types = read(`${SR2GD_API_ROOT}/types.ts`);
  const reads = read(`${SR2GD_API_ROOT}/readCandidateCards.ts`);
  const compose = read(`${SR2GD_API_ROOT}/compose.ts`);
  const dto = read(`${SR2GD_API_ROOT}/toCandidateDto.ts`);
  const request = read(`${SR2GD_API_ROOT}/request.ts`);
  const handler = read(`${SR2GD_FUNCTION_ROOT}/handler.ts`);
  const entry = read(`${SR2GD_FUNCTION_ROOT}/index.ts`);
  const errors = read(`${SR2GD_FUNCTION_ROOT}/errors.ts`);
  const config = read(`${SR2GD_FUNCTION_ROOT}/config.ts`);
  const configToml = read("supabase/config.toml");
  const allApi = [policy, types, reads, compose, dto, request].map(tsExec).join("\n");
  const allEdge = [handler, entry, errors, config].map(tsExec).join("\n");
  const allTs = `${allApi}\n${allEdge}`;
  const everything = `${allTs}\n${migration}`;

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2GD_BASELINE}:supabase/migrations`])).filter((f) => f.endsWith(".sql")).sort();
  const fsManifest = createSr2gdCanonicalManifest((f) => fs.readFileSync(path.join(root, f)));
  const expectedManifestText = SR2GD_SUCCESSOR_PATHS.map((f) => `${sha256(f)}  ${f}\n`).join("");
  const frozenIndex = lifecycle.frozenShape ? createSr2gdCanonicalManifest((f) => gitBytes(["show", `:${f}`])) : null;
  const frozenTree = lifecycle.frozenShape ? createSr2gdCanonicalManifest((f) => gitBytes(["cat-file", "blob", `${state.head}:${f}`])) : null;

  // --- lifecycle / manifest ------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS.length });
  check("3. the pinned predecessor is the exact pushed SR-2C-R1 freeze commit",
    git(["cat-file", "-t", SR2GD_BASELINE]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2GD_BASELINE]).trim() === SR2GD_BASELINE_SUBJECT
    && SR2GD_BASELINE === "cfd38635cd33a40737c508e4473385f47347b103");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact path exists", SR2GD_SUCCESSOR_PATHS.every((f) => fs.existsSync(path.join(root, f))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2GD_SUCCESSOR_PATHS).size === SR2GD_SUCCESSOR_PATHS.length && SR2GD_SUCCESSOR_PATHS.every((e) => !/[*?[\]{}]/.test(e)));
  check("7. package exposes the exact canonical commands", Object.entries(packageScripts).every(([k, v]) => packageJson.scripts[k] === v));
  check("8. package.json differs from the frozen predecessor only by the SR-2G-D scripts", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  check("9. no dependency or lockfile is touched", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies));
  check("10. exactly one migration is added", SR2GD_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 1
    && exact(migrationFiles, [...baselineMigrations, SR2GF_MIGRATION_BASENAME, path.basename(SR2GD_MIGRATION), path.basename(SR2GG_MIGRATION), path.basename(SR2HB_MIGRATION), path.basename(SR2IA_MIGRATION), path.basename(SR2JA_MIGRATION), ...SR2KB_MIGRATION_BASENAMES, GEO1A_MIGRATION_BASENAME].sort()));
  check("11. no prior migration byte is modified", lines(git(["diff", "--name-only", SR2GD_BASELINE, "--", "supabase/migrations"])).filter((e) => e !== SR2GD_MIGRATION && !SR2GF_SUCCESSOR_PATHS.includes(e) && !SR2GG_SUCCESSOR_PATHS.includes(e) && e !== SR2HB_MIGRATION && !SR2IA_SUCCESSOR_PATHS.includes(e) && e !== SR2JA_MIGRATION && !SR2KB_PATHS.includes(e) && !GEO1A_PATHS.includes(e)).length === 0);
  check("12. every frozen predecessor migration is byte-unchanged", lines(git(["diff", "--name-only", SR2GD_BASELINE, "--", ...SR2GD_FROZEN_MIGRATIONS])).length === 0);
  check("13. every frozen predecessor runtime module is byte-unchanged", lines(git(["diff", "--name-only", SR2GD_BASELINE, "--", ...SR2GD_FROZEN_MODULES])).length === 0);
  check("14. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));
  check("15. the predecessor delta outside SR-2G-D's own files is validation-only successor awareness",
    SR2GD_SUCCESSOR_PATHS.filter((f) => f.startsWith("scripts/") && !f.includes("sr2g-d")).every((f) => f.endsWith("-guard.mjs")));

  // --- narrow restaurant bridge -----------------------------------------------------------------
  check("16. the bridge grants exactly two restaurant columns and nothing wider",
    new RegExp(`grant select \\(${SR2GD_RESTAURANT_COLUMNS.join(", ")}\\) on table public\\.restaurants to ${SR2GD_POOL_ROLE};`).test(migration)
    && !/grant select on table public\.restaurants/.test(migration));
  check("17. no restaurant write privilege of any kind is granted",
    !/grant\s+(insert|update|delete|truncate|all)[^;]*public\.restaurants/i.test(migration));
  check("18. no client role receives any restaurant or bridge privilege",
    !/to (anon|authenticated|authenticator|service_role|public)\b/i.test(migration.replace(/revoke[^;]*;/gi, "")));
  check("19. the restaurant policy is SELECT only and scoped to the pool authority alone",
    new RegExp(`create policy ${SR2GD_RESTAURANT_POLICY} on public\\.restaurants\\s*\\n\\s*for select to ${SR2GD_POOL_ROLE} using \\(true\\);`).test(migration)
    && count(migration, "create policy") === 1);
  check("20. the bridge composes the frozen SR-2G-C pool rather than restating it",
    new RegExp(`from ${SR2GD_POOL_FUNCTION.replace(".", "\\.")}\\(`).test(migration)
    && !/from public\.meal_buddy_cards/.test(migration));
  check("21. the bridge adds no eligibility predicate",
    !/dining_date\s*=|meal_period\s*=|cancelled_at|expires_at|owner_user_id\s*<>|card_type\s*<>/.test(migration));
  check("22. the bridge adds no ranking, window function, limit or product cap",
    !/row_number|rank\(\)|order by [^;]*score|limit \d|offset \d/i.test(migration));
  check("23. the bridge preserves the frozen pool ordering only", /order by pool\.candidate_owner_user_id asc, pool\.candidate_card_id asc;/.test(migration));
  check("24. the join is a LEFT join, so a general card never vanishes from the pool", /left join public\.restaurants/.test(migration) && !/inner join|(?<!left )\bjoin public\.restaurants/.test(migration));
  check("25. the bridge drops the internal card columns the DTO must never see",
    !/pool\.area|pool\.preferred_time|pool\.created_at|pool\.expires_at/.test(migration));
  check("26. no new database role is created", !/create role/i.test(migration));
  check("27. the frozen SR-2G-C primitive is never redefined or dropped",
    !new RegExp(`(create|create or replace|drop|alter) function ${SR2GD_POOL_FUNCTION.replace(".", "\\.")}`, "i").test(migration));
  check("28. exactly one function is created and it is server-internal",
    count(migration, "create function") === 1 && new RegExp(`create function ${SR2GD_BRIDGE_FUNCTION.replace(".", "\\.")}\\(`).test(migration));
  check("29. every client and unrelated Social role is explicitly revoked",
    ["public", "anon", "authenticated", "authenticator", "service_role", "social_authority", "social_pair_read_authority", "social_profile_projection_authority"]
      .every((role) => new RegExp(`revoke all on function ${SR2GD_BRIDGE_FUNCTION.replace(".", "\\.")}\\(uuid, uuid, timestamptz\\) from ${role};`).test(migration)));
  check("30. only the established runtime executor receives EXECUTE",
    count(migration, "grant execute on function") === 1 && /to social_runtime_executor;/.test(migration));
  check("31. transient schema CREATE is granted and revoked again", /grant create on schema social_internal to /.test(migration) && /revoke create on schema social_internal from /.test(migration));
  check("32. the transient grantor borrow is restored by grantor, leaving no durable membership row",
    (migration.match(/grant \w+ to postgres with inherit false, set true;/g) ?? []).length ===
    (migration.match(/revoke \w+ from postgres granted by postgres;/g) ?? []).length
    && /revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;/.test(migration));
  check("33. the proven-incorrect WITH SET FALSE restoration is never used", !/with set false/i.test(migration));

  // --- request authority -------------------------------------------------------------------------
  check("34. the request contract is exactly one business key",
    new RegExp(`MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY = "${SR2GD_REQUEST_KEY}"`).test(policy)
    && /keys\.length !== 1 \|\| keys\[0\] !== MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY/.test(request));
  check("35. every forbidden business-control key is named and refused",
    SR2GD_FORBIDDEN_REQUEST_KEYS.every((key) => policy.includes(`"${key}"`))
    && /MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS\.some/.test(request));
  check("36. actor, card, tier, page and clock headers are refused",
    ["x-actor-user-id", "x-source-card-id", "x-candidate-card-ref", "x-tier", "x-limit", "x-page", "x-cursor", "x-now", "x-clock", "x-dining-date"]
      .every((header) => request.includes(header)));
  check("37. any query parameter is refused", /searchParams/.test(request));
  check("38. the source reference must carry the frozen SR-2G-A card marker",
    /startsWith\(MEAL_BUDDY_CARD_REF_PREFIX\)/.test(request) && SR2GD_CARD_REF_PREFIX === "mbc1.");
  check("39. the endpoint is POST only", /request\.method !== "POST"/.test(handler));
  check("40. the actor comes only from the verified session",
    /authentication\.value\.userId/.test(handler)
    && !/actorUserId:\s*(body|parsed|request)/.test(allEdge)
    && !/getUser|auth\./.test(allApi));
  // SR-2K-B registers one deliberately non-JWT endpoint: the push dispatcher is operational
  // machinery authenticated by a shared secret, not a user endpoint. It is named explicitly, so any
  // OTHER function registered without JWT verification still fails.
  const nonJwtFunctions = configToml.split("[functions.").slice(1)
    .filter((block) => /verify_jwt = false/.test(block))
    .map((block) => block.split("]")[0].trim());
  check("41. the function is registered with JWT verification and none is registered without it",
    new RegExp(`\\[functions\\.${SR2GD_FUNCTION}\\][^\\[]*?verify_jwt = true`).test(configToml)
    && nonJwtFunctions.every((name) => name === "meal-buddy-push-dispatch"));

  // --- source reference authority ------------------------------------------------------------------
  check("42. the source reference is opened for THIS actor and the SOURCE purpose only",
    /cardCipher\.open\(\s*actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, parsed\.value\.sourceCardRef, requestInstant\s*\)/.test(handler));
  check("43. a failed open is an opaque invalid_request", /catch \{\s*return buildMealBuddyCandidateListError\("invalid_request"\);/.test(handler));
  check("44. no candidate-purpose reference is ever accepted as a source", !/MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE/.test(handler));
  check("45. the candidate card reference is minted for the candidate purpose only",
    /MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE/.test(dto) && !/MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE/.test(dto));
  check("46. opening a reference is never treated as authorization: the pool re-verifies ownership",
    /owner_user_id = p_actor_user_id/.test(read("supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql")));

  // --- frozen composition order --------------------------------------------------------------------
  const order = ["readMealBuddyCandidateCards", "readSocialCandidateTasteSources", "composeMealBuddyContextRanking", "resolveSocialEntitlement", "applySocialExposure", "readExposedSocialProfileFacts", "projectPublicSocialProfiles", "readExposedCandidateInterests", "toMealBuddyCandidateApiResponse"];
  const positions = order.map((symbol) => tsExec(compose).indexOf(`${symbol}(`));
  check("47. the composition calls every frozen authority exactly once, in the frozen order",
    positions.every((p) => p > 0) && positions.every((p, i) => i === 0 || p > positions[i - 1]), { positions });
  check("48. the pool is the only card source and no eligibility rule is duplicated in TypeScript",
    !/dining_date|meal_period|cancelled_at|expires_at|blocked|participation/.test(tsExec(compose))
    && !/from public\.meal_buddy_cards/.test(allTs));
  // SR-2G-F reads the context primitive, which COMPOSES this bridge rather than replacing it, so the
  // bridge must still be the pool source — proven in the SR-2G-F migration, not merely assumed.
  check("49. exactly two executor statements exist, both frozen primitives",
    count(reads, "defineSocialRuntimeExecutorStatement<") === 2
    && reads.includes("social_internal.canonical_meal_buddy_context_candidates")
    && read("supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql").includes(SR2GD_BRIDGE_FUNCTION)
    && reads.includes(SR2GD_INTEREST_FUNCTION));
  check("50. the profile projection is the frozen SR-2C primitive, reused not reimplemented",
    /readExposedSocialProfileFacts|projectPublicSocialProfiles/.test(compose)
    && !allTs.includes(SR2GD_PROFILE_FUNCTION));
  check("51. Taste ranks people only: no card or interest field enters the ranking input",
    /candidateUserId: candidate\.userId/.test(compose)
    && !/cardType|restaurantId|interests?\b/.test((tsExec(compose).match(/const rankingInputs[\s\S]*?\}\)\);/) ?? [""])[0]));
  // Positions are measured at CALL sites: an import statement names every symbol before any of them
  // runs, so comparing import positions would prove nothing about execution order.
  check("52. the owner to card binding is fixed before ranking and only looked up afterwards",
    /const cardByOwner = new Map/.test(compose)
    && compose.indexOf("const cardByOwner = new Map") < compose.indexOf("composeMealBuddyContextRanking(")
    && /cardByOwner\.get\(exposed\.candidateUserId\)/.test(dto)
    && !/cardByOwner\.set|\.sort\(|reselect/.test(dto));
  check("53. no ranking, exposure or eligibility decision is made after exposure",
    !/rankSocialCandidates|applySocialExposure|resolveSocialEntitlement|\.sort\(|\.reverse\(/.test(tsExec(dto)));

  // --- interests are presentation, read last -------------------------------------------------------
  const composeExec = tsExec(compose);
  check("54. interests are read strictly after exposure and after the profile projection",
    composeExec.indexOf("readExposedCandidateInterests(") > composeExec.indexOf("applySocialExposure(")
    && composeExec.indexOf("readExposedCandidateInterests(") > composeExec.indexOf("projectPublicSocialProfiles("));
  check("55. the interest read is bounded by the exposed prefix, never by a caller",
    /exposure\.exposed\.map\(\(entry\) => entry\.candidateUserId\)/.test(compose));
  check("56. interests never enter Taste, ranking, exposure or entitlement",
    !/interest/i.test(composeExec.slice(0, composeExec.indexOf("readExposedCandidateInterests"))));
  check("57. interests are read from the CURRENT profile projection, never from a card",
    reads.includes(SR2GD_INTEREST_FUNCTION)
    && !/meal_buddy_cards|card_id|snapshot|at_creation/i.test((reads.match(/const CANDIDATE_INTERESTS[\s\S]*?`;/) ?? [""])[0]));
  check("58. no interest snapshot, override or card-owned interest concept exists",
    !/interest_snapshot|interestSnapshot|interestAtCard|cardInterest|snapshotInterest/i.test(everything));
  check("59. no inferred, Taste, favorite, meal-history or health interest source is referenced",
    !/taste_profiles|preferred_cuisine_tags|favorite_restaurants|meal_records|dietary_restriction|allergy|allergen|inferred/i.test(everything));

  // --- compact interest presentation ------------------------------------------------------------------
  check("60. the compact derivation reuses the frozen SR-2C-R1 helpers and defines no hierarchy",
    /collectProfileInterests/.test(dto) && /aggregateInterestCategories/.test(dto) && /deriveCompactInterests/.test(dto)
    && /from "\.\.\/social-interest\/aggregate\.ts"/.test(dto));
  check("61. no interest catalog, category list or parent mapping is restated locally",
    !/entertainment|gaming|fitness_sports|travel_outdoors|lifestyle_social|taiwanese_chinese|dessert_drinks|parent_key/i.test(allTs));
  check("62. the visible limit is the frozen SR-2C-R1 three and is never raised here",
    SR2GD_COMPACT_VISIBLE === 3
    && /visibleCategories\.length > 3/.test(dto)
    && !/slice\(0,\s*\d+\)/.test(tsExec(dto)));
  check("63. overflow is derived at read time and never persisted", !/\+N|"\+"|overflow_count/i.test(everything));
  check("64. the DTO exposes top-level category keys only, never a fine-grained tag",
    /generalCategoryKeys: readonly string\[\]/.test(types) && /foodCategoryKeys: readonly string\[\]/.test(types)
    && !/tagKey|tag_key|publicInterestTags|foodInterestTags/.test(types));

  // --- exposure and ranking are frozen -----------------------------------------------------------------
  check("65. the only cap restated is the frozen SR-2B Premium exposure cap",
    new RegExp(`MEAL_BUDDY_CANDIDATE_API_MAXIMUM_CANDIDATES = ${SR2GD_PREMIUM_EXPOSURE}`).test(policy)
    && SR2GD_FREE_EXPOSURE === 3);
  // The refusal lists legitimately NAME the paging vocabulary in order to reject it; what must not
  // exist is any other mention, which would mean the concept had been implemented rather than refused.
  const withoutRefusals = everything
    .replace(/MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/, "")
    .replace(/const AUTHORITY_HEADERS = Object\.freeze\(\[[\s\S]*?\] as const\);/, "");
  check("66. no pagination, cursor, page size, offset or refill exists anywhere",
    !/cursor|nextPage|pageToken|offset|refill|loadMore/i.test(withoutRefusals), {
      residue: (withoutRefusals.match(/.{0,40}(cursor|nextPage|pageToken|offset|refill|loadMore).{0,40}/gi) ?? []).slice(0, 3)
    });
  check("67. no second ranking, scoring or boost authority is introduced",
    !/score|boost|weight|threshold|confidence/i.test(allTs.replace(/rankingWeights|tasteWeights|scoreThreshold|x-score-threshold|x-ranking-weights/g, "")));
  check("68. no entitlement class, plan code or billing fact reaches the DTO",
    !/premium|free_tier|plan_code|entitlementClass/i.test(tsExec(dto)) && !/subscription_entitlements/.test(allTs));

  // --- response privacy ----------------------------------------------------------------------------------
  const dtoBlock = (types.match(/MealBuddyCandidateDto = Readonly<\{[\s\S]*?\}>;/) ?? [""])[0];
  const cardBlock = (types.match(/MealBuddyCandidateCardDto = Readonly<\{[\s\S]*?\}>;/) ?? [""])[0];
  check("69. the client DTO carries both opaque references and no raw identifier",
    /candidateRef: string/.test(dtoBlock) && /candidateCardRef: string/.test(dtoBlock)
    && !SR2GD_FORBIDDEN_RESPONSE_MARKERS.some((marker) => new RegExp(`\\b${marker}\\s*:`).test(dtoBlock)),
    SR2GD_FORBIDDEN_RESPONSE_MARKERS.filter((marker) => new RegExp(`\\b${marker}\\s*:`).test(dtoBlock)));
  check("70. the card DTO carries no card id, owner, area, preferred time or timestamp",
    !/cardId|ownerUserId|area|preferredTime|createdAt|expiresAt|cancelledAt/.test(cardBlock));
  check("71. a general card presents no restaurant at all",
    /card\.cardType === "restaurant"/.test(dto) && /: null;/.test(dto));
  check("72. the restaurant projection is identity plus display name only",
    /MealBuddyCandidateRestaurant = Readonly<\{\s*restaurantId: string;\s*name: string \| null;\s*\}>/.test(types.replace(/\r/g, "")));
  check("73. both references are structurally asserted to contain no internal identifier",
    /identifiers\.some\(\(value\) => candidateRef\.includes\(value\) \|\| candidateCardRef\.includes\(value\)\)/.test(dto));
  check("74. the two reference families use separate dedicated secrets",
    /SOCIAL_CANDIDATE_REF_KEY_ENV/.test(config) && /MEAL_BUDDY_CARD_REF_KEY_ENV/.test(config)
    && SR2GD_PERSON_REF_PREFIX !== SR2GD_CARD_REF_PREFIX);
  check("75. the policy version is the exact declared contract version",
    new RegExp(`MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION = "${SR2GD_POLICY_VERSION}"`).test(policy)
    && new RegExp(`policyVersion: "${SR2GD_POLICY_VERSION}"`).test(types));

  // --- error and empty contract ----------------------------------------------------------------------------
  check("76. the error vocabulary is exactly the three declared codes",
    ["authentication_required: 401", "invalid_request: 400", "server_unavailable: 503"].every((entry) => errors.includes(entry))
    && !/40[49]|409|not_found|card_not_owned|forbidden/i.test(errors));
  check("77. no SQL, role, table, owner or card detail reaches a client message",
    !/social_internal|meal_buddy_cards|restaurants|executor|owner|candidate id/i.test((errors.match(/const MESSAGE[\s\S]*?\};/) ?? [""])[0]));
  check("78. a legal zero-candidate result is a 200 with an empty array, never an error",
    /const EMPTY: MealBuddyCandidateApiResponse = Object\.freeze\(\{/.test(compose)
    && /candidates: Object\.freeze\(\[\]\)/.test(compose)
    && count(compose, "return EMPTY;") >= 2);
  check("79. an infrastructure failure is never converted into an empty success",
    /catch \{[\s\S]{0,200}buildMealBuddyCandidateListError\("server_unavailable"\)/.test(handler));
  check("80. no identity-bearing logging exists", !/console\.|logger\./.test(allTs));

  // --- scope ---------------------------------------------------------------------------------------------------
  const scopeLeaks = SR2GD_FORBIDDEN_SCOPE_MARKERS.filter((marker) => new RegExp(marker, "i").test(everything));
  check("81. no invite, match, chat, seen, GPS or later-round concept appears", scopeLeaks.length === 0, { scopeLeaks });
  check("82. no Mobile path is part of this candidate", !SR2GD_SUCCESSOR_PATHS.some((f) => f.startsWith("apps/") || f.startsWith("packages/")));
  check("83. no full personal profile surface is implemented",
    !/fullProfile|profileDetail|personalProfile|profileScreen/i.test(everything));
  check("84. exactly one Edge function is added", SR2GD_SUCCESSOR_PATHS.filter((f) => /^supabase\/functions\/(?!_shared)/.test(f)).length === SR2GD_FUNCTION_FILES.length
    && SR2GD_FUNCTION_FILES.every((f) => f.startsWith(`${SR2GD_FUNCTION_ROOT}/`)));
  check("85. the shared module is confined to its own directory", SR2GD_API_FILES.every((f) => f.startsWith(`${SR2GD_API_ROOT}/`)));
  check("86. no service_role is ever used as a runtime identity", !/service_role/.test(allTs));
  check("87. no Node-only dependency is imported", !/from "node:|require\(/.test(allTs));
  check("88. no Production project reference exists",
    !SR2GD_SUCCESSOR_PATHS.map(read).some((t) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));

  // --- hygiene ----------------------------------------------------------------------------------------------------
  const secret = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("89. candidate files contain no credential-shaped secret", !SR2GD_SUCCESSOR_PATHS.map(read).some((t) => secret.test(t)));
  check("90. no environment file is part of the candidate", !SR2GD_SUCCESSOR_PATHS.some((f) => /(^|\/)\.env/.test(f)));
  check("91. no candidate file carries a CRLF byte pair", SR2GD_SUCCESSOR_PATHS.every((f) => !fs.readFileSync(path.join(root, f)).includes(Buffer.from("\r\n"))));
  check("92. no candidate file carries a UTF-8 BOM", SR2GD_SUCCESSOR_PATHS.every((f) => { const b = fs.readFileSync(path.join(root, f)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));
  check("93. no .gitattributes is introduced", !fs.existsSync(path.join(root, ".gitattributes")) && !SR2GD_SUCCESSOR_PATHS.includes(".gitattributes"));

  // --- manifest integrity --------------------------------------------------------------------------------------------
  check("94. filesystem manifest text is canonical", fsManifest.text === expectedManifestText);
  check("95. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(fsManifest.aggregateSha256));
  check("96. manifest entry count equals the declared path count", fsManifest.entries.length === SR2GD_SUCCESSOR_PATHS.length);
  check("97. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndex.aggregateSha256 === fsManifest.aggregateSha256);
  check("98. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTree.aggregateSha256 === fsManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2G-D", baseline: SR2GD_BASELINE, phase: effectivePhase,
    paths: SR2GD_SUCCESSOR_PATHS.length,
    migration: SR2GD_MIGRATION, migrationSha256: sha256(SR2GD_MIGRATION),
    aggregateSha256: fsManifest.aggregateSha256,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-D", error: error.message }, null, 2));
  process.exit(1);
}
