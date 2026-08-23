#!/usr/bin/env node
// SR-2G-E2 local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createSr2ge2CanonicalManifest,
  SR2GE2_CARD_REF_PREFIX, SR2GE2_COMPACT_VISIBLE,
  SR2GE2_FEATURE_ROOT, SR2GE2_FORBIDDEN_SCOPE_MARKERS, SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS,
  SR2GE2_FREE_EXPOSURE, SR2GE2_FROZEN_E1_PATHS, SR2GE2_MOCK_CANDIDATE_AUTHORITY,
  SR2GE2_PERSON_REF_PREFIX, SR2GE2_PREMIUM_EXPOSURE, SR2GE2_SCREEN, SR2GE2_SCREEN_FILES,
  SR2GE2_SUCCESSOR_PATHS, SR2GE2_TIME_ZONE
} from "./social-candidate-sr2g-e2-successor-manifest.mjs";
// SR-2G-F successor awareness. The lifecycle this guard validates is the CURRENT round's, and the
// SR-2G-F baseline is this round's own freeze commit — so every "unchanged since baseline" check
// below now measures exactly what SR-2G-F changed, and nothing else.
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_BASELINE_SUBJECT, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";
import { SR2HA_SUCCESSOR_PATHS } from "./social-candidate-sr2h-a-successor-manifest.mjs";
import { SR2HB_SUCCESSOR_PATHS } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";

const root = process.cwd();
const packageScripts = Object.freeze({
  "test:social-candidate-sr2g-e2": "node scripts/social-candidate-sr2g-e2-guard.mjs",
  "test:social-candidate-sr2g-e2-smoke": "node scripts/social-candidate-sr2g-e2-smoke.mjs",
  "test:social-candidate-sr2g-e2-mutations": "node scripts/social-candidate-sr2g-e2-mutations.mjs",
  "test:social-candidate-sr2g-e2-development-mobile-smoke": "node scripts/social-candidate-sr2g-e2-development-mobile-smoke.mjs"
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
  const successorScriptKeys = ["test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  // The baseline is now this round's OWN freeze commit, which already carries the SR-2G-E2 keys.
  // Only the successor round's keys are removed before the comparison; check 7 still proves the
  // SR-2G-E2 keys are present and exact.
  for (const key of successorScriptKeys) delete packageWithout.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) {
    delete packageWithout.scripts[key];
  }
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithout.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[key];

  const screen = read(SR2GE2_SCREEN);
  const screenExec = tsExec(screen);
  const cardUi = read(`${SR2GE2_FEATURE_ROOT}/MealBuddyCandidateCard.tsx`);
  const section = read(`${SR2GE2_FEATURE_ROOT}/MealBuddyRealCandidateSection.tsx`);
  const picker = read(`${SR2GE2_FEATURE_ROOT}/MealBuddyRealSourceCardPicker.tsx`);
  const hook = read(`${SR2GE2_FEATURE_ROOT}/useMealBuddyRealCandidates.ts`);
  const barrel = read(`${SR2GE2_FEATURE_ROOT}/index.ts`);
  const factories = read(`${SR2GE2_FEATURE_ROOT}/factories.ts`);
  const allE2 = [cardUi, section, picker, hook].map(tsExec).join("\n");

  const fsManifest = createSr2ge2CanonicalManifest((f) => fs.readFileSync(path.join(root, f)));
  const expectedManifestText = SR2GE2_SUCCESSOR_PATHS.map((f) => `${sha256(f)}  ${f}\n`).join("");
  const frozenIndex = lifecycle.frozenShape ? createSr2ge2CanonicalManifest((f) => gitBytes(["show", `:${f}`])) : null;
  const frozenTree = lifecycle.frozenShape ? createSr2ge2CanonicalManifest((f) => gitBytes(["cat-file", "blob", `${state.head}:${f}`])) : null;

  // --- baseline ---------------------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2G-E1 authority",
    effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead,
    { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS.length });
  check("3. the pinned predecessor is the exact pushed SR-2G-E1 freeze commit",
    git(["cat-file", "-t", SR2GF_BASELINE]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2GF_BASELINE]).trim() === SR2GF_BASELINE_SUBJECT);
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact path exists", SR2GE2_SUCCESSOR_PATHS.every((f) => fs.existsSync(path.join(root, f))));
  check("6. candidate paths are wildcard-free and unique",
    new Set(SR2GE2_SUCCESSOR_PATHS).size === SR2GE2_SUCCESSOR_PATHS.length
    && SR2GE2_SUCCESSOR_PATHS.every((e) => !/[*?[\]{}]/.test(e)));
  check("7. package exposes the exact canonical commands", Object.entries(packageScripts).every(([k, v]) => packageJson.scripts[k] === v));
  check("8. package.json differs from this round's freeze only by the SR-2G-F successor scripts",
    JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
  check("9. no dependency or lockfile is touched",
    JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies)
    && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies));
  // SR-2G-E2 itself introduced no server byte. Later server deltas must remain confined to the
  // exact, wildcard-free F, G and H-A successor manifests; no directory-wide allowance exists.
  check("10. no server authority byte is touched outside the enumerated SR-2G-F/G/SR-2H-A successor sets",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", "supabase"])).every((f) => SR2GF_SUCCESSOR_PATHS.includes(f) || SR2GG_SUCCESSOR_PATHS.includes(f) || SR2HA_SUCCESSOR_PATHS.includes(f) || SR2HB_SUCCESSOR_PATHS.includes(f) || SR2IA_SUCCESSOR_PATHS.includes(f))
    && !SR2GE2_SUCCESSOR_PATHS.some((f) => f.startsWith("supabase/")));
  check("11. every frozen SR-2G-E1 data-layer file is byte-unchanged outside exact successor sets",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", ...SR2GE2_FROZEN_E1_PATHS]))
      .every((f) => SR2GF_SUCCESSOR_PATHS.includes(f) || SR2GG_SUCCESSOR_PATHS.includes(f) || SR2HA_SUCCESSOR_PATHS.includes(f) || SR2HB_SUCCESSOR_PATHS.includes(f) || SR2IA_SUCCESSOR_PATHS.includes(f)));
  check("12. the predecessor delta outside SR-2G-E2's own files is validation-only successor awareness",
    SR2GE2_SUCCESSOR_PATHS.filter((f) => f.startsWith("scripts/") && !f.includes("sr2g-e2")).every((f) => f.endsWith("-guard.mjs")));
  check("12a. the SR-2G-F successor round adds exactly one migration and no new client role",
    SR2GF_SUCCESSOR_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 1);

  // --- real data authority -----------------------------------------------------------------------
  check("13. the screen consumes the frozen SR-2G-E1 feature",
    /from "\.\.\/features\/meal-buddy-candidates\//.test(screen)
    && /useMealBuddyRealCandidates/.test(screen)
    && /MealBuddyRealCandidateSection/.test(screen)
    && /MealBuddyRealSourceCardPicker/.test(screen));
  check("14. real mode is decided by the canonical consumer runtime, never by a demo toggle",
    /useConsumerRuntime\(\)/.test(screen)
    && /consumerRuntime\.mode === "supabase"/.test(screen)
    && !/isRealCandidateMode\s*=\s*[^;]*demoMode/.test(screenExec));
  check("15. the screen never calls a Meal Buddy Edge function itself",
    !/functions\.invoke|meal-buddy-candidate-list|meal-buddy-card-list/.test(screenExec));
  check("16. the screen performs no direct table read", !/\.from\(/.test(screenExec));
  check("17. the hook reads source cards and candidates only through the frozen service",
    /createMealBuddyCandidateService/.test(hook)
    && /listSourceCards\(\)/.test(hook)
    && /listCandidates\(sourceCardRef\)/.test(hook)
    && !/functions\.invoke|\.from\(/.test(tsExec(hook)));

  // --- source identity is the real reference, nothing else -------------------------------------------
  // The reference IS the identity, so it is forwarded verbatim rather than re-matched against a
  // freshly minted card list — references are per-request ciphertexts, so such a comparison could
  // never hold and any rule that recovered from it would be a disguised fallback.
  check("18. the selected reference is forwarded verbatim as the source identity",
    /listCandidates\(sourceCardRef\)/.test(hook) && !/cards\.find\(/.test(tsExec(hook)));
  check("19. no source identity is derived from any card field",
    SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS.every((field) => !new RegExp(`card\\.${field}\\s*===`).test(tsExec(hook))),
    SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS.filter((field) => new RegExp(`card\\.${field}\\s*===`).test(tsExec(hook))));
  check("20. there is no first-card or positional fallback, and no-source comes from the card list",
    !/cards\[0\]|\.at\(0\)|\[0\]\.sourceCardRef|\?\?\s*cards\[/.test(tsExec(hook))
    && /if \(outcome\.value\.length === 0\) setState\(\{ phase: "noSource" \}\);/.test(hook));
  check("21. a demo MealBuddyCard is never mapped onto a real source card",
    !/MealBuddyCard[\s\S]{0,80}sourceCardRef|sourceCardRef[\s\S]{0,80}getMealBuddyCardId/.test(screenExec));
  check("22. no source reference is hard-coded anywhere",
    !new RegExp(`["'\`]${SR2GE2_CARD_REF_PREFIX.replace(".", "\\.")}[A-Za-z0-9_-]{4,}`).test(`${screenExec}\n${allE2}`));
  check("23. the picker selects by the card's own reference and keys by it too",
    /controller\.selectSourceCard\(card\.sourceCardRef\)/.test(picker)
    && /key=\{card\.sourceCardRef\}/.test(picker));
  check("24. zero real active cards renders the no-source state, never a fabricated card",
    /cards\.length === 0/.test(picker) && /還沒有有效的飯友卡/.test(picker));

  // --- mock authority is unreachable in real mode -------------------------------------------------------
  check("25. the mock candidate pipeline is guarded off before it can run in real mode",
    /if \(isRealCandidateMode\) return;/.test(screen)
    && screen.indexOf("if (isRealCandidateMode) return;") < screen.indexOf("rankMealBuddyRecommendations(card"));
  check("26. the mock recommendation groups are not rendered in real mode",
    /!isRealCandidateMode && recommendationGroups\.length > 0/.test(screen));
  check("27. the real section is rendered only in real mode",
    /\{isRealCandidateMode \? \([\s\S]{0,200}MealBuddyRealSourceCardPicker/.test(screen));
  check("28. no mock candidate authority is referenced by any SR-2G-E2 feature file",
    SR2GE2_MOCK_CANDIDATE_AUTHORITY.every((name) => !allE2.includes(name)),
    SR2GE2_MOCK_CANDIDATE_AUTHORITY.filter((name) => allE2.includes(name)));
  check("29. no mock module is imported by any SR-2G-E2 feature file",
    !/mealBuddyCardMock|mealBuddyFlowMock|mealBuddySocialStore|mealBuddyRanking|mealBuddyCardStore/.test(allE2));
  check("30. there is no API-error to mock fallback anywhere",
    !/catch[\s\S]{0,160}(getMealBuddyCandidates|mockCandidates|rankMealBuddyRecommendations)/.test(`${screenExec}\n${allE2}`));

  // --- server order and exposure ------------------------------------------------------------------------------
  check("31. the section maps the server array in place",
    /state\.candidates\.map\(\(candidate\) =>/.test(section));
  check("32. no sort, rerank, filter or reverse touches the candidate array",
    !/\.sort\(|\.reverse\(|localeCompare|rankScore|matchReasons/.test(allE2));
  // Scoped to the CANDIDATE array: `mascot.name.slice(0, 1)` is an avatar initial, not a cap.
  check("33. no client-side exposure cap exists and the old 5/3 demo caps are absent",
    !/\bcandidates\b[^\n]{0,40}\.slice\(/.test(allE2)
    && !/premium\s*\?\s*5\s*:\s*3/.test(allE2)
    && SR2GE2_FREE_EXPOSURE === 3 && SR2GE2_PREMIUM_EXPOSURE === 10);
  check("34. no pagination, cursor or refill exists", !/cursor|pageToken|offset|refill|loadMore|hasMore/i.test(allE2));
  check("35. the hook stores the server array exactly as received",
    /phase: "ready", candidates: outcome\.value\.candidates/.test(hook));

  // --- interests -------------------------------------------------------------------------------------------------
  check("36. labels come from the frozen canonical resolver, never a second map",
    /buildCompactInterestLine/.test(cardUi) && /InterestCategoryLabels/.test(cardUi)
    && !/(娛樂|遊戲|運動健身|日式|火鍋|甜點飲品)\s*[:=]/.test(allE2));
  check("37. the compact line renders at most three chips plus one overflow chip",
    /line\.chips\.map/.test(cardUi) && /line\.overflowLabel === null \? null/.test(cardUi)
    && SR2GE2_COMPACT_VISIBLE === 3);
  // Executable style only: the card's header comment legitimately explains that flexWrap is absent.
  check("38. the interest row cannot wrap onto a second chip row",
    /interestRow: \{ flexDirection: "row"/.test(cardUi) && !/flexWrap/.test(tsExec(cardUi)));
  check("39. every chip clips its own text so an overlong label truncates inside the row",
    count(cardUi, "numberOfLines={1}") >= 4 && /flexShrink: 1/.test(cardUi) && /flexShrink: 0/.test(cardUi));
  check("40. zero declared categories renders nothing rather than an empty rail",
    /categoryKeys\.length === 0\) return null/.test(cardUi));
  check("41. no fine-grained interest tag is ever rendered",
    !/generalTagKeys|foodTagKeys|publicInterestTags|tagKey/.test(allE2));
  check("42. interests never reorder or highlight a candidate",
    !/interestScore|interestRank|sharedInterest|commonCategor|overlap/i.test(allE2));

  // --- card presentation ------------------------------------------------------------------------------------------
  check("43. a general card renders no restaurant and never a placeholder",
    /card\.restaurant === null \|\| card\.restaurant\.name === null \? null/.test(cardUi)
    && !/undefined|"null"/.test(tsExec(cardUi)));
  check("44. a restaurant card renders the canonical name, never the identifier",
    /card\.restaurant\.name\}/.test(cardUi) && !/restaurant\.restaurantId\}/.test(cardUi));
  check("45. the dining date is rendered as the exact server string, never re-parsed",
    /card\.diningDate\}/.test(cardUi) && !/new Date\(card\.diningDate|Date\.parse/.test(cardUi));
  check("46. no debug, ranking or entitlement field is rendered",
    !/rankingState|score|similarity|exposureIndex|entitlement|isPremium|isVerified|distanceKm|activityScore/.test(allE2));

  // --- UI states ---------------------------------------------------------------------------------------------------
  check("47. the five candidate states are distinct in the state machine",
    ["idle", "loading", "ready", "noSource", "failed"].every((phase) => new RegExp(`phase: "${phase}"`).test(hook)));
  check("48. the section renders each state separately",
    /state\.phase === "loading"/.test(section) && /state\.phase === "noSource"/.test(section)
    && /state\.phase === "failed"/.test(section) && /state\.candidates\.length === 0/.test(section));
  check("49. a legal empty result is never treated as an error",
    /目前沒有符合的飯友/.test(section) && /暫時無法載入飯友/.test(section));
  check("50. no-source is never merged into empty or error",
    /noSource/.test(section) && /還沒有有效的飯友卡/.test(section)
    && /no_source_card[\s\S]{0,60}phase: "noSource"/.test(hook));
  check("51. loading replaces the previous list rather than layering over it",
    /setState\(\{ phase: "loading" \}\)/.test(hook));
  check("52. a stale response cannot overwrite a newer source-card selection",
    /requestSequence/.test(hook) && /requestSequence\.current !== sequence\) return/.test(hook));
  check("53. retry re-runs the canonical layer and reconstructs no reference",
    /const retry = useCallback/.test(hook) && /runForRef\(selectedSourceCardRef\)/.test(hook)
    && /controller\.retry\(\)/.test(section));
  check("54. no raw server body, status code or stack reaches a user message",
    !/error\.message|JSON\.stringify\(|\.code\}/.test(tsExec(section)));

  // --- auth and refs ------------------------------------------------------------------------------------------------
  check("55. leaving live mode resets cards, selection and candidates together",
    /if \(!isLiveMode\) reset\(\)/.test(hook)
    && /setSourceCards\(\{ phase: "idle" \}\)/.test(hook)
    && /setSelectedSourceCardRef\(null\)/.test(hook)
    && /setState\(\{ phase: "idle" \}\)/.test(hook));
  check("56. nothing is persisted to device storage",
    !/AsyncStorage|localStorage|storage\.setItem|setItem\(/.test(allE2));
  check("57. neither reference is decoded or inspected",
    !/atob|base64|decodeRef|candidateRef\.slice|candidateCardRef\.slice/.test(allE2));
  check("58. the whole-card press seam carries the PERSON reference only",
    /onPress\?\.\(candidateRef: string\)|onPress\?: \(candidateRef: string\) => void/.test(cardUi)
    && /onPress\(candidate\.candidateRef\)/.test(cardUi)
    && !/onPress\(candidate\.candidateCardRef\)/.test(cardUi));
  check("59. the card reference is never used as a person identity",
    !/candidateCardRef[\s\S]{0,40}(profile|person|identity)/i.test(allE2));
  check("60. neither reference is rendered to the user",
    !/\{candidate\.candidateRef\}|\{candidate\.candidateCardRef\}/.test(cardUi));
  check("61. the person reference is used as a list key only",
    /key=\{candidate\.candidateRef\}/.test(section));

  // --- date ------------------------------------------------------------------------------------------------------------
  check("62. the frozen Asia/Taipei helper is still the dining-date authority",
    /mealBuddyTaipeiDateKey/.test(read("apps/mobile/features/demo-time/demoTimeStore.ts"))
    && new RegExp(`"${SR2GE2_TIME_ZONE.replace("/", "\\/")}"`).test(read(`${SR2GE2_FEATURE_ROOT}/taipeiDiningDate.ts`)));
  check("63. no UTC day regression is introduced",
    !/toISOString\(\)\.slice\(0, ?10\)/.test(`${screenExec}\n${allE2}`));

  // --- scope --------------------------------------------------------------------------------------------------------------
  const scopeLeaks = SR2GE2_FORBIDDEN_SCOPE_MARKERS.filter((marker) => new RegExp(marker, "i").test(allE2));
  check("64. no full profile, invite, match, chat, seen or menu-context concept appears", scopeLeaks.length === 0, { scopeLeaks });
  check("65. the tap seam does not navigate to a profile that does not exist",
    !/router\.push|navigate\(/.test(allE2));
  check("66. no new entitlement rule is introduced client-side",
    !/isPremium|premium|free_tier|entitlement/i.test(allE2));
  // The SR-2G-E1 barrel is the frozen DATA LAYER and stays render-free, exactly as its own header
  // states. The screen therefore imports the E2 modules directly instead of widening the barrel.
  check("67. the frozen E1 barrel is unchanged and still exports nothing that renders",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", `${SR2GE2_FEATURE_ROOT}/index.ts`])).length === 0
    && !/MealBuddyCandidateCard|MealBuddyRealCandidateSection|MealBuddyRealSourceCardPicker|useMealBuddyRealCandidates/.test(barrel)
    && /meal-buddy-candidates\/MealBuddyRealCandidateSection/.test(screen)
    && /meal-buddy-candidates\/useMealBuddyRealCandidates/.test(screen));
  check("68. the factories change is the additive catalog slot only",
    /catalogClient\?: SupabaseInterestCatalogClientLike/.test(factories)
    && count(factories, "catalogClient") === 1);
  check("69. screen changes are confined to exact E2 and SR-2H-A successor paths",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", "apps/mobile/app"])).every((f) => SR2GE2_SUCCESSOR_PATHS.includes(f) || SR2HA_SUCCESSOR_PATHS.includes(f) || SR2HB_SUCCESSOR_PATHS.includes(f))
    && SR2GE2_SUCCESSOR_PATHS.filter((f) => f.startsWith("apps/mobile/app/")).length === 1);
  check("70. the demo Meal Buddy stores are untouched",
    lines(git(["diff", "--name-only", SR2GF_BASELINE, "--", "apps/mobile/features/meal-buddy-card"])).length === 0);

  // --- hygiene -----------------------------------------------------------------------------------------------------------------
  const secret = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,})/;
  check("71. candidate files contain no credential-shaped secret", !SR2GE2_SUCCESSOR_PATHS.map(read).some((t) => secret.test(t)));
  check("72. no Development fixture identity is hard-coded",
    !/development\.invalid|mealbuddy\.demo|mealbuddy\.viewer|de300001-/.test(`${screenExec}\n${allE2}`));
  check("73. no Production project reference exists",
    !SR2GE2_SUCCESSOR_PATHS.map(read).some((t) => /\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));
  // Applied to the files THIS round authors. The 116KB screen is a pre-existing file that is stored
  // with a UTF-8 BOM and materialised CRLF by core.autocrlf; rewriting either would be an unrelated
  // 116KB change, so its conventions are asserted as UNCHANGED just below instead.
  const authored = [...SR2GE2_SCREEN_FILES, ...SR2GE2_SUCCESSOR_PATHS.filter((f) => f.includes("sr2g-e2"))];
  check("74. no authored candidate file carries a CRLF byte pair",
    authored.every((f) => !fs.readFileSync(path.join(root, f)).includes(Buffer.from("\r\n"))), authored.filter((f) => fs.readFileSync(path.join(root, f)).includes(Buffer.from("\r\n"))));
  check("75. no authored candidate file carries a UTF-8 BOM",
    authored.every((f) => { const b = fs.readFileSync(path.join(root, f)); return !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF); }));
  // The screen's own convention is the one RECORDED IN THE REPOSITORY, not the one core.autocrlf
  // smudges onto the worktree at checkout: the SR-2G-E1 blob is LF with a UTF-8 BOM, so the round
  // must keep it LF with a UTF-8 BOM. Mixed endings in either direction are what would signal an
  // edit that broke the file, and the BOM must survive untouched.
  check("75a. the pre-existing screen keeps its own byte conventions and gains no mixed line endings",
    (() => {
      const blob = gitBytes(["show", `${SR2GF_BASELINE}:${SR2GE2_SCREEN}`]);
      const disk = fs.readFileSync(path.join(root, SR2GE2_SCREEN));
      const bom = (b) => b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
      const crlf = (b) => b.includes(Buffer.from("\r\n"));
      return bom(disk) === bom(blob) && bom(disk) && crlf(disk) === crlf(blob) && !crlf(disk);
    })());
  check("76. no .gitattributes is introduced", !fs.existsSync(path.join(root, ".gitattributes")));
  check("77. the real candidate DTO is never widened with an any escape hatch",
    !/as any|: any\b/.test(allE2) && !/MealBuddyCandidateDto\s*=/.test(allE2));

  // --- manifest integrity ------------------------------------------------------------------------------------------------------------
  check("78. filesystem manifest text is canonical", fsManifest.text === expectedManifestText);
  check("79. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(fsManifest.aggregateSha256));
  check("80. manifest entry count equals the declared path count", fsManifest.entries.length === SR2GE2_SUCCESSOR_PATHS.length);
  check("81. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndex.aggregateSha256 === fsManifest.aggregateSha256);
  check("82. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTree.aggregateSha256 === fsManifest.aggregateSha256);
  check("83. exactly four SR-2G-E2 screen files are added",
    SR2GE2_SCREEN_FILES.length === 4 && SR2GE2_SCREEN_FILES.every((f) => fs.existsSync(path.join(root, f))));
  check("84. the person and card reference markers stay distinct",
    SR2GE2_PERSON_REF_PREFIX !== SR2GE2_CARD_REF_PREFIX);

  const summary = Object.freeze({
    round: "SR-2G-E2", baseline: SR2GF_BASELINE, phase: effectivePhase,
    paths: SR2GE2_SUCCESSOR_PATHS.length, aggregateSha256: fsManifest.aggregateSha256,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2G-E2", error: error.message }, null, 2));
  process.exit(1);
}
