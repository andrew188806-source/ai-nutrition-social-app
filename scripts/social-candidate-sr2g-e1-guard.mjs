#!/usr/bin/env node
// SR-2G-E1 local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2ge1CanonicalManifest,
  SR2GE1_BASELINE, SR2GE1_BASELINE_SUBJECT, SR2GE1_CANDIDATE_LIST_FUNCTION, SR2GE1_CARD_LIST_FUNCTION,
  SR2GE1_CARD_REF_PREFIX, SR2GE1_CATALOG_LABEL_TABLE, SR2GE1_COMPACT_VISIBLE, SR2GE1_FEATURE_FILES,
  SR2GE1_FEATURE_ROOT, SR2GE1_FORBIDDEN_MOCK_IMPORTS, SR2GE1_FORBIDDEN_SCOPE_MARKERS,
  SR2GE1_FREE_EXPOSURE, SR2GE1_FROZEN_MOBILE_PATHS, SR2GE1_OWN_PATHS, SR2GE1_PERSON_REF_PREFIX,
  SR2GE1_POLICY_VERSION, SR2GE1_PREMIUM_EXPOSURE, SR2GE1_SHARED_FILES, SR2GE1_SHARED_ROOT,
  SR2GE1_SUCCESSOR_PATHS, SR2GE1_TIME_ZONE, SR2GE1_TOOLING_COMMIT, SR2GE1_TOOLING_PATHS,
  SR2GE1_TOOLING_SUBJECT
} from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { classifySr2ge2Lifecycle, SR2GE2_BASELINE, SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";

const root = process.cwd();
const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-e1": "node scripts/social-candidate-sr2g-e1-guard.mjs",
  "test:social-candidate-sr2g-e1-smoke": "node scripts/social-candidate-sr2g-e1-smoke.mjs",
  "test:social-candidate-sr2g-e1-mutations": "node scripts/social-candidate-sr2g-e1-mutations.mjs",
  "test:social-candidate-sr2g-e1-development-acceptance": "node scripts/social-candidate-sr2g-e1-development-acceptance.mjs"
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
    headParent: head === SR2GE2_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GE2_BASELINE ? [] : deltaEntries()
  });
}

try {
  const state = lifecycleState();
  const lifecycle = classifySr2ge2Lifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2GE1_TOOLING_COMMIT}:package.json`]));
  const packageWithout = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithout.scripts[key];

  const dtoTypes = read(`${SR2GE1_SHARED_ROOT}/types.ts`);
  const dtoValidate = read(`${SR2GE1_SHARED_ROOT}/validate.ts`);
  const contracts = read(`${SR2GE1_FEATURE_ROOT}/supabaseMealBuddyCandidateContracts.ts`);
  const cardRepo = read(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`);
  const candidateRepo = read(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyCandidateRepository.ts`);
  const disabledRepo = read(`${SR2GE1_FEATURE_ROOT}/adapters/disabledMealBuddyRepositories.ts`);
  const errorsAdapter = read(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyErrors.ts`);
  const service = read(`${SR2GE1_FEATURE_ROOT}/mealBuddyCandidateService.ts`);
  const featureTypes = read(`${SR2GE1_FEATURE_ROOT}/types.ts`);
  const flags = read(`${SR2GE1_FEATURE_ROOT}/featureFlags.ts`);
  const factories = read(`${SR2GE1_FEATURE_ROOT}/factories.ts`);
  const binding = read(`${SR2GE1_FEATURE_ROOT}/runtimeBinding.ts`);
  const catalog = read(`${SR2GE1_FEATURE_ROOT}/interestCatalog.ts`);
  const taipei = read(`${SR2GE1_FEATURE_ROOT}/taipeiDiningDate.ts`);
  const demoTime = read("apps/mobile/features/demo-time/demoTimeStore.ts");
  const allFeature = [...SR2GE1_FEATURE_FILES, ...SR2GE1_SHARED_FILES].map(read).map(tsExec).join("\n");

  const fsManifest = createSr2ge1CanonicalManifest((f) => fs.readFileSync(path.join(root, f)));
  const expectedManifestText = SR2GE1_SUCCESSOR_PATHS.map((f) => `${sha256(f)}  ${f}\n`).join("");
  const frozenIndex = lifecycle.frozenShape ? createSr2ge1CanonicalManifest((f) => gitBytes(["show", `:${f}`])) : null;
  const frozenTree = lifecycle.frozenShape ? createSr2ge1CanonicalManifest((f) => gitBytes(["cat-file", "blob", `${state.head}:${f}`])) : null;

  // --- baseline and two-commit stack ------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed over the two-commit stack",
    lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. lifecycle manifest is the exact SR-2G-E2 path set", exact(lifecycle.lifecycleManifest, SR2GE2_SUCCESSOR_PATHS),
    { expected: SR2GE2_SUCCESSOR_PATHS.length, actual: lifecycle.lifecycleManifest });
  // The SR-2G-D commit is still SR-2G-E1's pinned authority. Origin itself legitimately advances as
  // later rounds are pushed, so it is accepted at either the SR-2G-D or the SR-2G-E1 freeze.
  check("3. the pinned authority is the exact frozen SR-2G-D freeze commit",
    git(["cat-file", "-t", SR2GE1_BASELINE]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2GE1_BASELINE]).trim() === SR2GE1_BASELINE_SUBJECT
    && (state.originHead === SR2GE1_BASELINE || state.originHead === SR2GE2_BASELINE));
  check("4. the local tooling predecessor is intact, unamended and still the SR-2G-E1 parent",
    git(["cat-file", "-t", SR2GE1_TOOLING_COMMIT]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2GE1_TOOLING_COMMIT]).trim() === SR2GE1_TOOLING_SUBJECT
    && git(["rev-parse", `${SR2GE1_TOOLING_COMMIT}^`]).trim() === SR2GE1_BASELINE);
  check("5. the tooling commit carries exactly its three Development paths",
    exact(deltaEntries(SR2GE1_TOOLING_COMMIT).map(({ path: p }) => p).sort(), [...SR2GE1_TOOLING_PATHS].sort()));
  check("6. the successor manifest ABSORBS the tooling paths rather than exempting them",
    SR2GE1_TOOLING_PATHS.every((p) => SR2GE1_SUCCESSOR_PATHS.includes(p) || SR2GE2_SUCCESSOR_PATHS.includes(p))
    && SR2GE1_TOOLING_PATHS.every((p) => !SR2GE1_OWN_PATHS.includes(p)));
  check("7. SR-2G-E1 does not recommit the tooling files",
    !lifecycle.frozenShape || !deltaEntries().some(({ path: p }) => SR2GE1_TOOLING_PATHS.includes(p)));
  check("8. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("9. every exact path exists", SR2GE1_SUCCESSOR_PATHS.every((f) => fs.existsSync(path.join(root, f))));
  check("10. candidate paths are wildcard-free and unique",
    new Set(SR2GE1_SUCCESSOR_PATHS).size === SR2GE1_SUCCESSOR_PATHS.length
    && SR2GE1_SUCCESSOR_PATHS.every((e) => !/[*?[\]{}]/.test(e)));
  check("11. package exposes the exact canonical commands", Object.entries(packageScripts).every(([k, v]) => packageJson.scripts[k] === v));
  check("12. package.json differs from the tooling predecessor only by the SR-2G-E1 scripts",
    JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  check("13. no dependency or lockfile is touched",
    JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies)
    && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies));
  check("14. no migration is added or changed", lines(git(["diff", "--name-only", SR2GE1_BASELINE, "--", "supabase/migrations"])).length === 0
    && !SR2GE1_SUCCESSOR_PATHS.some((f) => f.startsWith("supabase/migrations/")));
  check("15. no server authority byte is touched at all",
    lines(git(["diff", "--name-only", SR2GE1_BASELINE, "--", "supabase"])).length === 0
    && !SR2GE1_SUCCESSOR_PATHS.some((f) => f.startsWith("supabase/")));
  check("16. every frozen SR-2E predecessor module is byte-unchanged",
    lines(git(["diff", "--name-only", SR2GE1_BASELINE, "--", ...SR2GE1_FROZEN_MOBILE_PATHS])).length === 0);
  check("17. the predecessor delta outside SR-2G-E1's own module is validation-only successor awareness",
    SR2GE1_OWN_PATHS.filter((f) => f.startsWith("scripts/") && !f.includes("sr2g-e1")).every((f) => f.endsWith("-guard.mjs")));

  // --- real card client and canonical source reference --------------------------------------------
  check("18. a real Meal Buddy card-list client exists and names the frozen SR-2G-B function",
    new RegExp(`MEAL_BUDDY_CARD_LIST_FUNCTION_NAME = "${SR2GE1_CARD_LIST_FUNCTION}"`).test(contracts)
    && /functions\.invoke\(\s*MEAL_BUDDY_CARD_LIST_FUNCTION_NAME/.test(cardRepo));
  check("19. the card list sends the frozen empty body and no owner input",
    /MEAL_BUDDY_CARD_LIST_FUNCTION_NAME, \{ body: \{\} \}/.test(cardRepo)
    && !/ownerUserId|actorUserId|userId/.test(tsExec(cardRepo)));
  check("20. the source reference comes only from that canonical authority",
    /sourceCardRef/.test(cardRepo) && !/sourceCardRef\s*[:=]\s*["'`]mbc1\./.test(allFeature));
  check("21. no source reference is hard-coded anywhere in the feature",
    !/["'`]mbc1\.[A-Za-z0-9_-]{4,}/.test(allFeature));
  check("22. no Development fixture identity is hard-coded",
    !/development\.invalid|mealbuddy\.demo|mealbuddy\.viewer|de300001-/.test(allFeature));
  check("23. the adapter admits only the fields needed to choose and send a card",
    !/\barea\b|preferredTime|createdAt|expiresAt|quota/.test(tsExec(cardRepo)));

  // --- real candidate client --------------------------------------------------------------------------
  check("24. the candidate client names the frozen SR-2G-D function",
    new RegExp(`MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME = "${SR2GE1_CANDIDATE_LIST_FUNCTION}"`).test(contracts)
    && /functions\.invoke\(\s*MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME/.test(candidateRepo));
  check("25. the request body is exactly one source reference",
    /\{ body: \{ sourceCardRef \} \}/.test(candidateRepo));
  check("26. no actor, limit, page, tier, clock or eligibility input is expressible",
    !/actorUserId|candidateUserId|\blimit\b|\bpage\b|cursor|\btier\b|entitlement|clock|diningDate:|mealPeriod:|restaurantId:/.test(tsExec(candidateRepo)));
  check("27. the invoke signatures are literal, so a second business key cannot be added by mistake",
    count(contracts, "invoke<T = unknown>") === 2 && /options: \{ body: MealBuddyCandidateListRequest \}/.test(contracts));
  check("28. the old SR-2D product surface is never called from this feature",
    !/social-candidate-list|SOCIAL_CANDIDATE_LIST_FUNCTION_NAME/.test(allFeature));
  check("29. no direct Social table read exists anywhere in the feature",
    !/\.from\(\s*["'](meal_buddy_cards|consumer_profiles|social_profile_interest_selection|social_participation|social_blocks|subscription_entitlements|taste_profiles)/.test(allFeature));
  // Every `.from(` in the executable feature must live in the interest-catalog module, and that
  // module may name only the PUBLIC label table. The catalog carries no user, candidate or interest
  // SELECTION, so reading it discloses nothing about anybody.
  check("30. the only table this feature may read is the PUBLIC interest catalog",
    (allFeature.match(/\.from\(/g) ?? []).length === (tsExec(catalog).match(/\.from\(/g) ?? []).length
    && new RegExp(`INTEREST_CATALOG_LABEL_TABLE = "${SR2GE1_CATALOG_LABEL_TABLE}"`).test(catalog)
    && /\.from\(INTEREST_CATALOG_LABEL_TABLE\)/.test(catalog));
  check("31. no service-role or admin client can be constructed",
    !/service_role|serviceRole|SUPABASE_SERVICE_ROLE|createClient\(/.test(allFeature));

  // --- DTO validation ------------------------------------------------------------------------------------
  check("32. the shared validator is the only trust boundary",
    /validateMealBuddyCandidateApiResponseV1\(invokeResult\.data\)/.test(candidateRepo)
    && /invalid_server_response/.test(candidateRepo)
    && !/as MealBuddyCandidateApiResponse|as unknown as/.test(tsExec(candidateRepo)));
  check("33. the DTO pins the exact frozen policy version",
    new RegExp(`MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION = "${SR2GE1_POLICY_VERSION}"`).test(dtoTypes));
  check("34. the candidate shape is exactly the eight public fields",
    /MEAL_BUDDY_CANDIDATE_FIELDS = Object\.freeze\(\[[\s\S]*?\] as const\)/.test(dtoTypes)
    && count((dtoTypes.match(/MEAL_BUDDY_CANDIDATE_FIELDS = Object\.freeze\(\[[\s\S]*?\]/) ?? [""])[0], '"') === 16);
  check("35. an unexpected key is a rejection, never an ignored field",
    /function exactKeys/.test(dtoValidate) && count(dtoValidate, "exactKeys(") >= 5);
  check("36. both references are asserted opaque by family marker only",
    new RegExp(`MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX = "${SR2GE1_PERSON_REF_PREFIX.replace(".", "\\.")}"`).test(dtoTypes)
    && new RegExp(`MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX = "${SR2GE1_CARD_REF_PREFIX.replace(".", "\\.")}"`).test(dtoTypes)
    && /startsWith\(MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX\)/.test(dtoValidate)
    && /startsWith\(MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX\)/.test(dtoValidate));
  check("37. no reference is ever decoded, split, parsed or compared beyond its marker",
    !/atob|base64|decodeRef|JSON\.parse\((candidateRef|candidateCardRef)|\.split\(["']\.["']\)/.test(tsExec(allFeature).replace(/value\.split\("\."\)/g, "")));
  check("38. a raw identifier can never be a client-visible field",
    !/candidateUserId|ownerUserId|profileId|\bcardId\b|exposureIndex|exposure_ordinal/.test(dtoTypes));
  // Executable declarations only: the DTO header legitimately explains which facts do NOT exist.
  check("39. no ranking, score or entitlement field exists on the DTO",
    !/rankingState|score|similarity|entitlement|isPremium|plan_code|truncated/.test(tsExec(dtoTypes)));
  check("40. a response longer than the frozen Premium cap is rejected, never trimmed",
    new RegExp(`MEAL_BUDDY_CANDIDATE_MAXIMUM = ${SR2GE1_PREMIUM_EXPOSURE}`).test(dtoTypes)
    && /candidates exceeds the frozen exposure cap/.test(dtoValidate)
    && !/\.slice\(0, MEAL_BUDDY_CANDIDATE_MAXIMUM\)/.test(dtoValidate));
  check("41. a repeated person reference is rejected, proving one owner per response",
    /seenPersonRefs/.test(dtoValidate));

  // --- server order authority -----------------------------------------------------------------------------
  // Scoped to the transport and service. The shared validator legitimately calls Object.keys().sort()
  // to compare KEY SETS, which is not candidate ordering.
  check("42. the client never sorts, reranks, filters or reverses the candidate array",
    !/\.sort\(|\.reverse\(|localeCompare|rankScore|matchReasons/.test(
      tsExec([candidateRepo, cardRepo, service].join("\n"))));
  check("43. no pagination, cursor, page size, offset or refill exists",
    !/cursor|nextPage|pageToken|offset|refill|loadMore|hasMore/i.test(tsExec(allFeature)));
  check("44. no client-side exposure cap exists, and the old 5/3 demo caps are absent",
    !/slice\(0,\s*\d+\)/.test(tsExec(allFeature))
    && !/premium\s*\?\s*5\s*:\s*3|\b5\s*:\s*3\b/.test(tsExec(allFeature))
    && SR2GE1_FREE_EXPOSURE === 3 && SR2GE1_PREMIUM_EXPOSURE === 10);
  check("45. the service is a pass-through that adds no ordering or capping",
    /class MealBuddyCandidateService/.test(service)
    && !/\.sort\(|\.slice\(|\.filter\(/.test(tsExec(service)));
  check("46. the service holds no request-scoped state between calls",
    !/this\.(cache|last|candidates|refs|session)\b/.test(service) && !/let\s+\w+\s*=/.test(tsExec(service)));

  // --- interests are presentation only ------------------------------------------------------------------------
  check("47. labels are resolved through the canonical SR-2C-R1 catalog authority",
    catalog.includes(SR2GE1_CATALOG_LABEL_TABLE) && /loadInterestCategoryLabels/.test(catalog));
  check("48. no hard-coded category label map exists anywhere",
    !/(娛樂|美食|運動|旅遊|音樂|創作|學習|生活)/.test(allFeature)
    && !/entertainment["']?\s*:\s*["']/.test(allFeature));
  check("49. the compact visible limit is the frozen SR-2C-R1 three and is never raised",
    new RegExp(`MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE = ${SR2GE1_COMPACT_VISIBLE}`).test(dtoTypes)
    && /MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE/.test(dtoValidate));
  check("50. a line carrying more than three categories is rejected, not truncated",
    /exceeds the compact visible limit/.test(dtoValidate));
  check("51. a fine-grained interest tag can never reach the client model",
    /isTopLevelCategoryKey/.test(dtoValidate) && /segments\.length === 2/.test(dtoValidate));
  check("52. overflow is derived for display and never persisted or transmitted as text",
    /overflowLabel/.test(catalog) && /`\+\$\{overflowCount\}`/.test(catalog)
    && !/\+N/.test(allFeature));
  check("53. interests never become ordering, scoring or highlighting input",
    !/interestScore|interestRank|sharedInterest|commonCategor|overlap/i.test(allFeature));

  // --- Asia/Taipei dining date ---------------------------------------------------------------------------------
  check("54. the canonical dining-date helper formats through the policy zone",
    new RegExp(`MEAL_BUDDY_DINING_DATE_TIME_ZONE = "${SR2GE1_TIME_ZONE}"`).test(taipei)
    && /Intl\.DateTimeFormat/.test(taipei) && /timeZone: MEAL_BUDDY_DINING_DATE_TIME_ZONE/.test(taipei));
  check("55. the helper performs no offset arithmetic of its own",
    !/getTime\(\)\s*[+-]|8\s*\*\s*60|28800/.test(taipei));
  check("56. the effective day is no longer the UTC day",
    /mealBuddyTaipeiDateKey\(getEffectiveCurrentDate\(\)\)/.test(demoTime)
    && !/getEffectiveCurrentDate\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(demoTime));
  check("57. no dining date is reconstructed from an instant in this feature",
    !/new Date\([^)]*diningDate|Date\.parse\([^)]*diningDate/.test(allFeature));
  check("58. a server dining date is carried as an exact calendar string",
    /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(dtoValidate));

  // --- authentication and state boundaries -------------------------------------------------------------------------
  check("59. every read requires the canonical authenticated session",
    count(`${cardRepo}\n${candidateRepo}`, "authPort.getCurrentSession()") === 2
    && count(`${cardRepo}\n${candidateRepo}`, "authentication_required") === 2);
  check("60. no Authorization header or JWT is handled by this feature",
    !/Authorization|Bearer|access_token|jwt/i.test(allFeature));
  check("61. nothing is persisted to device storage",
    !/AsyncStorage|localStorage|sessionStorage|storage\.setItem|setItem\(/.test(allFeature));
  // `\b` matters: "Factory" contains the letters of "actor", so an unanchored match reads the
  // MealBuddyCandidateFactoryDependencies import as request-scoped state.
  check("62. the runtime binding holds startup configuration only and is clearable",
    /clearMealBuddyCandidateRuntimeDependencies/.test(binding)
    && !/\b(candidateRef|sourceCardRef|session|actor)\b/.test(tsExec(binding))
    && count(tsExec(binding), "let ") === 1);

  // --- distinguishable failure states ---------------------------------------------------------------------------------
  const errorCodes = ["authentication_required", "invalid_request", "server_unavailable", "network_error",
    "invalid_server_response", "internal_error", "no_source_card", "meal_buddy_candidates_disabled"];
  check("63. the client error vocabulary is exactly the eight declared codes",
    errorCodes.every((code) => featureTypes.includes(`"${code}"`))
    && (tsExec(featureTypes).match(/ {2}\| "/g) ?? []).length === errorCodes.length);
  check("64. a legal empty result is a success, never an error",
    /An empty list is a valid, successful response/.test(dtoValidate));
  check("65. holding no active card is its own state, distinct from an empty list",
    /no_source_card/.test(service) && /no_source_card/.test(featureTypes));
  check("66. an unconfigured runtime is its own state and fails closed",
    /meal_buddy_candidates_disabled/.test(disabledRepo) && /errCandidates|errSourceCards/.test(disabledRepo));
  check("67. an infrastructure failure is never converted into an empty list",
    !/catch[\s\S]{0,120}candidates: \[\]/.test(allFeature)
    && !/return okCandidates\(\{[^}]*candidates: \[\]/.test(allFeature));
  check("68. an unknown server code collapses to internal_error, never to a raw message",
    /internal_error/.test(errorsAdapter) && /KNOWN_SERVER_ERROR_CODES/.test(errorsAdapter));
  check("69. no raw server body, SQL fragment or role name can reach a user message",
    !/error\.message|JSON\.stringify\(error/.test(tsExec(errorsAdapter)));

  // --- mock isolation ------------------------------------------------------------------------------------------------------
  const mockLeaks = SR2GE1_FORBIDDEN_MOCK_IMPORTS.filter((marker) => allFeature.includes(marker));
  check("70. the real data layer imports no Meal Buddy mock or demo module", mockLeaks.length === 0, { mockLeaks });
  check("71. a mock candidate source is not even representable in the flags",
    /MealBuddyCandidateSource = "disabled" \| "supabase-live"/.test(flags) && !/"mock"/.test(tsExec(flags)));
  check("72. the factory has no mock branch and falls back only to disabled",
    !/Mock/.test(tsExec(factories)) && count(factories, "Disabled") >= 2);
  check("73. a live source requires live auth and a development environment",
    /authSource !== "supabase-live"/.test(flags) && /supabaseAuthEnabled/.test(flags) && /development-only in SR-2G-E/.test(flags));

  // --- scope ------------------------------------------------------------------------------------------------------------------
  const scopeLeaks = SR2GE1_FORBIDDEN_SCOPE_MARKERS.filter((marker) => new RegExp(marker, "i").test(allFeature));
  check("74. no invite, match, chat, profile-detail or menu-context concept appears", scopeLeaks.length === 0, { scopeLeaks });
  // SR-2G-E1 itself activates no screen. A later enumerated round legitimately does, so its paths
  // are excluded rather than the assertion being dropped.
  check("75. SR-2G-E1 itself begins no screen activation",
    lines(git(["diff", "--name-only", SR2GE1_BASELINE, "--", "apps/mobile/app"]))
      .filter((f) => !SR2GE2_SUCCESSOR_PATHS.includes(f)).length === 0
    && !SR2GE1_SUCCESSOR_PATHS.some((f) => f.startsWith("apps/mobile/app/")));
  check("76. the 116KB Meal Buddy screen and its mock stores are untouched",
    lines(git(["diff", "--name-only", SR2GE1_BASELINE, "--", "apps/mobile/features/meal-buddy-card"])).length === 0);
  // Matched as imports, not as bare words or angle brackets: `error.context` contains the letters of
  // "text", and `invoke<T = unknown>` looks like a JSX open tag to a naive pattern.
  check("77. this data layer renders nothing", !SR2GE1_SUCCESSOR_PATHS.some((f) => f.endsWith(".tsx"))
    && !/from "react"|from "react-native"|react\/jsx|createElement|StyleSheet\.create/.test(allFeature));
  check("78. no full personal profile surface is implemented",
    !/fullProfile|personalProfile|profileScreen|profileDetail/i.test(allFeature));

  // --- Development tooling remains Development-only ---------------------------------------------------------------------------------
  const tooling = SR2GE1_TOOLING_PATHS.map(read).join("\n");
  check("79. every tooling script still hard-pins the Development project",
    SR2GE1_TOOLING_PATHS.every((f) => /msbgnnoorsoefuiwluye/.test(read(f)))
    && count(tooling, "DEVELOPMENT ONLY") === SR2GE1_TOOLING_PATHS.length);
  check("80. the tooling project guard is byte-unchanged by SR-2G-E1",
    lines(git(["diff", "--name-only", SR2GE1_TOOLING_COMMIT, "--", ...SR2GE1_TOOLING_PATHS])).length === 0);
  check("81. no Production project reference exists anywhere in the candidate",
    !SR2GE1_SUCCESSOR_PATHS.map(read).some((t) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));

  // --- hygiene ---------------------------------------------------------------------------------------------------------------------------
  const secret = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,})/;
  check("82. candidate files contain no credential-shaped secret", !SR2GE1_SUCCESSOR_PATHS.map(read).some((t) => secret.test(t)));
  check("83. no environment or credential file is part of the candidate",
    !SR2GE1_SUCCESSOR_PATHS.some((f) => /(^|\/)\.env|credentials/.test(f)));
  check("84. no candidate file carries a CRLF byte pair",
    SR2GE1_SUCCESSOR_PATHS.every((f) => !fs.readFileSync(path.join(root, f)).includes(Buffer.from("\r\n"))));
  check("85. no candidate file carries a UTF-8 BOM",
    SR2GE1_SUCCESSOR_PATHS.every((f) => { const b = fs.readFileSync(path.join(root, f)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));
  check("86. no .gitattributes is introduced", !fs.existsSync(path.join(root, ".gitattributes")));

  // --- manifest integrity ---------------------------------------------------------------------------------------------------------------------
  check("87. filesystem manifest text is canonical", fsManifest.text === expectedManifestText);
  check("88. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(fsManifest.aggregateSha256));
  check("89. manifest entry count equals the declared path count", fsManifest.entries.length === SR2GE1_SUCCESSOR_PATHS.length);
  check("90. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndex.aggregateSha256 === fsManifest.aggregateSha256);
  check("91. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTree.aggregateSha256 === fsManifest.aggregateSha256);

  const summary = Object.freeze({
    round: "SR-2G-E1", baseline: SR2GE1_BASELINE, toolingPredecessor: SR2GE1_TOOLING_COMMIT,
    phase: lifecycle.phase, paths: SR2GE1_SUCCESSOR_PATHS.length, ownPaths: SR2GE1_OWN_PATHS.length,
    absorbedToolingPaths: SR2GE1_TOOLING_PATHS.length,
    aggregateSha256: fsManifest.aggregateSha256,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-E1", error: error.message }, null, 2));
  process.exit(1);
}
