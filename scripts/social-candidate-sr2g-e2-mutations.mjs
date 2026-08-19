#!/usr/bin/env node
// SR-2G-E2 meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families: the SCREEN INTEGRATION mutated as text over the real sources, and the
// SCREEN ORCHESTRATION mutated through an executable model, so a design that restores mock
// candidates, a client cap, local ranking, a mock->real source mapping, a first-card fallback, ref
// persistence or a UTC dining date cannot pass as the real one.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GE2_FEATURE_ROOT, SR2GE2_MOCK_CANDIDATE_AUTHORITY, SR2GE2_SCREEN,
  SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS
} from "./social-candidate-sr2g-e2-successor-manifest.mjs";

const root = process.cwd();
const readFile = (f) => fs.readFileSync(path.join(root, f), "utf8");
const tsExec = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

const SOURCES = {
  screen: readFile(SR2GE2_SCREEN),
  cardUi: readFile(`${SR2GE2_FEATURE_ROOT}/MealBuddyCandidateCard.tsx`),
  section: readFile(`${SR2GE2_FEATURE_ROOT}/MealBuddyRealCandidateSection.tsx`),
  picker: readFile(`${SR2GE2_FEATURE_ROOT}/MealBuddyRealSourceCardPicker.tsx`),
  hook: readFile(`${SR2GE2_FEATURE_ROOT}/useMealBuddyRealCandidates.ts`),
  demoTime: readFile("apps/mobile/features/demo-time/demoTimeStore.ts")
};

// --- family A: the screen integration ------------------------------------------------------------
function integrationViolations(s) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const screenExec = tsExec(s.screen);
  const feature = tsExec([s.cardUi, s.section, s.picker, s.hook].join("\n"));

  rec("the screen consumes the frozen SR-2G-E1 feature",
    /useMealBuddyRealCandidates/.test(s.screen) && /MealBuddyRealCandidateSection/.test(s.screen));
  rec("real mode comes from the canonical consumer runtime",
    /consumerRuntime\.mode === "supabase"/.test(s.screen));
  rec("the mock pipeline is short-circuited before it can run in real mode",
    screenExec.includes("if (isRealCandidateMode) return;")
    && screenExec.indexOf("if (isRealCandidateMode) return;") < screenExec.indexOf("rankMealBuddyRecommendations(card"));
  rec("mock recommendation groups are not rendered in real mode",
    /!isRealCandidateMode && recommendationGroups\.length > 0/.test(s.screen));
  rec("no mock candidate authority is referenced by the real feature",
    SR2GE2_MOCK_CANDIDATE_AUTHORITY.every((name) => !feature.includes(name)));
  rec("no error-to-mock fallback exists",
    !/catch[\s\S]{0,160}(getMealBuddyCandidates|rankMealBuddyRecommendations|mockCandidates)/.test(`${screenExec}\n${feature}`));
  rec("the selected reference is forwarded verbatim as the source identity",
    /listCandidates\(sourceCardRef\)/.test(s.hook) && !/cards\.find\(/.test(tsExec(s.hook)));
  rec("no source identity is derived from a card field",
    SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS.every((f) => !new RegExp(`card\\.${f}\\s*===`).test(tsExec(s.hook))));
  rec("there is no positional or first-card fallback",
    !/cards\[0\]|\.at\(0\)|\[0\]\.sourceCardRef|\?\?\s*cards\[/.test(tsExec(s.hook)));
  rec("no source reference is hard-coded",
    !/["'`]mbc1\.[A-Za-z0-9_-]{4,}/.test(`${screenExec}\n${feature}`));
  rec("the picker selects by the card's own reference",
    /controller\.selectSourceCard\(card\.sourceCardRef\)/.test(s.picker));
  // Real mode is driven by the REAL card list alone. The real components are handed the controller
  // and nothing else, so there is no mock card in scope from which a mock->real mapping could even
  // be attempted, and the real feature never names the mock card shape.
  rec("the real components receive the controller only, never a mock card",
    /<MealBuddyRealSourceCardPicker controller=\{realCandidates\} \/>/.test(screenExec)
    && /<MealBuddyRealCandidateSection controller=\{realCandidates\} \/>/.test(screenExec));
  rec("the real feature never reads the mock card shape",
    !/\bMealBuddyCard\b/.test(feature.replace(/MealBuddyCandidateCard/g, "RealCandidateCard")));
  rec("the section maps the server array in place",
    /state\.candidates\.map\(\(candidate\) =>/.test(s.section));
  rec("nothing sorts or reranks the candidate array",
    !/\.sort\(|\.reverse\(|rankScore|localeCompare/.test(feature));
  // Scoped to the CANDIDATE array: `mascot.name.slice(0, 1)` is an initial for an avatar fallback,
  // not an exposure cap.
  rec("no client-side cap exists", !/\bcandidates\b[^\n]{0,40}\.slice\(/.test(feature));
  rec("no pagination or refill exists", !/cursor|pageToken|offset|refill|hasMore/i.test(feature));
  // Executable style only: the card's header comment legitimately explains that flexWrap is absent.
  rec("the interest row cannot wrap onto a second chip row",
    /interestRow: \{ flexDirection: "row"/.test(s.cardUi) && !/flexWrap/.test(tsExec(s.cardUi)));
  rec("the overflow chip is rendered when the server reports a remainder",
    /line\.overflowLabel === null \? null/.test(s.cardUi));
  // A hard-coded map puts the label on either side of the colon, so both forms are rejected.
  rec("labels come from the canonical resolver, not a hard-coded map",
    /buildCompactInterestLine/.test(s.cardUi)
    && !/(影視娛樂|遊戲|運動健身|日式|火鍋|甜點飲品)/.test(feature));
  rec("no fine-grained interest tag is rendered",
    !/generalTagKeys|foodTagKeys|publicInterestTags|tagKey/.test(feature));
  rec("a general card renders no restaurant placeholder",
    /card\.restaurant === null \|\| card\.restaurant\.name === null \? null/.test(s.cardUi));
  rec("the five states are distinct in the state machine",
    ["idle", "loading", "ready", "noSource", "failed"].every((p) => new RegExp(`phase: "${p}"`).test(s.hook)));
  rec("no-source is mapped to its own phase",
    /no_source_card[\s\S]{0,60}phase: "noSource"/.test(s.hook));
  rec("leaving live mode resets cards, selection and candidates",
    /if \(!isLiveMode\) reset\(\)/.test(s.hook) && /setSelectedSourceCardRef\(null\)/.test(s.hook));
  rec("neither reference is persisted", !/AsyncStorage|localStorage|setItem\(/.test(feature));
  rec("neither reference is decoded", !/atob|base64|decodeRef|candidateRef\.slice/.test(feature));
  rec("the press seam carries the person reference only",
    /onPress\(candidate\.candidateRef\)/.test(s.cardUi) && !/onPress\(candidate\.candidateCardRef\)/.test(s.cardUi));
  rec("the Asia/Taipei helper is still the dining-date authority",
    /mealBuddyTaipeiDateKey\(getEffectiveCurrentDate\(\)\)/.test(s.demoTime));
  rec("no UTC day regression exists",
    !/toISOString\(\)\.slice\(0, ?10\)/.test(`${screenExec}\n${feature}`));
  rec("no profile, invite, chat or menu-context feature is begun",
    !/fullProfile|acceptMatch|chatThread|menuContext|router\.push/i.test(feature));
  rec("the real candidate DTO is never widened with an any escape hatch",
    !/as any|: any\b/.test(feature));
  return failed;
}

// --- family B: the executable screen orchestration ------------------------------------------------
const SERVER_ORDER = ["F", "B", "K", "D", "J", "C", "H", "E", "G", "I"];
const INTEREST_COUNT = { B: 1, C: 5, D: 2, E: 0, F: 4, G: 1, H: 3, I: 2, J: 6, K: 1 };
const OWNED = [
  { sourceCardRef: "mbc1.general", cardType: "general", diningDate: "2026-08-20", mealPeriod: "dinner" },
  { sourceCardRef: "mbc1.restaurant", cardType: "restaurant", diningDate: "2026-08-20", mealPeriod: "dinner" }
];

const CANONICAL = Object.freeze({
  candidateSource: "real", selectBy: "reference", firstCardFallback: false, hardCodedRef: false,
  clientSort: false, rankByInterests: false, clientCap: null,
  errorBecomesEmpty: false, errorBecomesMock: false, mergeStates: false,
  visibleCategories: 3, omitOverflow: false, exposeFineTags: false, hardCodedLabels: false,
  persistRefs: false, decodeRefs: false, personFromCardRef: false, utcDate: false
});

function screenModel(rules, scenario = "ok", requestedRef = "mbc1.general") {
  if (rules.candidateSource === "mock") {
    return { source: "mock", phase: "ready", sentRef: "mock", candidates: [], persisted: [], decoded: false, dateKey: "2026-08-19" };
  }
  // Selection. Reference equality is the only correct rule; the mutants replace it.
  let chosen = null;
  if (rules.hardCodedRef) chosen = OWNED[0];
  else if (rules.selectBy === "reference") chosen = OWNED.find((c) => c.sourceCardRef === requestedRef) ?? null;
  else if (rules.selectBy === "diningDate") chosen = OWNED.find((c) => c.diningDate === "2026-08-20") ?? null;
  else if (rules.selectBy === "cardType") chosen = OWNED.find((c) => c.cardType === "general") ?? null;
  if (!chosen && rules.firstCardFallback) chosen = OWNED[0];
  if (!chosen) return { source: "real", phase: "noSource", sentRef: null, candidates: [], persisted: [], decoded: false, dateKey: "2026-08-19" };

  if (scenario === "error") {
    if (rules.errorBecomesEmpty) return { source: "real", phase: "ready", sentRef: chosen.sourceCardRef, candidates: [], persisted: [], decoded: false, dateKey: "2026-08-19" };
    if (rules.errorBecomesMock) return { source: "mock", phase: "ready", sentRef: chosen.sourceCardRef, candidates: SERVER_ORDER.map((o) => ({ owner: o })), persisted: [], decoded: false, dateKey: "2026-08-19" };
    return { source: "real", phase: rules.mergeStates ? "ready" : "failed", sentRef: chosen.sourceCardRef, candidates: [], persisted: [], decoded: false, dateKey: "2026-08-19" };
  }

  let owners = [...SERVER_ORDER];
  if (rules.clientSort) owners = [...owners].sort();
  if (rules.rankByInterests) owners = [...owners].sort((l, r) => INTEREST_COUNT[r] - INTEREST_COUNT[l]);
  if (rules.clientCap !== null) owners = owners.slice(0, rules.clientCap);

  return {
    source: "real", phase: "ready", sentRef: chosen.sourceCardRef,
    candidates: owners.map((owner) => ({
      owner,
      candidateRef: `scr1.person-${owner}`,
      candidateCardRef: rules.personFromCardRef ? `mbc1.person-${owner}` : `mbc1.card-${owner}`,
      chips: Array.from({ length: Math.min(INTEREST_COUNT[owner], rules.visibleCategories) },
        (_, i) => (rules.hardCodedLabels ? `HARDCODED${i}` : `catalog.${i}`)),
      overflow: rules.omitOverflow ? null : Math.max(INTEREST_COUNT[owner] - rules.visibleCategories, 0),
      fineTags: rules.exposeFineTags ? ["general.entertainment.movie"] : undefined
    })),
    persisted: rules.persistRefs ? ["scr1.person-B"] : [],
    decoded: rules.decodeRefs,
    dateKey: rules.utcDate ? "2026-08-18" : "2026-08-19"
  };
}

function screenViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const ok = screenModel(rules);
  const err = screenModel(rules, "error");
  const unknown = screenModel(rules, "ok", "mbc1.notmine");
  const restaurant = screenModel(rules, "ok", "mbc1.restaurant");

  rec("real mode never renders a mock source", ok.source === "real" && err.source === "real");
  rec("the reference sent is the selected card's own", ok.sentRef === "mbc1.general");
  rec("selecting the other card sends the other reference", restaurant.sentRef === "mbc1.restaurant");
  rec("an unknown reference resolves to no-source, never to another card",
    unknown.phase === "noSource" && unknown.sentRef === null);
  rec("the server order is preserved exactly",
    JSON.stringify(ok.candidates.map((c) => c.owner)) === JSON.stringify(SERVER_ORDER));
  rec("no client cap is applied", ok.candidates.length === SERVER_ORDER.length);
  rec("interests never reorder candidates",
    JSON.stringify(ok.candidates.map((c) => c.owner)) === JSON.stringify(SERVER_ORDER));
  rec("at most three chips render", ok.candidates.every((c) => c.chips.length <= 3));
  rec("the overflow remainder is always derived", ok.candidates.every((c) => typeof c.overflow === "number"));
  rec("the overflow remainder is correct",
    ok.candidates.every((c) => c.overflow === Math.max(INTEREST_COUNT[c.owner] - 3, 0)));
  rec("chips are canonical labels", ok.candidates.every((c) => c.chips.every((x) => !x.startsWith("HARDCODED"))));
  rec("no fine-grained tag reaches the card", ok.candidates.every((c) => c.fineTags === undefined));
  rec("no reference is persisted", ok.persisted.length === 0);
  rec("no reference is decoded", ok.decoded === false);
  rec("the person reference is never derived from the card reference",
    ok.candidates.every((c) => c.candidateCardRef !== c.candidateRef.replace("scr1.", "mbc1.")));
  rec("a server error never becomes a successful list", err.phase !== "ready");
  rec("a server error never becomes mock data", err.source !== "mock");
  rec("the dining date uses the Asia/Taipei day", ok.dateKey === "2026-08-19");
  return failed;
}

// --- mutants ---------------------------------------------------------------------------------------
const integrationMutants = [
  ["the mock candidate list is restored in real mode", (s) => ({ ...s, screen: s.screen.replace("if (isRealCandidateMode) return;", "") })],
  ["mock recommendation groups are rendered in real mode", (s) => ({ ...s, screen: s.screen.replace("!isRealCandidateMode && recommendationGroups.length > 0", "recommendationGroups.length > 0") })],
  ["the real feature calls the mock ranker", (s) => ({ ...s, hook: `${s.hook}\nconst ranked = rankMealBuddyRecommendations(null, getMealBuddyCandidates());` })],
  ["an API error falls back to mock candidates", (s) => ({ ...s, hook: s.hook.replace("setState(outcome.error.code === \"no_source_card\"", "if (true) { const items = getMealBuddyCandidates(); return; }\n    setState(outcome.error.code === \"no_source_card\"") })],
  ["a mock card is mapped onto a real source card by dining date", (s) => ({ ...s, hook: s.hook.replace("const outcome = await service().listCandidates(sourceCardRef);", "const list = await service().listSourceCards();\n    const mapped = list.ok ? list.value.find((card) => card.diningDate === mockCard.diningDate) : null;\n    const outcome = await service().listCandidates(mapped ? mapped.sourceCardRef : sourceCardRef);") })],
  ["a mock card is mapped onto a real source card by card type", (s) => ({ ...s, hook: s.hook.replace("const outcome = await service().listCandidates(sourceCardRef);", "const list = await service().listSourceCards();\n    const mapped = list.ok ? list.value.find((card) => card.cardType === mockCard.cardType) : null;\n    const outcome = await service().listCandidates(mapped ? mapped.sourceCardRef : sourceCardRef);") })],
  ["a first-card fallback is introduced", (s) => ({ ...s, hook: s.hook.replace("const outcome = await service().listCandidates(sourceCardRef);", "const list = await service().listSourceCards();\n    const outcome = await service().listCandidates(list.ok ? list.value[0].sourceCardRef : sourceCardRef);") })],
  ["a mock card is handed to the real source picker", (s) => ({ ...s, screen: s.screen.replace("<MealBuddyRealSourceCardPicker controller={realCandidates} />", "<MealBuddyRealSourceCardPicker controller={realCandidates} mockCard={card} />") })],
  ["a Development source reference is hard-coded", (s) => ({ ...s, hook: `${s.hook}\nconst DEV = "mbc1.HARDCODEDDEVREF";` })],
  ["the candidate array is sorted locally", (s) => ({ ...s, section: s.section.replace("state.candidates.map((candidate) =>", "[...state.candidates].sort().map((candidate) =>") })],
  ["a client-side cap is applied", (s) => ({ ...s, section: s.section.replace("state.candidates.map((candidate) =>", "state.candidates.slice(0, 5).map((candidate) =>") })],
  ["pagination is introduced", (s) => ({ ...s, hook: `${s.hook}\nlet nextCursor: string | null = null;` })],
  ["the interest row is allowed to wrap", (s) => ({ ...s, cardUi: s.cardUi.replace('interestRow: { flexDirection: "row"', 'interestRow: { flexWrap: "wrap", flexDirection: "row"') })],
  ["the overflow chip is dropped", (s) => ({ ...s, cardUi: s.cardUi.replace("line.overflowLabel === null ? null", "true ? null") })],
  ["hard-coded category labels are introduced", (s) => ({ ...s, cardUi: `${s.cardUi}\nconst LABELS = { entertainment: "影視娛樂" };` })],
  ["fine-grained tags are rendered", (s) => ({ ...s, cardUi: s.cardUi.replace("candidate.interests.generalCategoryKeys", "candidate.interests.publicInterestTags") })],
  ["a general card renders a placeholder restaurant", (s) => ({ ...s, cardUi: s.cardUi.replace("card.restaurant === null || card.restaurant.name === null ? null", "false ? null") })],
  ["no-source is merged into the error state", (s) => ({ ...s, hook: s.hook.replace('outcome.error.code === "no_source_card"\n      ? { phase: "noSource" }\n      : { phase: "failed", code: outcome.error.code }', '{ phase: "failed", code: outcome.error.code }') })],
  ["sign-out no longer resets the selection", (s) => ({ ...s, hook: s.hook.replace("setSelectedSourceCardRef(null);", "") })],
  ["a reference is persisted to device storage", (s) => ({ ...s, hook: `${s.hook}\nAsyncStorage.setItem("ref", "x");` })],
  ["a reference is decoded", (s) => ({ ...s, cardUi: `${s.cardUi}\nconst raw = atob(candidate.candidateRef.slice(5));` })],
  ["the press seam carries the card reference instead of the person", (s) => ({ ...s, cardUi: s.cardUi.replace("onPress(candidate.candidateRef)", "onPress(candidate.candidateCardRef)") })],
  ["the Asia/Taipei correction is removed", (s) => ({ ...s, demoTime: s.demoTime.replace("mealBuddyTaipeiDateKey(getEffectiveCurrentDate())", "getEffectiveCurrentDate().toISOString().slice(0, 10)") })],
  ["profile navigation is begun", (s) => ({ ...s, cardUi: `${s.cardUi}\nrouter.push("/profile");` })],
  ["an any escape hatch is opened on the DTO", (s) => ({ ...s, section: s.section.replace("state.candidates.map((candidate) =>", "(state.candidates as any).map((candidate: any) =>") })]
];

const screenMutants = [
  ["the mock candidate source is restored", { candidateSource: "mock" }],
  ["the source card is matched by dining date", { selectBy: "diningDate" }],
  ["the source card is matched by card type", { selectBy: "cardType" }],
  ["a first-card fallback is introduced", { firstCardFallback: true }],
  ["a Development reference is hard-coded", { hardCodedRef: true }],
  ["the candidate array is sorted locally", { clientSort: true }],
  ["interest count becomes the ranking", { rankByInterests: true }],
  ["the old 5-candidate cap is restored", { clientCap: 5 }],
  ["a Free-style 3-candidate cap is applied client-side", { clientCap: 3 }],
  ["a server error becomes an empty list", { errorBecomesEmpty: true }],
  ["a server error falls back to mock data", { errorBecomesMock: true }],
  ["the error and ready states are merged", { mergeStates: true }],
  ["a fourth category chip renders", { visibleCategories: 4 }],
  ["the overflow remainder is dropped", { omitOverflow: true }],
  ["hard-coded labels replace the catalog", { hardCodedLabels: true }],
  ["fine-grained tags are exposed", { exposeFineTags: true }],
  ["references are persisted", { persistRefs: true }],
  ["references are decoded", { decodeRefs: true }],
  ["person identity is derived from the card reference", { personFromCardRef: true }],
  ["the UTC day is used as the dining date", { utcDate: true }]
];

const results = [];
const push = (name, applied, failed) => {
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
};

let baselineBroken = false;
for (const [label, value, fn] of [
  ["canonical screen integration satisfies the exact SR-2G-E2 contract", SOURCES, integrationViolations],
  ["canonical screen orchestration satisfies the exact SR-2G-E2 contract", CANONICAL, screenViolations]
]) {
  const failed = fn(value);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) { baselineBroken = true; console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`); }
  else console.log(`BASELINE OK ${label}`);
}

for (const [name, apply] of integrationMutants) {
  const mutated = apply(SOURCES);
  const applied = JSON.stringify(mutated) !== JSON.stringify(SOURCES);
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? integrationViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, override] of screenMutants) push(name, true, screenViolations({ ...CANONICAL, ...override }));

const survivors = results.filter((r) => r.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-e2-mutations",
  total: results.length, killed: results.length - survivors.length, survived: survivors.length,
  baselineBroken, survivors, repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
