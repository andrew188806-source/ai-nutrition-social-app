#!/usr/bin/env node
// SR-2G-E1 meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families: the CLIENT CONTRACT mutated as text over the real feature sources, and the
// ORCHESTRATION mutated through an executable model, so a design that reintroduces mock candidates,
// a client cap, local ranking, ref persistence or a UTC dining date cannot pass as the real one.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GE1_FEATURE_ROOT, SR2GE1_SHARED_ROOT, SR2GE1_TOOLING_PATHS
} from "./social-candidate-sr2g-e1-successor-manifest.mjs";

const root = process.cwd();
const readFile = (f) => fs.readFileSync(path.join(root, f), "utf8");
const tsExec = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

const SOURCES = {
  contracts: readFile(`${SR2GE1_FEATURE_ROOT}/supabaseMealBuddyCandidateContracts.ts`),
  cardRepo: readFile(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`),
  candidateRepo: readFile(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyCandidateRepository.ts`),
  disabled: readFile(`${SR2GE1_FEATURE_ROOT}/adapters/disabledMealBuddyRepositories.ts`),
  errors: readFile(`${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyErrors.ts`),
  service: readFile(`${SR2GE1_FEATURE_ROOT}/mealBuddyCandidateService.ts`),
  types: readFile(`${SR2GE1_FEATURE_ROOT}/types.ts`),
  flags: readFile(`${SR2GE1_FEATURE_ROOT}/featureFlags.ts`),
  factories: readFile(`${SR2GE1_FEATURE_ROOT}/factories.ts`),
  binding: readFile(`${SR2GE1_FEATURE_ROOT}/runtimeBinding.ts`),
  catalog: readFile(`${SR2GE1_FEATURE_ROOT}/interestCatalog.ts`),
  taipei: readFile(`${SR2GE1_FEATURE_ROOT}/taipeiDiningDate.ts`),
  dtoTypes: readFile(`${SR2GE1_SHARED_ROOT}/types.ts`),
  dtoValidate: readFile(`${SR2GE1_SHARED_ROOT}/validate.ts`),
  demoTime: readFile("apps/mobile/features/demo-time/demoTimeStore.ts"),
  tooling: SR2GE1_TOOLING_PATHS.map(readFile).join("\n")
};

// --- family A: the client contract ------------------------------------------------------------
function contractViolations(s) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const all = tsExec([s.contracts, s.cardRepo, s.candidateRepo, s.disabled, s.errors, s.service,
    s.types, s.flags, s.factories, s.binding, s.catalog, s.taipei, s.dtoTypes, s.dtoValidate].join("\n"));

  rec("the real card-list function is named and called",
    /MEAL_BUDDY_CARD_LIST_FUNCTION_NAME = "meal-buddy-card-list"/.test(s.contracts)
    && /invoke\(\s*MEAL_BUDDY_CARD_LIST_FUNCTION_NAME/.test(s.cardRepo));
  rec("the real candidate function is named and called",
    /MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME = "meal-buddy-candidate-list"/.test(s.contracts)
    && /invoke\(\s*MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME/.test(s.candidateRepo));
  rec("the SR-2D product surface is never called", !/social-candidate-list/.test(all));
  rec("the candidate body is exactly one source reference", /\{ body: \{ sourceCardRef \} \}/.test(s.candidateRepo));
  rec("a missing or malformed source reference is refused before any request",
    /!sourceCardRef\.startsWith\("mbc1\."\)/.test(s.candidateRepo));
  rec("no source reference is hard-coded", !/["'`]mbc1\.[A-Za-z0-9_-]{4,}/.test(all));
  rec("no Development fixture identity is hard-coded",
    !/development\.invalid|mealbuddy\.demo|mealbuddy\.viewer|de300001-/.test(all));
  rec("the shared validator is the only trust boundary",
    /validateMealBuddyCandidateApiResponseV1\(invokeResult\.data\)/.test(s.candidateRepo)
    && !/as MealBuddyCandidateApiResponse/.test(tsExec(s.candidateRepo)));
  rec("an unexpected key is a rejection", /function exactKeys/.test(s.dtoValidate));
  // The DECLARATION is matched with its `function` keyword: `isTopLevelCategoryKey` alone is a
  // substring of any renamed variant, so a rename would slip past a bare name match.
  rec("a fine-grained interest tag is rejected",
    /function isTopLevelCategoryKey/.test(s.dtoValidate)
    && /segments\.length === 2/.test(s.dtoValidate)
    && /isTopLevelCategoryKey\(entry, namespace\)/.test(s.dtoValidate));
  rec("more than three visible categories is a rejection, not a truncation",
    /exceeds the compact visible limit/.test(s.dtoValidate) && !/CategoryKeys\.slice\(/.test(s.dtoValidate));
  rec("an over-cap response is rejected rather than trimmed",
    /candidates exceeds the frozen exposure cap/.test(s.dtoValidate) && !/\.slice\(0, MEAL_BUDDY_CANDIDATE_MAXIMUM\)/.test(s.dtoValidate));
  rec("both reference families are asserted by marker only",
    /startsWith\(MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX\)/.test(s.dtoValidate)
    && /startsWith\(MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX\)/.test(s.dtoValidate));
  rec("no reference is decoded", !/atob\(|Buffer\.from\([^)]*base64|decodeRef/.test(all));
  rec("no reference is persisted", !/AsyncStorage|localStorage|setItem\(/.test(all));
  // Field DECLARATIONS, not prose: the DTO header legitimately explains that no ranking state or
  // entitlement fact exists, so a bare word match would read the comment and fail on the real file.
  const dtoFields = tsExec(s.dtoTypes);
  rec("no raw identifier exists on the DTO", !/\b(candidateUserId|ownerUserId|profileId|cardId)\s*:/.test(dtoFields));
  rec("no ranking or entitlement field exists on the DTO",
    !/\b(rankingState|similarity|entitlement|isPremium|plan_code)\s*:/.test(dtoFields));
  // Scoped to the transport and service. The shared validator legitimately calls Object.keys().sort()
  // to compare KEY SETS, which is not candidate ordering.
  rec("the client never sorts or reranks the candidate array",
    !/\.sort\(|\.reverse\(|rankScore/.test(tsExec([s.candidateRepo, s.cardRepo, s.service].join("\n"))));
  rec("no client-side cap exists", !/\.slice\(0,\s*\d+\)/.test(all));
  rec("no pagination or refill exists", !/cursor|pageToken|offset|refill|hasMore/i.test(all));
  rec("labels come from the canonical catalog table", /social_interest_catalog_label/.test(s.catalog));
  rec("no hard-coded category label map exists",
    !/(娛樂|美食|運動|旅遊|音樂|創作|學習|生活)/.test(all));
  rec("the dining-date helper formats through the policy zone",
    /timeZone: MEAL_BUDDY_DINING_DATE_TIME_ZONE/.test(s.taipei) && /"Asia\/Taipei"/.test(s.taipei));
  rec("the effective day is no longer the UTC day",
    /mealBuddyTaipeiDateKey\(getEffectiveCurrentDate\(\)\)/.test(s.demoTime)
    && !/getEffectiveCurrentDate\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(s.demoTime));
  rec("every read requires the canonical session",
    /authPort\.getCurrentSession\(\)/.test(s.cardRepo) && /authPort\.getCurrentSession\(\)/.test(s.candidateRepo));
  rec("no service-role client can be constructed", !/service_role|createClient\(/.test(all));
  // The error BRANCH itself must return a typed error. A `catch`-scoped pattern is not enough: the
  // `if (invokeResult.error)` branch is where an empty-success substitution would actually be made.
  rec("an infrastructure failure never becomes an empty list",
    /if \(invokeResult\.error\) \{\s*return errCandidates\(await mapInvokeErrorToClientError/.test(s.candidateRepo)
    && /if \(invokeResult\.error\) \{\s*return errSourceCards\(await mapInvokeErrorToClientError/.test(s.cardRepo)
    && !/okCandidates\(\{[^}]*candidates: \[\]/.test(all)
    && !/catch[\s\S]{0,120}candidates: \[\]/.test(all));
  rec("the five failure states remain distinct",
    ["no_source_card", "meal_buddy_candidates_disabled", "network_error", "server_unavailable", "invalid_server_response"]
      .every((code) => s.types.includes(`"${code}"`)));
  rec("no mock module is imported",
    !/mealBuddyCardMock|mealBuddyFlowMock|mealBuddySocialStore|mealBuddyRanking|mockSocialCandidateRepository/.test(all));
  // Executable flags only: the header comment legitimately states that no "mock" source exists.
  rec("a mock source is not representable", !/"mock"/.test(tsExec(s.flags)) && !/Mock/.test(tsExec(s.factories)));
  rec("no invite, chat, profile or menu-context concept appears",
    !/invite|chatThread|fullProfile|menuContext/i.test(all));
  rec("the tooling scripts still hard-pin the Development project",
    /msbgnnoorsoefuiwluye/.test(s.tooling) && /DEVELOPMENT ONLY/.test(s.tooling));
  return failed;
}

// --- family B: the executable orchestration model ------------------------------------------------
// Deliberately NOT alphabetical and deliberately uncorrelated with interest count: a client-side
// sort and an interest-ranked order must each produce a visibly different sequence, otherwise the
// corresponding mutants would be undetectable for want of a discriminating fixture.
const SERVER_ORDER = ["F", "B", "K", "D", "J", "C", "H", "E", "G", "I"];
const INTEREST_COUNT = { B: 1, C: 5, D: 2, E: 0, F: 4, G: 1, H: 3, I: 2, J: 6, K: 1 };

const CANONICAL = Object.freeze({
  cardSource: "real", candidateSource: "real", hardCodedSourceRef: false, omitSourceRef: false,
  validate: true, clientSort: false, rankByInterests: false, clientCap: null,
  errorBecomesEmpty: false, errorBecomesMock: false, exposeFineTags: false,
  visibleCategories: 3, omitOverflow: false, hardCodedLabels: false,
  persistRefs: false, decodeRefs: false, personFromCardRef: false,
  utcDate: false, mergeStates: false
});

function pipeline(rules, scenario = "ok") {
  // 1. source card. The mock branch returns the SAME shape as the real one, so every downstream
  // invariant is still evaluated against it rather than throwing and masking the other violations.
  if (rules.cardSource === "mock") {
    return {
      source: "mock", state: "ok", sentRef: "mock-card", candidates: [],
      persisted: [], decoded: false, diningDateKey: "2026-08-19"
    };
  }
  const sentRef = rules.omitSourceRef ? null : (rules.hardCodedSourceRef ? "mbc1.HARDCODED" : "mbc1.fromCardList");

  // 2. candidate read
  if (scenario === "error") {
    if (rules.errorBecomesEmpty) return { source: "real", state: "ok", candidates: [], sentRef };
    if (rules.errorBecomesMock) return { source: "mock", state: "ok", candidates: SERVER_ORDER.map((o) => ({ owner: o })), sentRef };
    return { source: "real", state: rules.mergeStates ? "empty" : "server_unavailable", candidates: null, sentRef };
  }
  if (scenario === "no_source") {
    return { source: "real", state: rules.mergeStates ? "empty" : "no_source_card", candidates: null, sentRef };
  }
  if (scenario === "disabled") {
    return { source: "real", state: rules.mergeStates ? "empty" : "disabled", candidates: null, sentRef };
  }

  // 3. order
  let owners = [...SERVER_ORDER];
  if (rules.clientSort) owners = [...owners].sort();
  if (rules.rankByInterests) owners = [...owners].sort((l, r) => INTEREST_COUNT[r] - INTEREST_COUNT[l]);
  if (rules.clientCap !== null) owners = owners.slice(0, rules.clientCap);

  return {
    source: "real", state: "ok", sentRef,
    candidates: owners.map((owner) => ({
      owner,
      candidateRef: `scr1.person-${owner}`,
      candidateCardRef: rules.personFromCardRef ? `mbc1.person-${owner}` : `mbc1.card-${owner}`,
      chips: Array.from({ length: Math.min(INTEREST_COUNT[owner], rules.visibleCategories) },
        (_, i) => (rules.hardCodedLabels ? `HARDCODED${i}` : `catalog.${i}`)),
      overflow: rules.omitOverflow ? null : Math.max(INTEREST_COUNT[owner] - rules.visibleCategories, 0),
      fineTags: rules.exposeFineTags ? ["general.entertainment.movie"] : undefined,
      validated: rules.validate
    })),
    persisted: rules.persistRefs ? ["scr1.person-B", "mbc1.card-B"] : [],
    decoded: rules.decodeRefs,
    diningDateKey: rules.utcDate ? "2026-08-18" : "2026-08-19"
  };
}

function pipelineViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const out = pipeline(rules);
  const err = pipeline(rules, "error");
  const noSource = pipeline(rules, "no_source");
  const disabled = pipeline(rules, "disabled");

  rec("the real data path never uses a mock source", out.source === "real" && err.source === "real");
  rec("a source reference is always sent", typeof out.sentRef === "string" && out.sentRef.length > 0);
  rec("the source reference comes from the card list, never hard-coded", out.sentRef === "mbc1.fromCardList");
  rec("every candidate passed the shared validator", out.candidates.every((c) => c.validated === true));
  rec("the server order is preserved exactly",
    JSON.stringify(out.candidates.map((c) => c.owner)) === JSON.stringify(SERVER_ORDER));
  rec("no client cap is applied", out.candidates.length === SERVER_ORDER.length);
  rec("interests never reorder candidates",
    JSON.stringify(out.candidates.map((c) => c.owner)) === JSON.stringify(SERVER_ORDER));
  rec("at most three category chips render", out.candidates.every((c) => c.chips.length <= 3));
  rec("an overflow remainder is always derived", out.candidates.every((c) => typeof c.overflow === "number"));
  rec("the overflow remainder is correct",
    out.candidates.every((c) => c.overflow === Math.max(INTEREST_COUNT[c.owner] - 3, 0)));
  rec("chips are canonical catalog labels", out.candidates.every((c) => c.chips.every((chip) => !chip.startsWith("HARDCODED"))));
  rec("no fine-grained tag reaches the card", out.candidates.every((c) => c.fineTags === undefined));
  rec("no reference is persisted", out.persisted.length === 0);
  rec("no reference is decoded", out.decoded === false);
  rec("the person reference is never derived from the card reference",
    out.candidates.every((c) => c.candidateCardRef !== c.candidateRef.replace("scr1.", "mbc1.")));
  rec("an infrastructure error never becomes a successful empty list", err.state !== "ok");
  rec("an infrastructure error never becomes mock data", err.source !== "mock");
  rec("the error state stays distinct from empty", err.state === "server_unavailable");
  rec("the no-source state stays distinct from empty", noSource.state === "no_source_card");
  rec("the disabled state stays distinct from empty", disabled.state === "disabled");
  rec("the dining date uses the Asia/Taipei day", out.diningDateKey === "2026-08-19");
  return failed;
}

// --- mutants ----------------------------------------------------------------------------------------
const contractMutants = [
  ["the card source is replaced by a mock repository", (s) => ({ ...s, factories: s.factories.replace("DisabledMealBuddySourceCardRepository", "MockMealBuddySourceCardRepository") })],
  ["the candidate source is replaced by a mock repository", (s) => ({ ...s, flags: s.flags.replace('"disabled" | "supabase-live"', '"disabled" | "mock" | "supabase-live"') })],
  ["the old SR-2D product surface is called instead", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME", '"social-candidate-list"') })],
  ["the source reference is omitted from the body", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("{ body: { sourceCardRef } }", "{ body: {} }") })],
  ["a Development source reference is hard-coded", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("{ body: { sourceCardRef } }", '{ body: { sourceCardRef: "mbc1.HARDCODEDDEVREF" } }') })],
  ["a Development fixture account is hard-coded", (s) => ({ ...s, cardRepo: `${s.cardRepo}\nconst VIEWER = "mealbuddy.viewer@development.invalid";` })],
  ["an arbitrary source card uuid is accepted", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace('!sourceCardRef.startsWith("mbc1.")', "false") })],
  ["the DTO validator is bypassed", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("validateMealBuddyCandidateApiResponseV1(invokeResult.data)", "{ ok: true, value: invokeResult.data as MealBuddyCandidateApiResponse }") })],
  ["unknown authority-bearing fields are tolerated", (s) => ({ ...s, dtoValidate: s.dtoValidate.replace(/function exactKeys/, "function unusedExactKeys") })],
  ["fine-grained interest tags are accepted", (s) => ({ ...s, dtoValidate: s.dtoValidate.replace(/function isTopLevelCategoryKey/, "function unusedIsTopLevelCategoryKey") })],
  ["a fourth category is truncated instead of rejected", (s) => ({ ...s, dtoValidate: s.dtoValidate.replace("exceeds the compact visible limit", "is fine after CategoryKeys.slice(0, 3)") })],
  ["an over-cap response is trimmed instead of rejected", (s) => ({ ...s, dtoValidate: s.dtoValidate.replace("candidates exceeds the frozen exposure cap", "value.candidates.slice(0, MEAL_BUDDY_CANDIDATE_MAXIMUM)") })],
  ["a raw identifier is added to the DTO", (s) => ({ ...s, dtoTypes: s.dtoTypes.replace("  candidateRef: string;", "  candidateRef: string;\n  candidateUserId: string;") })],
  ["a ranking state is added to the DTO", (s) => ({ ...s, dtoTypes: s.dtoTypes.replace("  willingToChat: boolean;", "  willingToChat: boolean;\n  rankingState: string;") })],
  ["the client sorts the candidate array", (s) => ({ ...s, service: s.service.replace("return this.options.candidateRepository.listCandidates(sourceCardRef);", "return this.options.candidateRepository.listCandidates(sourceCardRef).then((r) => r.value.candidates.sort());") })],
  ["a client-side cap is applied", (s) => ({ ...s, service: s.service.replace("listCandidates(sourceCardRef: string)", "listCandidatesCapped(sourceCardRef: string) { return this.options.candidateRepository.listCandidates(sourceCardRef).then((r) => r.value.candidates.slice(0, 3)); }\n  listCandidates(sourceCardRef: string)") })],
  ["pagination is introduced", (s) => ({ ...s, service: s.service.replace("listCandidates(sourceCardRef: string)", "nextCursor: string | null = null;\n  listCandidates(sourceCardRef: string)") })],
  ["a reference is persisted to device storage", (s) => ({ ...s, binding: `${s.binding}\nAsyncStorage.setItem("candidateRef", "x");` })],
  ["a reference is decoded", (s) => ({ ...s, candidateRepo: `${s.candidateRepo}\nconst decodeRef = (r: string) => atob(r.slice(5));` })],
  ["a hard-coded category label map is introduced", (s) => ({ ...s, catalog: `${s.catalog}\nconst LABELS = { "general.entertainment": "娛樂" };` })],
  ["the canonical catalog table is abandoned", (s) => ({ ...s, catalog: s.catalog.replaceAll("social_interest_catalog_label", "local_label_map") })],
  ["the Asia/Taipei correction is removed", (s) => ({ ...s, demoTime: s.demoTime.replace("mealBuddyTaipeiDateKey(getEffectiveCurrentDate())", "getEffectiveCurrentDate().toISOString().slice(0, 10)") })],
  ["the dining-date helper drops the policy zone", (s) => ({ ...s, taipei: s.taipei.replace("timeZone: MEAL_BUDDY_DINING_DATE_TIME_ZONE", "// zone removed") })],
  ["the session check is removed from the candidate read", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("authPort.getCurrentSession()", "Promise.resolve({ ok: true, value: {} })") })],
  ["a service-role client is introduced", (s) => ({ ...s, cardRepo: `${s.cardRepo}\nconst admin = createClient(url, service_role);` })],
  ["an infrastructure error collapses into an empty list", (s) => ({ ...s, candidateRepo: s.candidateRepo.replace("return errCandidates(await mapInvokeErrorToClientError(invokeResult.error));", "return okCandidates({ policyVersion: \"meal-buddy-candidate-api-v1\", candidates: [] });") })],
  ["a mock module is imported by the real layer", (s) => ({ ...s, factories: `import { mealBuddySocialStore } from "../meal-buddy-card/mealBuddySocialStore";\n${s.factories}` })],
  ["an invite action is introduced", (s) => ({ ...s, service: `${s.service}\nexport function createInvite() { return null; }` })],
  ["the tooling project guard is weakened", (s) => ({ ...s, tooling: s.tooling.replaceAll("msbgnnoorsoefuiwluye", "any-project") })]
];

const pipelineMutants = [
  ["mock source-card authority is restored", { cardSource: "mock" }],
  ["the source reference is omitted", { omitSourceRef: true }],
  ["a Development source reference is hard-coded", { hardCodedSourceRef: true }],
  ["the DTO validator is bypassed", { validate: false }],
  ["the client sorts the server array", { clientSort: true }],
  ["interest count becomes the ranking", { rankByInterests: true }],
  ["the old client 5-candidate cap is restored", { clientCap: 5 }],
  ["the old client 3-candidate cap is restored", { clientCap: 3 }],
  ["a fourth category chip renders", { visibleCategories: 4 }],
  ["the overflow remainder is dropped", { omitOverflow: true }],
  ["hard-coded labels replace the catalog", { hardCodedLabels: true }],
  ["fine-grained tags are exposed", { exposeFineTags: true }],
  ["references are persisted", { persistRefs: true }],
  ["references are decoded", { decodeRefs: true }],
  ["person identity is derived from the card reference", { personFromCardRef: true }],
  ["a server error collapses into an empty list", { errorBecomesEmpty: true }],
  ["a server error falls back to mock data", { errorBecomesMock: true }],
  ["the disabled, no-source and error states are merged", { mergeStates: true }],
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
  ["canonical client contract satisfies the exact SR-2G-E1 contract", SOURCES, contractViolations],
  ["canonical orchestration satisfies the exact SR-2G-E1 contract", CANONICAL, pipelineViolations]
]) {
  const failed = fn(value);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) { baselineBroken = true; console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`); }
  else console.log(`BASELINE OK ${label}`);
}

for (const [name, apply] of contractMutants) {
  const mutated = apply(SOURCES);
  const applied = JSON.stringify(mutated) !== JSON.stringify(SOURCES);
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? contractViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, override] of pipelineMutants) push(name, true, pipelineViolations({ ...CANONICAL, ...override }));

const survivors = results.filter((r) => r.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-e1-mutations",
  total: results.length, killed: results.length - survivors.length, survived: survivors.length,
  baselineBroken, survivors, repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
