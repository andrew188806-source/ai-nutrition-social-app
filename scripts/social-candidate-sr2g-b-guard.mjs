#!/usr/bin/env node
// SR-2G-B local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gbCanonicalManifest,
  SR2GB_API_ROOT,
  SR2GB_BASELINE,
  SR2GB_EXPIRY_SCHEDULE,
  SR2GB_FORBIDDEN_CANDIDATE_MARKERS,
  SR2GB_FORBIDDEN_REQUEST_FIELDS,
  SR2GB_FORBIDDEN_RESPONSE_MARKERS,
  SR2GB_FREE_CAPS,
  SR2GB_FUNCTIONS,
  SR2GB_MIGRATION,
  SR2GB_PREMIUM_CAPS,
  SR2GB_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-b-successor-manifest.mjs";
// Lifecycle classification always belongs to the newest round: SR-2G-B's own byte assertions stay
// anchored to SR2GB_BASELINE, while "which commit are we sitting on" is now SR-2G-C's question.
import {
  classifySr2gcLifecycle,
  SR2GC_BASELINE,
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";

const root = process.cwd();

const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-b": "node scripts/social-candidate-sr2g-b-guard.mjs",
  "test:social-candidate-sr2g-b-smoke": "node scripts/social-candidate-sr2g-b-smoke.mjs",
  "test:social-candidate-sr2g-b-mutations": "node scripts/social-candidate-sr2g-b-mutations.mjs",
  "test:social-candidate-sr2g-b-development-acceptance": "node scripts/social-candidate-sr2g-b-development-acceptance.mjs"
});

const frozenPredecessorFiles = [
  "supabase/functions/social-candidate-list/handler.ts",
  "supabase/functions/_shared/social-candidate-api/composeCandidateList.ts",
  "supabase/functions/_shared/social-candidate-ref/crypto.ts",
  "supabase/functions/_shared/social-exposure/policy.ts",
  "supabase/functions/_shared/meal-buddy-card-ref/crypto.ts",
  "supabase/functions/_shared/meal-buddy-card-ref/policy.ts",
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql"
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
    headParent: head === SR2GC_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GC_BASELINE ? [] : deltaEntries()
  });
}

try {
  const state = lifecycleState();
  const lifecycle = classifySr2gcLifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2GB_BASELINE}:package.json`]));
  const packageWithoutSr2gb = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2gb.scripts[key];

  const migration = sqlExecutable(read(SR2GB_MIGRATION));
  const policy = read(`${SR2GB_API_ROOT}/policy.ts`);
  const validate = read(`${SR2GB_API_ROOT}/validate.ts`);
  const compose = read(`${SR2GB_API_ROOT}/compose.ts`);
  const runtime = read(`${SR2GB_API_ROOT}/runtime.ts`);
  const requestGuard = read(`${SR2GB_API_ROOT}/request.ts`);
  const errors = read(`${SR2GB_API_ROOT}/errors.ts`);
  const types = read(`${SR2GB_API_ROOT}/types.ts`);
  const handlers = SR2GB_FUNCTIONS.map((name) => read(`supabase/functions/${name}/handler.ts`));
  const allApi = [policy, validate, compose, runtime, requestGuard, errors, types].map(tsExecutable).join("\n");
  const allEdge = [...handlers, ...SR2GB_FUNCTIONS.map((n) => read(`supabase/functions/${n}/index.ts`))].map(tsExecutable).join("\n");
  const everything = `${allApi}\n${allEdge}\n${migration}`;
  const configToml = read("supabase/config.toml");

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const baselineMigrations = lines(git(["ls-tree", "--name-only", `${SR2GB_BASELINE}:supabase/migrations`])).filter((f) => f.endsWith(".sql")).sort();

  const filesystemManifest = createSr2gbCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2GB_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2gbCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2gbCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- lifecycle / manifest ---------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2G-A authority", lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. lifecycle manifest is the exact SR-2G-C path set", exact(lifecycle.lifecycleManifest, SR2GC_SUCCESSOR_PATHS), { expected: SR2GC_SUCCESSOR_PATHS.length, actual: lifecycle.lifecycleManifest });
  check("3. the SR-2G-B baseline is the frozen SR-2G-A freeze commit", git(["cat-file", "-t", SR2GB_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2GB_BASELINE]).trim() === "Establish SR-2G-A canonical Meal Buddy card authority");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2G-B path exists", SR2GB_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2GB_SUCCESSOR_PATHS).size === SR2GB_SUCCESSOR_PATHS.length && SR2GB_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical SR-2G-B commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2G-B scripts", JSON.stringify(packageWithoutSr2gb) === JSON.stringify(baselinePackage));
  check("9. predecessor delta is validation-only successor lifecycle support", SR2GB_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2g-b")).every((file) => file.endsWith("-guard.mjs")));
  check("10. no dependency or lockfile is touched", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies));

  // --- migration scope --------------------------------------------------------------------------
  check("11. SR-2G-B adds exactly one migration", SR2GB_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1);
  const sr2gbMigrationFiles = migrationFiles.filter((f) => !SR2GC_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`));
  check("12. the migration is the only new migration file outside an enumerated successor", exact(sr2gbMigrationFiles, [...baselineMigrations, path.basename(SR2GB_MIGRATION)].sort()), { sr2gbMigrationFiles });
  const migrationDrift = lines(git(["diff", "--name-only", SR2GB_BASELINE, "--", "supabase/migrations"]))
    .filter((entry) => entry !== SR2GB_MIGRATION && !SR2GC_SUCCESSOR_PATHS.includes(entry));
  check("13. no pre-existing migration changed", migrationDrift.length === 0, { migrationDrift });
  check("14. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));
  check("15. every frozen predecessor authority file is byte-unchanged", lines(git(["diff", "--name-only", SR2GB_BASELINE, "--", ...frozenPredecessorFiles])).length === 0);

  // --- frozen quota ------------------------------------------------------------------------------
  check("16. the Free caps are exactly one general and one restaurant card",
    /free: Object\.freeze\(\{ general: 1, restaurant: 1 \}\)/.test(policy) && SR2GB_FREE_CAPS.general === 1 && SR2GB_FREE_CAPS.restaurant === 1);
  check("17. the Premium caps are exactly three general and two restaurant cards",
    /premium: Object\.freeze\(\{ general: 3, restaurant: 2 \}\)/.test(policy) && SR2GB_PREMIUM_CAPS.general === 3 && SR2GB_PREMIUM_CAPS.restaurant === 2);
  check("18. the caps are the only quota authority and are frozen objects", count(policy, "MEAL_BUDDY_CARD_QUOTA") >= 1 && /Object\.freeze\(\{\s*free:/.test(policy));
  check("19. entitlement is resolved through the frozen SR-2B canonical resolver",
    /import \{[^}]*resolveSocialEntitlement[^}]*\} from "\.\.\/social-exposure\/index\.ts"/.test(compose) && /resolveSocialEntitlement\(/.test(compose));
  check("20. no second billing or tier authority is introduced",
    !/subscription_entitlements/.test(allApi) && !/plan_code/.test(tsExecutable(compose)));

  // --- caller carries no authority ----------------------------------------------------------------
  const acceptedKeys = (validate.match(/const CREATE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/) ?? ["", ""])[1];
  check("21. the create body accepts exactly the seven product fields",
    ["cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime"].every((key) => acceptedKeys.includes(`"${key}"`))
    && count(acceptedKeys, '"') === 14, { acceptedKeys });
  check("22. an unknown create key is rejected rather than ignored", /keys\.length !== expected\.length \|\| !keys\.every/.test(validate));
  check("23. no forbidden caller-authority field is ever accepted",
    !SR2GB_FORBIDDEN_REQUEST_FIELDS.some((field) => acceptedKeys.includes(`"${field}"`)),
    SR2GB_FORBIDDEN_REQUEST_FIELDS.filter((field) => acceptedKeys.includes(`"${field}"`)));
  check("24. owner, tier, quota and clock headers are refused", /x-owner-user-id/.test(requestGuard) && /x-tier/.test(requestGuard) && /x-quota/.test(requestGuard) && /x-now/.test(requestGuard));
  check("25. any query parameter is refused", /searchParams/.test(requestGuard));
  check("26. the caller cannot supply an expiry: expires_at is derived in SQL",
    !/expiresAt/.test(acceptedKeys) && /social_internal\.meal_buddy_card_expires_at\(p_dining_date, p_meal_period\)/.test(migration));
  check("27. the actor comes only from the verified session", handlers.every((source) => /authentication\.value\.userId/.test(source)) && !/actorUserId:\s*(body|request)/.test(allEdge));

  // --- atomic quota, no TOCTOU --------------------------------------------------------------------
  check("28. quota is serialised by a transaction-scoped advisory lock keyed by actor and card type",
    /pg_advisory_xact_lock\(/.test(migration) && /p_actor_user_id::pg_catalog\.text \|\| ':' \|\| p_card_type/.test(migration));
  check("29. the lock precedes the active count", migration.indexOf("pg_advisory_xact_lock") < migration.indexOf("into v_used"));
  check("30. the count and the insert live in the same SQL function, never split into JS",
    /insert into public\.meal_buddy_cards/.test(migration)
    && !/insert into/i.test(allApi) && !/select count/i.test(allApi));
  // Targets SQL counting and cap arithmetic, not the word "count": `parseCounts` legitimately
  // reads the server's own totals and must not be mistaken for the Edge doing the counting.
  check("31. the Edge layer issues exactly one statement per operation and owns no counting logic",
    count(runtime, "defineSocialRuntimeExecutorStatement<") === 3
    && !/select\s+count/i.test(tsExecutable(runtime))
    && !/>=\s*cap|<\s*cap|\.length\s*>=/.test(tsExecutable(allApi)));
  check("32. only effectively active cards consume quota",
    /cancelled_at is null[\s\S]{0,80}expires_at > v_now/.test(migration));
  check("33. a cancelled card is excluded from the used count", count(migration, "card.cancelled_at is null") >= 3);
  check("34. an expired card is excluded from the used count", count(migration, "card.expires_at > v_now") >= 3);

  // --- frozen Asia/Taipei expiry ---------------------------------------------------------------------
  check("35. the expiry schedule is the frozen Asia/Taipei meal-occasion end",
    Object.entries(SR2GB_EXPIRY_SCHEDULE).every(([period, time]) =>
      new RegExp(`when '${period}'\\s*then\\s*\\(*\\(p_dining_date${period === "late_night" ? " \\+ 1\\)" : ""} \\+ time '${time}'\\)`).test(migration)),
    { schedule: SR2GB_EXPIRY_SCHEDULE });
  check("36. late_night deliberately crosses midnight into the next local day", /when 'late_night' then \(\(\(p_dining_date \+ 1\) \+ time '02:00'\)/.test(migration));
  check("37. every branch converts through Asia/Taipei, never UTC", count(migration, "at time zone 'Asia/Taipei'") === 4);
  check("38. a past Taipei dining date is refused", /diningDate < taipeiCalendarDate\(requestInstant\)/.test(validate) && /timeZone: MEAL_BUDDY_CARD_TIMEZONE/.test(policy));

  // --- references and identifier containment ---------------------------------------------------------
  check("39. create seals a source-purpose reference from the frozen SR-2G-A primitive",
    /MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE/.test(compose) && /createMealBuddyCardRefCipher/.test(compose));
  check("40. no candidate-purpose reference is ever issued", !/MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE/.test(allApi) && !/candidateCardRef/.test(everything));
  check("41. the client DTO carries a source reference and no raw identifier",
    /sourceCardRef: string/.test(types) && !/\bid: string/.test((types.match(/OwnedMealBuddyCardDto = Readonly<\{[\s\S]*?\}>/) ?? [""])[0]));
  check("42. the seal is asserted not to contain the card or the actor", /sourceCardRef\.includes\(row\.id\) \|\| sourceCardRef\.includes\(actorUserId\)/.test(compose));
  check("43. no forbidden owner, billing or ranking marker can reach a response",
    !SR2GB_FORBIDDEN_RESPONSE_MARKERS.some((marker) => new RegExp(`${marker}\\s*:`).test(types)),
    SR2GB_FORBIDDEN_RESPONSE_MARKERS.filter((marker) => new RegExp(`${marker}\\s*:`).test(types)));
  check("44. the quota DTO exposes used and limit only, never the entitlement class",
    /general: Readonly<\{ used: number; limit: number \}>/.test(types) && !/class/.test((types.match(/MealBuddyCardQuotaDto = Readonly<\{[\s\S]*?\}>/) ?? [""])[0]));

  // --- list -------------------------------------------------------------------------------------------
  check("45. list returns only the actor's own cards", /card\.owner_user_id = p_actor_user_id/.test(migration) && count(migration, "owner_user_id = p_actor_user_id") >= 4);
  check("46. list excludes cancelled and expired cards", /where card\.owner_user_id = p_actor_user_id\s*and card\.cancelled_at is null\s*and card\.expires_at > v_now/.test(migration));
  check("47. list ordering is deterministic with a stable final tie-break",
    /order by\s*card\.dining_date asc,[\s\S]*?card\.created_at desc,\s*card\.id asc/.test(migration));
  check("48. the canonical meal-period order is explicit, not alphabetical", /when 'breakfast' then 1[\s\S]*?when 'late_night' then 4/.test(migration));
  check("49. the list request contract is an empty body", /isEmptyObject/.test(read("supabase/functions/meal-buddy-card-list/handler.ts")));
  check("50. every listed row receives a freshly sealed reference", /for \(const row of cards\) dtos\.push\(await toOwnedCardDto/.test(compose));

  // --- cancel ------------------------------------------------------------------------------------------
  check("51. cancel opens the reference for this actor and the source purpose only",
    /cipher\.open\(actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, sourceCardRef, requestInstant\)/.test(compose));
  check("52. a failed open is an opaque invalid_request", /catch \{\s*return \{ ok: false, errorCode: "invalid_request" \}/.test(compose));
  check("53. ownership is re-verified in the statement, so a reference is never authority",
    /where card\.id = p_card_id\s*and card\.owner_user_id = p_actor_user_id/.test(migration));
  check("54. cancel is idempotent through coalesce, not a second lifecycle state",
    /set cancelled_at = coalesce\(card\.cancelled_at, v_now\)/.test(migration) && !/pg_catalog\.coalesce/.test(migration));
  check("55. a foreign card and a missing card are indistinguishable", /'ok', v_cancelled = 1/.test(migration));
  check("56. the cancel body accepts exactly one key", /keys\.length !== 1 \|\| keys\[0\] !== "sourceCardRef"/.test(validate));
  check("57. no card_not_owned style error exists anywhere", !/card_not_owned|another_user|foreign_card|not_your/i.test(everything));

  // --- privilege ----------------------------------------------------------------------------------------
  check("58. authenticated receives no INSERT, UPDATE or DELETE privilege", !/grant\s+(insert|update|delete|all)[^;]*to authenticated/i.test(migration));
  check("59. the only table privileges granted go to the dedicated write authority",
    /grant select, insert on table public\.meal_buddy_cards to meal_buddy_card_write_authority/.test(migration)
    && /grant update \(cancelled_at\) on table public\.meal_buddy_cards to meal_buddy_card_write_authority/.test(migration));
  check("60. the write authority is NOLOGIN, NOINHERIT and NOBYPASSRLS", /create role meal_buddy_card_write_authority with nologin noinherit nobypassrls/.test(migration));
  check("61. EXECUTE is granted only to the established runtime executor",
    count(migration, "to social_runtime_executor") === 3 && !/grant execute[^;]*to (anon|authenticated|public|service_role)/i.test(migration));
  check("62. schema CREATE is transiently granted and revoked, never left behind",
    /grant create on schema social_internal to meal_buddy_card_write_authority/.test(migration)
    && /revoke create on schema social_internal from meal_buddy_card_write_authority/.test(migration));
  check("63. no new runtime role is created", count(migration, "create role") === 1);
  check("64. service_role is never used as a runtime identity", !/service_role/.test(allApi) && !/service_role/.test(allEdge) && !/to service_role/.test(migration));
  check("65. the grantor lifecycle uses SET LOCAL ROLE and never RESET ROLE", /set local role meal_buddy_card_write_authority/.test(migration) && /set local role postgres/.test(migration) && !/reset role/i.test(migration));

  // --- scope: no later-round authority -------------------------------------------------------------------
  const candidateLeaks = SR2GB_FORBIDDEN_CANDIDATE_MARKERS.filter((marker) => everything.includes(marker));
  check("66. no candidate pool, ranking, exposure or projection authority appears", candidateLeaks.length === 0, { candidateLeaks });
  check("67. no candidate list function is added", !SR2GB_SUCCESSOR_PATHS.some((file) => /meal-buddy-candidate|candidate-list/.test(file)));
  check("68. no Mobile path is touched", !SR2GB_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/") || file.startsWith("packages/")));
  check("69. exactly the three write functions are registered, each verify_jwt", SR2GB_FUNCTIONS.every((name) => new RegExp(`\\[functions\\.${name}\\][^\\[]*?verify_jwt = true`).test(configToml)));
  check("70. no function is registered without JWT verification", !/verify_jwt = false/.test(configToml));

  // --- error vocabulary and logging ------------------------------------------------------------------------
  check("71. the error vocabulary is exactly the four declared codes",
    ["authentication_required", "invalid_request", "card_quota_exceeded", "server_unavailable"].every((code) => errors.includes(code))
    && count(errors, "authentication_required: 401") === 1 && /card_quota_exceeded: 409/.test(errors));
  check("72. no SQL, role, table or count detail reaches a client message", !/social_internal|meal_buddy_cards|advisory|executor/i.test((errors.match(/const MESSAGE[\s\S]*?\};/) ?? [""])[0]));
  check("73. no identity-bearing logging exists", !/console\.|logger\./.test(`${allApi}\n${allEdge}`));

  // --- secrets / encoding -------------------------------------------------------------------------------------
  check("74. the dedicated card-reference secret is the only key named", /MEAL_BUDDY_CARD_REF_KEY_ENV/.test(read(`${SR2GB_API_ROOT}/config.ts`)) && !/SOCIAL_CANDIDATE_REF_KEY_V1/.test(allApi));
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("75. candidate files contain no credential-shaped secret", !SR2GB_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => secretPattern.test(text)));
  check("76. no environment file is part of the candidate", !SR2GB_SUCCESSOR_PATHS.some((file) => /(^|\/)\.env/.test(file)));
  check("77. no Production project reference exists", !SR2GB_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(text)));
  check("78. no candidate file carries a CRLF byte pair", SR2GB_SUCCESSOR_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
  check("79. no candidate file carries a UTF-8 BOM", SR2GB_SUCCESSOR_PATHS.every((file) => { const b = fs.readFileSync(path.join(root, file)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));

  // --- manifest integrity ---------------------------------------------------------------------------------------
  check("80. filesystem manifest text is canonical", filesystemManifest.text === expectedManifestText);
  check("81. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(filesystemManifest.aggregateSha256));
  check("82. manifest entry count equals the declared path count", filesystemManifest.entries.length === SR2GB_SUCCESSOR_PATHS.length);
  check("83. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256);
  check("84. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2G-B",
    baseline: SR2GB_BASELINE,
    phase: lifecycle.phase,
    paths: SR2GB_SUCCESSOR_PATHS.length,
    migration: SR2GB_MIGRATION,
    migrationSha256: sha256(SR2GB_MIGRATION),
    aggregateSha256: filesystemManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-B", error: error.message }, null, 2));
  process.exit(1);
}
