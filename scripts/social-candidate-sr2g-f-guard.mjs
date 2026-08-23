#!/usr/bin/env node
// SR-2G-F local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2gfCanonicalManifest, classifySr2gfLifecycle,
  SR2GF_BASELINE, SR2GF_BASELINE_SUBJECT, SR2GF_CANDIDATE_API_ROOT, SR2GF_CARD_API_ROOT,
  SR2GF_CARD_REF_PREFIX, SR2GF_CONTEXT_FILES, SR2GF_CONTEXT_NAMESPACE, SR2GF_CONTEXT_PRIMITIVE,
  SR2GF_CONTEXT_ROOT, SR2GF_CONTEXT_STATES, SR2GF_FEATURE_ROOT, SR2GF_FORBIDDEN_HEALTH_EVIDENCE,
  SR2GF_FORBIDDEN_SCOPE_MARKERS, SR2GF_FORBIDDEN_SCORE_MARKERS, SR2GF_FREE_EXPOSURE,
  SR2GF_FROZEN_AUTHORITY_PATHS, SR2GF_FROZEN_CANDIDATE_PRIMITIVE, SR2GF_FROZEN_MIGRATIONS,
  SR2GF_FROZEN_POOL_PRIMITIVE, SR2GF_MIGRATION, SR2GF_POLICY_VERSION, SR2GF_PREMIUM_EXPOSURE,
  SR2GF_PROOF_CONTEXTS, SR2GF_RANKING_POLICY_VERSION, SR2GF_SUCCESSOR_PATHS, SR2GF_TIME_ZONE
} from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE } from "./social-candidate-sr2g-g-successor-manifest.mjs";

const root = process.cwd();
const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-f": "node scripts/social-candidate-sr2g-f-guard.mjs",
  "test:social-candidate-sr2g-f-smoke": "node scripts/social-candidate-sr2g-f-smoke.mjs",
  "test:social-candidate-sr2g-f-mutations": "node scripts/social-candidate-sr2g-f-mutations.mjs",
  "test:social-candidate-sr2g-f-development-acceptance": "node scripts/social-candidate-sr2g-f-development-acceptance.mjs"
});

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
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
// SQL comments are prose and legitimately name the very things the executable body must not do, and
// so does a `comment on ... is '...'` body — both are stripped before any "must not appear" scan.
const sqlExec = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const sqlProse = (s) => sqlExec(s).replace(/comment on [\s\S]*?';/g, "");
// Just the CONTEXT primitive. The successor write and list functions in the same migration
// legitimately reproduce the frozen owner-card ordering and the frozen card-type branch, neither of
// which is candidate eligibility or context evidence.
const contextBody = (s) => {
  const start = s.indexOf("create function social_internal.canonical_meal_buddy_context_candidates(");
  const end = s.indexOf("comment on function social_internal.canonical_meal_buddy_context_candidates");
  return start < 0 || end < 0 ? "" : sqlExec(s.slice(start, end));
};
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
  const successorLifecycle = classifySr2ggLifecycle({
    ...state,
    headDeltaPaths: state.headDeltaEntries.map(({ path }) => path),
    headDeleted: state.headDeltaEntries.some(({ status }) => status === "D")
  });
  const frozenAuthorityAtHead = git(["rev-parse", `${SR2GG_BASELINE}^`]).trim() === SR2GF_BASELINE
    && exact(lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", SR2GG_BASELINE])), SR2GF_SUCCESSOR_PATHS);
  const effectivePhase = lifecycle.valid ? lifecycle.phase : frozenAuthorityAtHead && successorLifecycle.valid
    ? `successor_${successorLifecycle.phase}` : "invalid";
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2GF_BASELINE}:package.json`]));
  const packageWithout = structuredClone(packageJson);
  for (const key of Object.keys(packageScripts)) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) {
    delete packageWithout.scripts[key];
  }
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithout.scripts[key];

  const migration = read(SR2GF_MIGRATION);
  const migrationExec = sqlExec(migration);
  const migrationBody = sqlProse(migration);
  const contextPrimitive = contextBody(migration);
  const contextCompose = read(`${SR2GF_CONTEXT_ROOT}/composeContextRanking.ts`);
  const contextPolicy = read(`${SR2GF_CONTEXT_ROOT}/policy.ts`);
  const contextTypes = read(`${SR2GF_CONTEXT_ROOT}/types.ts`);
  const compose = read(`${SR2GF_CANDIDATE_API_ROOT}/compose.ts`);
  const composeExec = tsExec(compose);
  const readCards = read(`${SR2GF_CANDIDATE_API_ROOT}/readCandidateCards.ts`);
  const candidateTypes = read(`${SR2GF_CANDIDATE_API_ROOT}/types.ts`);
  const cardValidate = read(`${SR2GF_CARD_API_ROOT}/validate.ts`);
  const cardRuntime = read(`${SR2GF_CARD_API_ROOT}/runtime.ts`);
  const cardCompose = read(`${SR2GF_CARD_API_ROOT}/compose.ts`);
  const cardTypes = read(`${SR2GF_CARD_API_ROOT}/types.ts`);
  const createHandler = read("supabase/functions/meal-buddy-card-create/handler.ts");
  const picker = read(`${SR2GF_FEATURE_ROOT}/MealBuddyRealSourceCardPicker.tsx`);
  const sourceRepo = read(`${SR2GF_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`);
  const mobileTypes = read(`${SR2GF_FEATURE_ROOT}/types.ts`);
  const seed = read("scripts/development/meal-buddy-demo-seed.mjs");
  const allContext = SR2GF_CONTEXT_FILES.map((f) => tsExec(read(f))).join("\n");
  const allServer = [migrationExec, allContext, composeExec, tsExec(readCards)].join("\n");
  const allMobile = [picker, sourceRepo, mobileTypes].map(tsExec).join("\n");

  const fsManifest = createSr2gfCanonicalManifest((f) => fs.readFileSync(path.join(root, f)));
  const expectedManifestText = SR2GF_SUCCESSOR_PATHS.map((f) => `${sha256(f)}  ${f}\n`).join("");
  const frozenIndex = frozenAuthorityAtHead ? createSr2gfCanonicalManifest((f) => gitBytes(["show", `${SR2GG_BASELINE}:${f}`])) : null;
  const frozenTree = frozenAuthorityAtHead ? createSr2gfCanonicalManifest((f) => gitBytes(["cat-file", "blob", `${SR2GG_BASELINE}:${f}`])) : null;

  // --- baseline and lifecycle ---------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2G-E2 authority",
    effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead,
    { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS.length });
  check("3. the pinned predecessor is the exact pushed SR-2G-E2 freeze commit",
    git(["cat-file", "-t", SR2GF_BASELINE]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2GF_BASELINE]).trim() === SR2GF_BASELINE_SUBJECT);
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact path exists", SR2GF_SUCCESSOR_PATHS.every((f) => fs.existsSync(path.join(root, f))));
  check("6. candidate paths are wildcard-free and unique",
    new Set(SR2GF_SUCCESSOR_PATHS).size === SR2GF_SUCCESSOR_PATHS.length
    && SR2GF_SUCCESSOR_PATHS.every((e) => !/[*?[\]{}]/.test(e)));
  check("7. package exposes the exact canonical commands", Object.entries(packageScripts).every(([k, v]) => packageJson.scripts[k] === v));
  check("8. package.json differs from the frozen predecessor only by the SR-2G-F scripts",
    JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  check("9. no dependency or lockfile is touched",
    !SR2GF_SUCCESSOR_PATHS.some((f) => /package-lock\.json$|yarn\.lock$|pnpm-lock/.test(f))
    && JSON.stringify(packageJson.dependencies ?? {}) === JSON.stringify(baselinePackage.dependencies ?? {})
    && JSON.stringify(packageJson.devDependencies ?? {}) === JSON.stringify(baselinePackage.devDependencies ?? {}));
  check("10. exactly one migration is added by this round",
    SR2GF_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 1
    && SR2GF_SUCCESSOR_PATHS.includes(SR2GF_MIGRATION));
  // Validation-only means exactly that: guards, plus the three predecessor SUITES that execute the
  // real composition and therefore had to learn the new seam names and DTO key set.
  const successorSuites = Object.freeze([
    "scripts/social-candidate-sr2g-b-development-acceptance.mjs",
    "scripts/social-candidate-sr2g-b-mutations.mjs",
    "scripts/social-candidate-sr2g-b-smoke.mjs",
    "scripts/social-candidate-sr2g-d-development-acceptance.mjs",
    "scripts/social-candidate-sr2g-d-smoke.mjs",
    "scripts/social-candidate-sr2g-e1-development-acceptance.mjs"
  ]);
  check("11. the predecessor delta outside SR-2G-F's own files is validation-only successor awareness",
    SR2GF_SUCCESSOR_PATHS.filter((f) => f.startsWith("scripts/") && !f.includes("sr2g-f") && !f.includes("development/"))
      .every((f) => f.endsWith("-guard.mjs") || successorSuites.includes(f)));
  // A predecessor suite may learn a moved seam name or a widened DTO key set; it may not grow a new
  // expectation. The provable invariant is that its assertion COUNT is unchanged from the baseline.
  check("11a. no predecessor suite gains or loses an assertion, only moved seam names",
    successorSuites.every((f) =>
      count(read(f), "check(") === count(git(["show", `${SR2GF_BASELINE}:${f}`]), "check(")),
    successorSuites.filter((f) =>
      count(read(f), "check(") !== count(git(["show", `${SR2GF_BASELINE}:${f}`]), "check(")));

  // --- frozen predecessor bytes ---------------------------------------------------------------------
  check("12. no frozen predecessor migration is modified",
    SR2GF_FROZEN_MIGRATIONS.every((f) => lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", f])).length === 0),
    SR2GF_FROZEN_MIGRATIONS.filter((f) => lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", f])).length > 0));
  check("13. no frozen ranking, exposure, profile or DTO authority is modified",
    SR2GF_FROZEN_AUTHORITY_PATHS.every((f) => lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", f])).length === 0),
    SR2GF_FROZEN_AUTHORITY_PATHS.filter((f) => lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", f])).length > 0));
  check("14. the migration only ADDS to public.meal_buddy_cards and rewrites no frozen column",
    /alter table public\.meal_buddy_cards\s+add column food_context_tag_key/.test(migrationExec)
    && !/drop column|alter column|drop constraint|drop table|drop index/i.test(migrationExec));
  check("15. no frozen function is replaced or dropped",
    !/create or replace function|drop function/i.test(migrationExec)
    && !migrationExec.includes(`function social_internal.create_meal_buddy_card(`)
    && !migrationExec.includes(`function social_internal.list_owned_meal_buddy_cards(`));

  // --- context authority: composition, not duplication --------------------------------------------
  check("16. the SR-2G-F primitive exists and is named canonically",
    migrationExec.includes(`create function social_internal.${SR2GF_CONTEXT_PRIMITIVE}(`));
  check("17. the primitive CALLS the frozen SR-2G-D bridge rather than reproducing the pool",
    migrationExec.includes(`social_internal.${SR2GF_FROZEN_POOL_PRIMITIVE}(`));
  check("18. the primitive re-implements no hard eligibility rule",
    !new RegExp(`from public\\.meal_buddy_cards[\\s\\S]{0,600}dining_date\\s*=`).test(migrationExec)
    && !/meal_period\s*=\s*source/.test(migrationExec)
    && !migrationExec.includes("social_internal.authorized_candidates")
    && !migrationExec.includes(`social_internal.${SR2GF_FROZEN_CANDIDATE_PRIMITIVE}(`));
  check("19. the primitive removes no candidate: every pool row is returned, only labelled",
    /from pool\b/.test(migrationExec)
    && /left join candidate_context/.test(migrationExec)
    && !/where\s+pool\./i.test(migrationExec));
  check("20. the classification emits exactly the closed vocabulary",
    SR2GF_CONTEXT_STATES.every((s) => migrationExec.includes(`'${s}'`))
    && (migrationExec.match(/then '(matched|neutral|unsupported)'|else '(matched|neutral|unsupported)'/g) ?? []).length >= 5);
  check("21. a null source context labels everything neutral, which is the frozen behavior",
    /when not exists \(select 1 from source_context\) then 'neutral'/.test(migrationExec));
  check("22. the source context is read only from a card the actor owns",
    /where card\.id = p_source_card_id[\s\S]{0,120}card\.owner_user_id = p_actor_user_id/.test(migrationExec));

  // --- context identity: canonical catalog keys, never free text -----------------------------------
  check("23. context identity is the canonical SR-2C-R1 catalog key",
    migrationExec.includes("references public.social_interest_catalog (tag_key, namespace)")
    && migrationExec.includes("food_context_tag_key text"));
  check("24. the namespace is pinned by referential integrity, not by trust",
    /check \(food_context_namespace is null or food_context_namespace = 'food'\)/.test(migrationExec)
    && /check \(\(food_context_tag_key is null\) = \(food_context_namespace is null\)\)/.test(migrationExec));
  check("25. a dangling context is impossible", /references public\.social_interest_catalog \(tag_key, namespace\) on delete restrict/.test(migrationExec));
  check("26. only the food namespace is ever consulted",
    count(migrationExec, `namespace = '${SR2GF_CONTEXT_NAMESPACE}'`) >= 3
    && !/namespace = 'general'/.test(migrationExec));
  check("27. no free-text dish, name or label is matching authority",
    !/social_interest_catalog_label|ilike|similar to|to_tsvector|%'/i.test(migrationExec)
    && !/display_name|publicBio|area\s*=/.test(migrationExec));
  check("28. the request validator admits only a canonical key shape, never a sentence",
    /\^food\\\.\[a-z0-9_\]\+/.test(cardValidate) && /FOOD_CONTEXT_TAG_KEY\.test/.test(cardValidate));
  check("29. no raw menu, restaurant or catalog surrogate identifier becomes the context",
    !/menu_item|menu_items|menu_category|branch_menu_items|nutrition_id/i.test(migrationExec)
    && !/dishId/.test(`${cardValidate}\n${allContext}`)
    && !/foodContextTagKey\s*:\s*(?:recommendation\.)?(?:menuItemId|restaurantId|branchMenuItemId)/.test(cardValidate));

  // --- pipeline position: before SR-2A and SR-2B ----------------------------------------------------
  check("30. the context stage is composed before ranking and exposure",
    composeExec.indexOf("composeMealBuddyContextRanking") < composeExec.indexOf("applySocialExposure")
    && composeExec.indexOf("composeMealBuddyContextRanking") < composeExec.indexOf("resolveSocialEntitlement"));
  check("31. nothing re-orders, re-ranks or re-filters after exposure",
    !/exposure[\s\S]{0,400}\.sort\(|exposure[\s\S]{0,400}contextState/.test(composeExec));
  check("32. the candidate composition calls the context primitive, not the bare pool",
    readCards.includes(`social_internal.${SR2GF_CONTEXT_PRIMITIVE}(`)
    && !tsExec(readCards).includes(`social_internal.${SR2GF_FROZEN_POOL_PRIMITIVE}(`));
  check("33. the context read takes no client-supplied argument",
    /\$1::uuid, \$2::uuid, \$3::timestamptz/.test(readCards)
    && count(readCards, `social_internal.${SR2GF_CONTEXT_PRIMITIVE}(`) === 1);

  // --- SR-2A is unchanged ---------------------------------------------------------------------------
  check("34. SR-2A is invoked, never reimplemented",
    /rankSocialCandidates\(/.test(contextCompose)
    && !/compareCandidates|bucketOrder\(state|similarity\.score|rankingState ===/.test(tsExec(contextCompose)));
  check("35. the context layer introduces no score, weight or threshold",
    !SR2GF_FORBIDDEN_SCORE_MARKERS.some((m) => new RegExp(`\\b${m}\\b`).test(tsExec(allContext)))
    && !/[0-9]*\.[0-9]+/.test(tsExec(contextCompose)));
  check("36. the ranking policy version is read back from SR-2A, never authored here",
    /ranked\[0\]\.policyVersion/.test(contextCompose)
    && !new RegExp(`["'\`]${SR2GF_RANKING_POLICY_VERSION}["'\`]`).test(tsExec(allContext)));
  check("37. the bucket sequence is fixed and randomization is impossible",
    /MEAL_BUDDY_CONTEXT_BUCKET_ORDER = Object\.freeze\(\s*\["matched", "neutral", "unsupported"\]/.test(contextTypes)
    && !/Math\.random|shuffle|crypto\.getRandomValues/.test(allServer));
  check("38. bucketing is a permutation: no candidate is dropped",
    /ordered\.length !== candidates\.length/.test(contextCompose));
  check("39. an unknown context state fails closed rather than defaulting",
    /bucket === undefined\) return mealBuddyContextContractViolation\(\)/.test(contextCompose)
    && /CONTEXT_STATES\.has\(row\.context_state\)/.test(readCards));

  // --- SR-2B is unchanged ----------------------------------------------------------------------------
  check("40. no exposure cap is restated, raised or introduced",
    !new RegExp(`\\b(${SR2GF_FREE_EXPOSURE}|${SR2GF_PREMIUM_EXPOSURE})\\b`).test(tsExec(allContext))
    && !/slice\(0,|\.length > \d|limit/i.test(tsExec(allContext)));
  check("41. exposure still receives an ordinary ranking result",
    /applySocialExposure\(ranking, entitlement\)/.test(composeExec));
  check("42. no pagination, cursor or refill is introduced",
    !/cursor|pageToken|offset|refill|hasMore/i.test(`${tsExec(allContext)}\n${composeExec}`));

  // --- SR-2G-C is preserved ---------------------------------------------------------------------------
  check("43. hard eligibility remains the frozen pool's job",
    !/owner_user_id <>|cancelled_at is null|expires_at >|dining_date =|meal_period =/.test(contextPrimitive));
  check("44. block, participation and one-card-per-owner logic is not duplicated",
    !/social_blocks|social_participation|row_number() over|partition by|authorized_candidates/i.test(contextPrimitive));
  check("45. the restaurant hard rule is not restated",
    !/restaurant_id = source|candidate\.restaurant_id/.test(migrationExec));

  // --- API compatibility -------------------------------------------------------------------------------
  check("46. the candidate request contract is unchanged: sourceCardRef only",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", `${SR2GF_CANDIDATE_API_ROOT}/request.ts`, `${SR2GF_CANDIDATE_API_ROOT}/policy.ts`])).length === 0);
  check("47. no client-supplied context reaches the candidate endpoint",
    !/foodContext|contextTagKey|contextWeights|desiredDish/.test(tsExec(compose))
    && !/body\.[a-zA-Z]*[Cc]ontext/.test(`${composeExec}\n${tsExec(readCards)}`));
  check("48. the candidate DTO gains no context field",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", `${SR2GF_CANDIDATE_API_ROOT}/toCandidateDto.ts`])).length === 0
    && !/contextState/.test(read(`${SR2GF_CANDIDATE_API_ROOT}/toCandidateDto.ts`)));
  check("49. no matchReasons or explanation field is added",
    !/matchReason|whyMatched|explanation|contextLabel:/i.test(`${allServer}\n${candidateTypes}`));
  check("50. the context state is server-internal and never projected",
    /contextState/.test(candidateTypes) && !/contextState/.test(read(`${SR2GF_CANDIDATE_API_ROOT}/toCandidateDto.ts`)));

  // --- ref authority is unchanged -------------------------------------------------------------------------
  check("51. no new reference generation is introduced",
    !/mbc2\.|scr2\./.test(`${allServer}\n${cardRuntime}\n${allMobile}`)
    && lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", "supabase/functions/_shared/meal-buddy-card-ref"])).length === 0);
  check("52. context is card state, never sealed into a reference payload",
    !/food_context[\s\S]{0,80}(cipher|seal|claims)|claims[\s\S]{0,80}food_context/i.test(`${allServer}\n${tsExec(cardRuntime)}`));
  check("53. the opaque card reference prefix is unchanged", SR2GF_CARD_REF_PREFIX === "mbc1.");

  // --- backward compatibility ------------------------------------------------------------------------------
  check("54. the context column is optional at the schema level",
    /add column food_context_tag_key text,/.test(migrationExec) && !/food_context_tag_key text not null/.test(migrationExec));
  check("55. the create body key set stays closed but the context key is optional",
    /OPTIONAL_CREATE_KEYS = Object\.freeze\(\["foodContextTagKey", "selectedRecommendation"\]\)/.test(cardValidate)
    && /CREATE_KEYS\.every\(\(key\) => Object\.hasOwn\(body, key\)\)/.test(cardValidate)
    && /keys\.every\(\(key\) => known\.has\(key\)\)/.test(cardValidate));
  check("56. an omitted context is the same as an explicit null, never an error",
    /Object\.hasOwn\(body, "foodContextTagKey"\) && body\.foodContextTagKey !== null/.test(cardValidate));
  check("57. a legacy card without context stays selectable in Mobile",
    /rawContext !== null && rawContext !== undefined/.test(sourceRepo)
    && /\?\? null/.test(sourceRepo));
  check("58. an invalid context is a rejected request, never an opaque dependency failure",
    /invalid_food_context/.test(cardRuntime) && /"invalid_request"/.test(cardCompose)
    && /buildMealBuddyCardError\(outcome\.errorCode\)/.test(createHandler));
  check("59. the database, not the client, decides whether a context exists",
    /INVALID_FOOD_CONTEXT/.test(migrationExec)
    && /catalog\.selectable[\s\S]{0,40}catalog\.active/.test(migrationExec));

  // --- food/general isolation and health isolation ---------------------------------------------------------
  check("60. general-namespace interests are never meal-context evidence",
    !/'general'/.test(contextPrimitive) && !/namespace = 'general'/.test(migrationExec)
    && /MEAL_BUDDY_CONTEXT_NAMESPACE = "food"/.test(contextPolicy));
  check("61. no health, restriction, allergy or nutrition concept appears in any context authority",
    SR2GF_FORBIDDEN_HEALTH_EVIDENCE.every((m) => !new RegExp(m, "i").test(migrationBody)),
    SR2GF_FORBIDDEN_HEALTH_EVIDENCE.filter((m) => new RegExp(m, "i").test(migrationBody)));
  check("62. no health table is read by the context layer",
    !/meal_records|meal_analyses|consumer_preferences|consumer_goals|dietary|taste_profiles/i.test(migrationBody));
  check("63. profile food declarations are POSITIVE-only evidence",
    /declared_evidence/.test(migrationExec)
    && !/not exists[\s\S]{0,80}declared_evidence|declared_evidence[\s\S]{0,60}then 'unsupported'/.test(migrationExec));
  check("64. missing evidence is neutral, never negative",
    /else 'neutral'\s*end as context_state/.test(contextPrimitive));
  check("65. only an explicit conflicting card declaration can be unsupported",
    /candidate_context\.tag_key is not null then[\s\S]{0,400}else 'unsupported'/.test(contextPrimitive));
  check("66. no new role is created", !/create role|create user/i.test(migrationExec));
  check("67. every table grant is column-scoped",
    (migrationExec.match(/^grant select on table/gm) ?? []).length === 0
    && (migrationExec.match(/grant select \(/g) ?? []).length >= 3);
  check("68. the transient grantor borrow uses the frozen safe pattern",
    count(migrationExec, "with inherit false, set true") === 2
    && count(migrationExec, "granted by postgres") === 2
    && !/set option false|set false/i.test(migrationExec));
  check("69. transient CREATE on the schema is revoked",
    count(migrationExec, "revoke create on schema social_internal from") === 2);
  check("70. the new primitives are revoked from every client and untrusted role",
    ["public", "anon", "authenticated", "authenticator", "service_role"].every((role) =>
      new RegExp(`revoke all on function social_internal\\.${SR2GF_CONTEXT_PRIMITIVE}[^\\n]*from ${role};`).test(migrationExec)));
  check("71. only the executor receives execute, and the grant is issued as the owner",
    count(migrationExec, "to social_runtime_executor;") === 3
    && count(migrationExec, "set local role meal_buddy_candidate_pool_authority;") === 1
    && count(migrationExec, "set local role meal_buddy_card_write_authority;") === 1);
  check("72. the added RLS policy is scoped to one authority role only",
    /for select to meal_buddy_candidate_pool_authority using \(true\)/.test(migrationExec)
    && count(migrationExec, "create policy") === 1);
  check("73. the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));

  // --- Mobile stays a renderer ---------------------------------------------------------------------------------
  check("74. Mobile performs no context matching, filtering, grouping or ranking",
    !/\.filter\(|\.sort\(|matched|unsupported|contextState|bucket/i.test(tsExec(picker).replace(/foodContextTagKey/g, "")));
  check("75. Mobile sends nothing but the sealed reference",
    !/foodContextTagKey/.test(tsExec(read(`${SR2GF_FEATURE_ROOT}/adapters/supabaseMealBuddyCandidateRepository.ts`))));
  check("76. the context label comes from the canonical catalog, never a hard-coded map",
    /resolveInterestCategoryLabel\(controller\.labels, card\.foodContextTagKey\)/.test(picker)
    && !/(火鍋|壽司|拉麵)/.test(allMobile));
  check("77. the frozen candidate renderers stay untouched while the successor may edit the card-create integration screen",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--",
      `${SR2GF_FEATURE_ROOT}/MealBuddyCandidateCard.tsx`,
      `${SR2GF_FEATURE_ROOT}/MealBuddyRealCandidateSection.tsx`,
      `${SR2GF_FEATURE_ROOT}/useMealBuddyRealCandidates.ts`])).length === 0);

  // --- Development fixture isolation -------------------------------------------------------------------------------
  check("78. the fixture tooling keeps its hard Development pin",
    /const DEV_REF = "msbgnnoorsoefuiwluye"/.test(seed)
    && /refusing to seed: project ref must be exactly/.test(seed));
  check("79. fixture context data is expressed with canonical catalog keys",
    SR2GF_PROOF_CONTEXTS.every((key) => seed.includes(key.replace("food.", ""))));
  check("80. the fixture reconciles rather than accumulates",
    /reconcileCards/.test(seed) && /meal-buddy-card-cancel/.test(seed));
  check("81. no fixture identity, email or context is referenced by product authority",
    !/development\.invalid|meal-buddy-demo-v1|mealbuddy\./.test(`${allServer}\n${allMobile}\n${tsExec(cardRuntime)}`));
  // A Supabase PROJECT REF is a twenty-letter subdomain. Every one appearing anywhere in this round
  // must be the Development project; a generic pooler hostname is not a project reference.
  check("82. every Supabase project reference in the round is the Development project",
    SR2GF_SUCCESSOR_PATHS.flatMap((f) => [...read(f).matchAll(/([a-z]{20})\.supabase\.co/g)].map((m) => m[1]))
      .every((ref) => ref === "msbgnnoorsoefuiwluye"),
    [...new Set(SR2GF_SUCCESSOR_PATHS.flatMap((f) => [...read(f).matchAll(/([a-z]{20})\.supabase\.co/g)].map((m) => m[1])))]);
  const allRound = SR2GF_SUCCESSOR_PATHS.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".sql"))
    .map((f) => (f.endsWith(".sql") ? sqlProse(read(f)) : tsExec(read(f)))).join("\n");
  check("83. no later-phase concept is begun",
    !SR2GF_FORBIDDEN_SCOPE_MARKERS.some((m) => new RegExp(`\\b${m}\\b`, "i").test(allRound)),
    SR2GF_FORBIDDEN_SCOPE_MARKERS.filter((m) => new RegExp(`\\b${m}\\b`, "i").test(allRound)));
  check("84. no authored file carries a CRLF byte pair or a UTF-8 BOM",
    SR2GF_SUCCESSOR_PATHS.filter((f) => f.includes("sr2g-f") || f.startsWith(SR2GF_CONTEXT_ROOT) || f === SR2GF_MIGRATION)
      .every((f) => {
        const b = fs.readFileSync(path.join(root, f));
        return !b.includes(Buffer.from("\r\n")) && !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF);
      }));
  check("85. no .gitattributes is introduced", !fs.existsSync(path.join(root, ".gitattributes")));
  check("86. no secret, token or password literal is committed",
    !/(eyJ[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|service_role_key\s*=\s*["'][^"']+)/.test(
      SR2GF_SUCCESSOR_PATHS.map((f) => read(f)).join("\n")));
  check("87. the policy version is unchanged", SR2GF_POLICY_VERSION === "meal-buddy-candidate-api-v1"
    && read(`${SR2GF_CANDIDATE_API_ROOT}/policy.ts`).includes(SR2GF_POLICY_VERSION));
  check("88. the Asia/Taipei dining-date authority is untouched",
    SR2GF_TIME_ZONE === "Asia/Taipei"
    && !/toISOString\(\)\.slice\(0, ?10\)/.test(`${composeExec}\n${tsExec(readCards)}\n${allContext}`));

  // --- manifest integrity --------------------------------------------------------------------------------------------
  check("89. filesystem manifest text is canonical", fsManifest.text === expectedManifestText);
  check("90. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(fsManifest.aggregateSha256));
  check("91. manifest entry count equals the declared path count", fsManifest.entries.length === SR2GF_SUCCESSOR_PATHS.length);
  check("92. frozen SR-2G-F index bytes remain readable from its authority commit", !frozenAuthorityAtHead || frozenIndex.entries.length === SR2GF_SUCCESSOR_PATHS.length);
  check("93. frozen SR-2G-F index and tree bytes remain identical", !frozenAuthorityAtHead || frozenTree.aggregateSha256 === frozenIndex.aggregateSha256);
  check("94. exactly four SR-2G-F context files are added",
    SR2GF_CONTEXT_FILES.length === 4 && SR2GF_CONTEXT_FILES.every((f) => fs.existsSync(path.join(root, f))));
  check("95. guard exit status is derived from the failure list", failures.length === checks.filter((c) => !c.pass).length);

  console.log(JSON.stringify({
    suite: "social-candidate-sr2g-f",
    phase: effectivePhase,
    head: state.head,
    originHead: state.originHead,
    ahead: state.ahead,
    behind: state.behind,
    paths: SR2GF_SUCCESSOR_PATHS.length,
    manifestSha256: fsManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`SR-2G-F guard aborted: ${error.message}`);
  process.exit(1);
}
