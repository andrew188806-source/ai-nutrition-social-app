#!/usr/bin/env node
// MI-E-C5-R7-C2b contract smoke — ANALYSIS RESTAURANT IDENTITY DISPLAY WIRING.
//
// Executes the REAL production modules:
//   * apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts (frozen R7-C2a)
//   * apps/mobile/features/meal-identification-finalization/v3Contract.ts       (frozen R7-B)
// against a canonical THREE-branch catalog fixture typed by the real catalog view models.
//
// The screen itself is a React component, so its WIRING is verified by exact source assertions
// (which composition the screen performs, which value each site renders) while the SEMANTICS it
// depends on are executed for real. Resolver semantics are never re-implemented here: every display
// expectation below is produced by calling the production resolver and then applying the screen's
// own composition rule, read from the screen's source.
//
// Fully local: no network, no Supabase client, no Development credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
function loadTsModule(relative) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: relative
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(require_, module, module.exports);
  return module.exports;
}

const SCREEN = "apps/mobile/app/analysis.tsx";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";

const resolve = loadTsModule(RESOLVER).resolveRestaurantContextPresentation;
const buildCommand = loadTsModule(V3_CONTRACT).buildMealIdentificationFinalizationV3;
expect(typeof resolve === "function", "S0 the REAL R7-C2a resolver loads and is callable");
expect(typeof buildCommand === "function", "S0 the REAL v3 command builder loads and is callable");

const screen = fs.readFileSync(path.join(root, SCREEN), "utf8");
const screenCode = screen
  .split("\n")
  .filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("{/*")
    );
  })
  .join("\n");
const sliceBetween = (source, from, to) => {
  const start = source.indexOf(from);
  if (start < 0) return "";
  const end = to ? source.indexOf(to, start + from.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
};
const editorBody = sliceBetween(screenCode, "function MealPhotoFinalizationEditor", "function MealPhotoAnalysisCandidateRow");
const completedSnapshotCard = sliceBetween(screenCode, "isDurableCompleted && completionSnapshot ?", "<CompletedAnalysisHero");
const finalizationMemo = sliceBetween(screenCode, "const finalizationContext = useMemo(", "const completeMealPhotoFinalization");

// Textual PROXIMITY is not a dependency: a prop list can place two unrelated names three lines
// apart. These helpers extract the actual gating EXPRESSIONS so "the display never gates
// finalization" is asserted against what the code computes, not against how it is laid out.
const balancedFrom = (source, index, open, close) => {
  let depth = 0;
  for (let i = index; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(index, i + 1);
    }
  }
  return source.slice(index);
};
const declarationExpression = (source, name) => {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === ";" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
};
const allCallArguments = (source, callee) => {
  const found = [];
  let from = 0;
  for (;;) {
    const index = source.indexOf(`${callee}(`, from);
    if (index < 0) return found;
    const open = source.indexOf("(", index);
    found.push(balancedFrom(source, open, "(", ")"));
    from = open + 1;
  }
};
const RESTAURANT_SYMBOLS =
  /restaurantContextPresentation|restaurantContextDisplayText|restaurantDisplayName|branchDisplayName|restaurantCatalog|catalogStatus/;
const gatingExpressions = [
  declarationExpression(screenCode, "submitDisabled"),
  declarationExpression(screenCode, "canFinalize"),
  declarationExpression(screenCode, "finalizationContextBlockReason"),
  declarationExpression(screenCode, "submitUnavailableReason"),
  ...allCallArguments(screenCode, "getMealPhotoFinalizationContextBlockReason")
];

// ---- the screen's own fallback copy and composition rule, read from source, not guessed --------
const UNKNOWN = (fs.readFileSync(path.join(root, "lib/i18n/zh-TW.ts"), "utf8").match(
  /restaurantNameUnknown: "([^"]+)"/
) ?? [])[1];
expect(UNKNOWN === "未知", "S0 the existing 未知 fallback copy is still the i18n authority", UNKNOWN);
expect(
  /\$\{restaurantDisplayName\} · \$\{branchDisplayName\}/.test(screenCode),
  "S0 the screen composes restaurant and branch with the existing · separator"
);

// The screen's rule, applied to whatever the REAL resolver returns.
const displayTextFor = (presentation) =>
  presentation.restaurantName === null
    ? UNKNOWN
    : presentation.branchName === null
      ? presentation.restaurantName
      : `${presentation.restaurantName} · ${presentation.branchName}`;

// ---- canonical nested fixture: three branches, name !== district for every one ------------------
const RESTAURANT = "dev-restaurant-haochu";
const B1 = "branch-xinyi";
const B2 = "branch-daan";
const B3 = "branch-zhongshan";
const RESTAURANT_NAME = "好廚健康碗";
const branch = (branchId, name, district) => ({
  branchId, restaurantId: RESTAURANT, name, district, address: `${district}測試路 1 號`, menus: []
});
const CATALOG = {
  id: RESTAURANT,
  restaurantId: RESTAURANT,
  // The flattened card fields the pre-C2a resolver used — deliberately present and deliberately
  // wrong for branch identity, so a regression back to them is immediately visible in the display.
  branchId: B1,
  name: RESTAURANT_NAME,
  location: "信義區",
  distanceDisplay: "信義區",
  category: "health",
  tags: [],
  priceRange: "NT$--",
  score: "—",
  menuItems: [],
  branches: [branch(B1, "信義店", "信義區"), branch(B2, "大安店", "大安區"), branch(B3, "中山店", "中山區")]
};
const findHit = () => CATALOG;
const findMiss = () => null;
const display = (over = {}) =>
  displayTextFor(
    resolve({ restaurantId: RESTAURANT, catalogStatus: "success", findRestaurant: findHit, ...over })
  );

// ---- the real finalization command, exercised alongside the display ----------------------------
const BASE_COMMAND_INPUT = Object.freeze({
  analysisRequestId: "3f1d3c22-1111-4a2b-8c3d-44445555aaaa",
  selectedCandidateId: "candidate-1",
  captureMethod: "camera",
  // The real vocabulary, read from the frozen contract: dine_in/takeout/delivery/self_cooked/unknown.
  sourceContext: "dine_in",
  recordTiming: "current",
  occurredAt: "2026-08-03T12:00:00.000Z",
  mealWrite: {
    mealName: "藜麥雞胸沙拉",
    components: ["雞胸", "藜麥"],
    portion: "1 份",
    nutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 }
  }
});
const commandKeys = (over = {}) => {
  const result = buildCommand({ ...BASE_COMMAND_INPUT, ...over });
  return result.ok ? Object.keys(result.value).sort() : { error: result.error.code };
};
const EIGHT_KEYS = [
  "analysisRequestId", "captureMethod", "mealWrite", "occurredAt",
  "recordTiming", "selectedCandidateId", "sourceContext", "version"
].sort();
const TEN_KEYS = [...EIGHT_KEYS, "branchId", "restaurantId"].sort();

// ================================ A. No context ==================================================
{
  const text = displayTextFor(resolve({ restaurantId: null, catalogStatus: "success", findRestaurant: findMiss }));
  expect(text === UNKNOWN, "A no restaurant context displays the existing 未知 fallback", text);
  expect(
    JSON.stringify(commandKeys({ sourceContext: "unknown" })) === JSON.stringify(EIGHT_KEYS),
    "A a context-free finalization still builds the unchanged 8-key command"
  );
}

// ================================ B. Restaurant only =============================================
{
  const text = display();
  expect(text === RESTAURANT_NAME, "B restaurant-only displays the real restaurant name", text);
  expect(!text.includes("·") && !text.includes(UNKNOWN), "B restaurant-only invents no branch and shows no stray separator", text);
  expect(text !== "信義店" && text !== "信義區", "B restaurant-only never falls back to branches[0] or its district", text);
  expect(
    JSON.stringify(commandKeys({ restaurantId: RESTAURANT })) === JSON.stringify(TEN_KEYS),
    "B restaurant-only still builds the 10-key restaurant command shape"
  );
}

// ================================ C/D/E. First, second, third branch =============================
{
  const first = display({ branchId: B1 });
  expect(first === `${RESTAURANT_NAME} · 信義店`, "C the first branch displays its own exact name", first);
  const second = display({ branchId: B2 });
  expect(second === `${RESTAURANT_NAME} · 大安店`, "D the second branch displays its own exact name", second);
  expect(!second.includes("信義店"), "D the second branch never falls back to the first branch", second);
  const third = display({ branchId: B3 });
  expect(third === `${RESTAURANT_NAME} · 中山店`, "E the third branch displays its own exact name", third);
  expect(new Set([first, second, third]).size === 3, "C-E all three branches display three DISTINCT values");
  expect(
    ![first, second, third].some((value) => /信義區|大安區|中山區/.test(value)),
    "C-E no displayed value is a district"
  );
  expect(
    JSON.stringify(commandKeys({ restaurantId: RESTAURANT, branchId: B2 })) === JSON.stringify(TEN_KEYS),
    "D a branch finalization still builds the 10-key command shape"
  );
}

// ================================ F. Missing branch ==============================================
{
  const text = display({ branchId: "branch-that-does-not-exist" });
  expect(text === RESTAURANT_NAME, "F an unknown branch still displays the restaurant name", text);
  expect(!text.includes("信義店") && !text.includes("·"), "F an unknown branch displays no wrong branch value", text);
  const result = buildCommand({ ...BASE_COMMAND_INPUT, restaurantId: RESTAURANT, branchId: "branch-that-does-not-exist" });
  expect(
    result.ok && result.value.restaurantId === RESTAURANT && result.value.branchId === "branch-that-does-not-exist",
    "F the display never rewrites the durable ids — an unresolvable branch id still reaches the command verbatim"
  );
}

// ================================ G. Missing restaurant ==========================================
{
  const text = displayTextFor(
    resolve({ restaurantId: RESTAURANT, branchId: B2, catalogStatus: "success", findRestaurant: findMiss })
  );
  expect(text === UNKNOWN, "G a catalog miss displays the 未知 fallback", text);
  expect(
    JSON.stringify(commandKeys({ restaurantId: RESTAURANT, branchId: B2 })) === JSON.stringify(TEN_KEYS),
    "G a catalog miss does not stop finalization — the command still builds"
  );
}

// ================================ H. Loading =====================================================
{
  for (const status of ["loading", "idle"]) {
    const text = display({ branchId: B2, catalogStatus: status });
    expect(text === UNKNOWN, `H catalogStatus=${status} displays the fallback, never a partial name`, text);
  }
  expect(
    JSON.stringify(commandKeys({ restaurantId: RESTAURANT, branchId: B2 })) === JSON.stringify(TEN_KEYS),
    "H a loading catalog does not block finalization"
  );
  expect(
    gatingExpressions.length >= 5 && gatingExpressions.every((expression) => !RESTAURANT_SYMBOLS.test(expression)),
    "H no submit gate, readiness rule or block reason is DERIVED from the restaurant presentation",
    { gatingExpressionsInspected: gatingExpressions.length }
  );
}

// ================================ I. Error / unavailable =========================================
{
  for (const status of ["error", "disabled"]) {
    const text = display({ branchId: B3, catalogStatus: status });
    expect(text === UNKNOWN, `I catalogStatus=${status} displays the fallback`, text);
  }
  // The screen's own status adapter must send unavailable/error to those fail-soft states.
  expect(
    /case "unavailable":\s*\r?\n\s*return "disabled";/.test(screenCode) &&
      /case "error":\s*\r?\n\s*return "error";/.test(screenCode) &&
      /case "loading":\s*\r?\n\s*return "loading";/.test(screenCode),
    "I the screen maps every non-success catalog state onto a fail-soft resolver state"
  );
  expect(
    JSON.stringify(commandKeys({ restaurantId: RESTAURANT, branchId: B3 })) === JSON.stringify(TEN_KEYS),
    "I an unavailable catalog does not block finalization"
  );
}

// ================================ J. Shared presentation =========================================
{
  expect(
    (screenCode.match(/resolveRestaurantContextPresentation\(/g) ?? []).length === 1,
    "J the resolver is invoked from exactly ONE place in the screen"
  );
  expect(
    (screenCode.match(/const restaurantContextDisplayText =/g) ?? []).length === 1,
    "J the display value is composed exactly ONCE"
  );
  expect(
    /\{restaurantContextDisplayText\}/.test(editorBody) && /\{restaurantContextDisplayText\}/.test(completedSnapshotCard),
    "J the editor and the completed snapshot card both render that one value"
  );
  expect(
    !/findRestaurantById/.test(editorBody) && !/findRestaurantById/.test(completedSnapshotCard),
    "J neither display site performs a lookup of its own"
  );
  expect(
    !/\.branches\b/.test(screenCode) && !/branches\[0\]/.test(screenCode) && !/\.district/.test(screenCode),
    "J no second branch-composition or district substitution exists anywhere in the screen"
  );
}

// ================================ K. No duplicate catalog hook ===================================
{
  expect(
    (screenCode.match(/useRestaurantCatalog\(\)/g) ?? []).length === 1,
    "K the screen mounts exactly one catalog hook"
  );
  expect(
    !/createMobileRestaurantCatalogComposition/.test(screenCode) && !/RestaurantCatalogService/.test(screenCode),
    "K the display opens no second catalog composition or service"
  );
}

// ================================ L. No payload contamination ====================================
{
  const withContext = buildCommand({ ...BASE_COMMAND_INPUT, restaurantId: RESTAURANT, branchId: B2 });
  expect(withContext.ok, "L the 10-key command builds");
  const serialized = JSON.stringify(withContext.ok ? withContext.value : {});
  expect(
    !serialized.includes(RESTAURANT_NAME) && !serialized.includes("大安店") && !serialized.includes("大安區"),
    "L no display name or district appears anywhere in the durable command",
    serialized.slice(0, 160)
  );
  expect(
    withContext.ok &&
      !Object.keys(withContext.value).some((key) => /restaurantName|branchName|displayName/i.test(key)),
    "L the command carries no name-shaped key"
  );
  expect(
    !/(restaurantContextDisplayText|restaurantDisplayName|branchDisplayName)/.test(finalizationMemo),
    "L the screen's finalization context memo carries ids only, never a display value"
  );
}

// ================================ M/N. 8-key and 10-key compatibility ============================
{
  const generic = buildCommand({ ...BASE_COMMAND_INPUT, sourceContext: "unknown" });
  expect(
    generic.ok && !("restaurantId" in generic.value) && !("branchId" in generic.value),
    "M the generic flow still OMITS both restaurant keys (not null-valued)"
  );
  const contextual = buildCommand({ ...BASE_COMMAND_INPUT, restaurantId: RESTAURANT, branchId: B3 });
  expect(
    contextual.ok && contextual.value.restaurantId === RESTAURANT && contextual.value.branchId === B3,
    "N the 10-key command preserves the durable ids verbatim"
  );
  const restaurantOnly = buildCommand({ ...BASE_COMMAND_INPUT, restaurantId: RESTAURANT });
  expect(
    restaurantOnly.ok && restaurantOnly.value.restaurantId === RESTAURANT && restaurantOnly.value.branchId === null,
    "N a restaurant without a branch still pairs both keys, with a null branchId"
  );
  expect(
    display({ branchId: B3 }) !== contextual.value?.branchId,
    "N the displayed value is a NAME and is never substituted for the id it describes"
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "restaurant-display-mi-e-c5-r7-c2b",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
