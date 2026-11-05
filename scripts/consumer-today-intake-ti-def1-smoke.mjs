#!/usr/bin/env node
// TI-DEF-1 smoke: Today Intake shows recorded nutrition truthfully. Real repository TypeScript runs end to end:
// ConsumerTodayIntakeOverviewService (with the canonical daily calculator) -> todayIntakeUiModel -> nutritionSummary detail items ->
// the two real React components (TodayNutritionSummaryCard, NutritionDetailReport) rendered with react-dom/server on react-native-web.
// Only platform leaves are stubbed (SVG drawing, gradient, async storage, image assets). Local only: no network, no project, no writes.
// Same transpile-only approach as scripts/gqa6r-ts-loader.mjs, plus automatic JSX and image assets (theme/components requires mascot PNGs at load).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };

const requireFromRoot = createRequire(path.join(root, "package.json"));
const requireFromMobile = createRequire(path.join(root, "apps/mobile/package.json"));
const ts = requireFromRoot("typescript");
const React = requireFromMobile("react");
const { renderToStaticMarkup } = requireFromMobile("react-dom/server");
const nullComponent = () => null;
const svgStub = new Proxy({ __esModule: true }, { get: (target, key) => (key in target ? target[key] : nullComponent) });
const stubs = {
  react: React,
  "react/jsx-runtime": requireFromMobile("react/jsx-runtime"),
  "react-native": requireFromMobile("react-native-web"),
  "react-native-svg": svgStub,
  "expo-linear-gradient": { LinearGradient: ({ children }) => React.createElement(React.Fragment, null, children) },
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }
};
// Workspace packages resolve to their TypeScript sources (packages/<dir>/src), keyed by each package.json name.
const workspaces = new Map(fs.readdirSync(path.join(root, "packages"), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(root, "packages", d.name, "package.json")))
  .map((d) => [JSON.parse(fs.readFileSync(path.join(root, "packages", d.name, "package.json"), "utf8")).name, path.join(root, "packages", d.name, "src")]));
const isImage = (file) => /\.(png|jpe?g|gif|webp)$/i.test(file);
const cache = new Map();
function load(relative) {
  const resolved = path.resolve(root, relative);
  if (cache.has(resolved)) return cache.get(resolved);
  const { outputText } = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: relative
  });
  const module = { exports: {} };
  cache.set(resolved, module.exports);
  const fromFile = (base) => {
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), ...(/\.(ts|tsx)$/.test(base) ? [base] : [])]) {
      if (fs.existsSync(candidate)) return load(path.relative(root, candidate));
    }
    return undefined;
  };
  const localRequire = (id) => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (!id.startsWith(".")) {
      const owner = [...workspaces.keys()].find((name) => id === name || id.startsWith(`${name}/`));
      if (owner) { const found = fromFile(path.join(workspaces.get(owner), id.slice(owner.length + 1))); if (found !== undefined) return found; }
      try { return requireFromRoot(id); } catch { return requireFromMobile(id); }
    }
    const base = path.resolve(path.dirname(resolved), id);
    if (isImage(base)) return { uri: path.relative(root, base) };
    const found = fromFile(base);
    if (found !== undefined) return found;
    throw new Error(`unresolved ${id} from ${relative}`);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  cache.set(resolved, module.exports);
  return module.exports;
}

const auth = load("apps/mobile/features/consumer-auth/types.ts");
const { ConsumerTodayIntakeOverviewService } = load("apps/mobile/features/consumer-meals/consumerTodayIntakeOverviewService.ts");
const { ConsumerMealRecordsService } = load("apps/mobile/features/consumer-meals/consumerMealRecordsService.ts");
const { ConsumerDailyNutritionSummaryService } = load("apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryService.ts");
const ui = load("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts");
const summaryModule = load("apps/mobile/features/analysis/nutritionSummary.ts");
const { TodayNutritionSummaryCard } = load("apps/mobile/components/TodayNutritionSummaryCard.tsx");
const { NutritionDetailReport } = load("apps/mobile/components/NutritionDetailReport.tsx");
const { zhTW } = load("lib/i18n/zh-TW.ts");
const tn = zhTW.mobile.todayNutritionSummary;
const copy = summaryModule.todayNutritionTruthCopy ?? {};

const DATE = "2026-11-03";
const at = "2026-11-03T03:00:00.000Z";
const item = (id, nutrition, consumedRatio = 1) => ({
  mealRecordItemId: id, displayName: id, nutrition, nutritionSource: "manual", nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
  occurredAt: at, timezone: "Asia/Taipei", consumedRatio, correctionStatus: "none", createdAt: at, updatedAt: at
});
const meal = (id, items, mealType = "lunch") => ({ mealRecordId: id, mealType, occurredAt: at, mealDate: DATE, timezone: "Asia/Taipei", source: "manual", createdAt: at, updatedAt: at, items });
// Sanitized HOSTED-1D fixtures (values only): W1 舒肥雞胸藜麥碗 520/42/48/14/8 and W2 [HOSTED-1D TEST] 100/5/12/3/2.
const W1 = meal("w1", [item("w1-i", { calories: 520, protein: 42, carbohydrates: 48, fat: 14, fiber: 8 })]);
const W2 = meal("w2", [item("w2-i", { calories: 100, protein: 5, carbohydrates: 12, fat: 3, fiber: 2 })], "snack");

function service({ meals = [], stored = "not_found", planned = null, mealError = null, source = "supabase-live" }) {
  const storedRepo = stored === "not_found" ? async () => auth.err({ code: "daily_summary_not_found" })
    : stored === "unavailable" ? async () => auth.err({ code: "daily_summary_source_unavailable" })
    : async () => auth.ok(stored);
  return new ConsumerTodayIntakeOverviewService({
    mealRecordsService: new ConsumerMealRecordsService({ repository: { source, listCurrentUserMealRecords: async () => mealError ? auth.err(mealError) : auth.ok(meals) } }),
    dailyNutritionSummaryService: new ConsumerDailyNutritionSummaryService({ repository: { source, getCurrentUserDailyNutritionSummary: storedRepo } }),
    ...(planned ? { plannedMealsRepository: { listCurrentUserPlannedMeals: async () => planned } } : {}),
    clock: { now: () => new Date(at) },
    mealRecordsSource: source,
    dailyNutritionSource: source,
    timezone: "Asia/Taipei"
  });
}
const modelOf = (opts) => ui.getCurrentUserTodayIntakeUiModel({ date: DATE, overviewService: service(opts) });
const items = (summary) => Object.fromEntries(summaryModule.getNutritionDetailItems(summary).map((i) => [i.key, i]));
const text = (html) => html.replace(/<[^>]+>/g, "\n").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").split("\n").map((s) => s.trim()).filter(Boolean).join(" | ");
const renderCard = (summary) => text(renderToStaticMarkup(React.createElement(TodayNutritionSummaryCard, { summary, onViewDetail: () => undefined })));
const renderReport = (summary) => text(renderToStaticMarkup(React.createElement(NutritionDetailReport, { summary })));
const verdictWords = [tn.vegetableGood, tn.vegetableLow, tn.reminders.lowVegetable, "攝取充足", "攝取不足"];
const rendered = {};

// T1 W1 alone: recorded fiber 8 g, no "約 4 g", no vegetable verdict.
{
  const m = await modelOf({ meals: [W1] });
  const s = m.summary, d = items(s), card = renderCard(s), report = renderReport(s);
  rendered.T1 = { card, report };
  check("T1 W1 totals are the canonical recorded values 520/42/48/14 and fiber 8", s.totals.calories === 520 && s.totals.protein === 42 && s.totals.carbs === 48 && s.totals.fat === 14 && s.recorded?.fiber === 8, { totals: s.totals, recorded: s.recorded });
  check("T1 detail fiber reads the recorded 8 g (not the per-meal 4 g heuristic)", d.fiber.value === "8 g" && !/約/.test(report), d.fiber);
  check("T1 rendered report shows 8 g fiber and the vegetable no-verdict text", report.includes("纖維 | 8 g") && report.includes("蔬菜 | 尚無足夠蔬菜紀錄可判斷"), report);
  check("T1 rendered card makes no vegetable verdict and no lowVegetable reminder", card.includes(copy.vegetableUnknown) && !verdictWords.slice(0, 3).some((w) => card.includes(w)) && !s.reminders.some((r) => r.key === "lowVegetable"), card);
  check("T1 sodium and added sugar (never recorded) get no normal / high verdict", d.sodium.value === copy.notEnoughData && d.addedSugar.value === copy.notEnoughData && !/(鈉|添加糖) \| (目前正常|可能偏高)/.test(report), { sodium: d.sodium, addedSugar: d.addedSugar });
  check("T1 with every macro recorded neither component claims estimated macros", !card.includes(tn.estimatedNote) && !report.includes(tn.estimatedNote) && s.dataQuality === "complete", { card, report });
}

// T2 W1+W2 same day: 620/47/60/17/10, two meals, no double count, not mealCount x 4.
{
  const s = (await modelOf({ meals: [W1, W2] })).summary, d = items(s), report = renderReport(s), card = renderCard(s);
  rendered.T2 = { card, report };
  check("T2 W1+W2 totals 620/47/60/17 and fiber 10 with mealCount 2", s.totals.calories === 620 && s.totals.protein === 47 && s.totals.carbs === 60 && s.totals.fat === 17 && s.recorded?.fiber === 10 && s.mealCount === 2, { totals: s.totals, fiber: s.recorded?.fiber });
  check("T2 fiber is 10 g, not the 2 meals x 4 = 8 g heuristic", d.fiber.value === "10 g" && !report.includes("8 g"), d.fiber);
  check("T2 card ring and macro bars show 620 / 47 / 60 / 17", card.includes("620") && card.includes("47g") && card.includes("60g") && card.includes("17g"), card);
}

// T3 a valid fiber 0 is a true 0, not missing, and no vegetable shortfall follows from it.
{
  const s = (await modelOf({ meals: [meal("m3", [item("i3", { calories: 300, protein: 20, carbohydrates: 30, fat: 10, fiber: 0 })])] })).summary;
  const d = items(s), report = renderReport(s), card = renderCard(s);
  check("T3 fiber 0 recorded reads 0 g with complete coverage", d.fiber.value === "0 g" && s.recorded?.fiber === 0 && s.recorded?.coverage?.fiber?.status === "complete", { fiber: d.fiber, cov: s.recorded?.coverage.fiber });
  check("T3 fiber 0 gives no vegetable verdict and no lowVegetable reminder", !s.reminders.some((r) => r.key === "lowVegetable") && !card.includes(tn.vegetableLow) && report.includes("尚無足夠蔬菜紀錄可判斷"), { card, reminders: s.reminders });
}

// T4 fiber missing everywhere -> not provided (never 0 or an estimate); all five missing -> no number and no verdict at all.
{
  const s = (await modelOf({ meals: [meal("m4", [item("i4", { calories: 400, protein: 25, carbohydrates: 50, fat: 12 })])] })).summary;
  const d = items(s), report = renderReport(s);
  check("T4 all fiber missing -> 未提供纖維資料, fiber null, no 0 g and no 約", d.fiber.value === "未提供纖維資料" && s.recorded?.fiber === null && !/纖維 \| 0 g|約/.test(report), { fiber: d.fiber, report });
  const z = (await modelOf({ meals: [meal("m4b", [item("i4b", {})])] })).summary;
  const dz = items(z), cz = renderCard(z), rz = renderReport(z);
  rendered.T4 = { card: cz, report: rz };
  check("T4 all five missing -> each nutrient reads not provided, none as a number", ["calories", "protein", "carbs", "fat", "fiber"].every((k) => /^未提供.+資料$/.test(dz[k].value)), Object.fromEntries(Object.entries(dz).map(([k, v]) => [k, v.value])));
  check("T4 all five missing -> no adequacy or normal verdict built on the unknown values", dz.proteinFoods.value === "資料不足，暫不判斷" && dz.saturatedFat.value === "未提供飽和脂肪資料" && dz.grains.value === "資料不足，暫不判斷" && !Object.values(dz).some((i) => /目前正常|可能偏高|攝取充足|攝取不足|已包含於今日餐點/.test(i.value)) && !z.reminders.some((r) => r.key === "lowProtein"), { proteinFoods: dz.proteinFoods, saturatedFat: dz.saturatedFat, grains: dz.grains, reminders: z.reminders });
  check("T4 all five missing -> card shows 未提供 for calories and macros and no remaining-calorie claim", cz.includes(copy.notProvidedShort) && !cz.includes("0g") && cz.includes(copy.remainingUnknown) && !cz.includes(tn.remainingPrefix), cz);
}

// T5 fiber 8 plus an item without fiber -> recorded subtotal 8 and partial disclosure, never a complete total.
{
  const s = (await modelOf({ meals: [W1, meal("m5", [item("i5", { calories: 200, protein: 10, carbohydrates: 20, fat: 5 })], "dinner")] })).summary;
  const d = items(s), report = renderReport(s), card = renderCard(s);
  rendered.T5 = { card, report };
  check("T5 partial fiber -> 已記錄小計 8 g（部分餐點未提供） with coverage 1 valid / 1 missing", d.fiber.value === "已記錄小計 8 g（部分餐點未提供）" && s.recorded?.coverage?.fiber?.validItems === 1 && s.recorded?.coverage?.fiber?.missingItems === 1, { fiber: d.fiber, cov: s.recorded?.coverage.fiber });
  check("T5 both components disclose the partial data", report.includes(copy.partialNote) && card.includes(copy.partialNote), { card, report });
}

// T6 five complete values but auxiliary reads unavailable / mismatching -> values stay, read warning shown, never "estimated macros".
{
  const variants = {
    storedUnavailable: { meals: [W1], stored: "unavailable" },
    plannedError: { meals: [W1], stored: "not_found", planned: auth.err({ code: "planned_read_failed" }) },
    parityMismatch: { meals: [W1], stored: { summaryDate: DATE, timezone: "Asia/Taipei", calculationVersion: "consumer-daily-summary-v1", calories: 999, protein: 1, carbohydrates: 1, fat: 1, fiber: 1, mealCount: 1, itemCount: 1, itemCountAvailable: true, sourceCutoffAt: at, recalculatedAt: at, isCurrent: true, provenance: "stored", calculationStatus: "current" } }
  };
  for (const [name, opts] of Object.entries(variants)) {
    const m = await modelOf(opts), s = m.summary, d = items(s), report = renderReport(s), card = renderCard(s);
    if (name === "parityMismatch") rendered.T6 = { card, report };
    check(`T6 ${name}: recorded values unchanged, read warning shown, no estimated-macro or partial claim`,
      m.overview.status === "partial" && s.recorded?.readWarning && d.protein.value === "42 / 105 g" && d.fiber.value === "8 g" && report.includes(copy.readWarningNote) && card.includes(copy.readWarningNote) && !report.includes(tn.estimatedNote) && !report.includes(copy.partialNote),
      { status: m.overview.status, warnings: m.overview.warnings, protein: d.protein.value, report });
  }
}

// T7 zero meals, planned-only, read error, live without the shared composition: each state separate, no intake or vegetable claim, no demo.
{
  const zero = (await modelOf({ meals: [] })).summary, cz = renderCard(zero), rz = renderReport(zero), dz = items(zero);
  check("T7 zero meals -> no vegetable claim, verdicts read 今日尚未記錄, no partial/estimated note",
    cz.includes("今天還沒有飲食紀錄。") && !verdictWords.some((w) => cz.includes(w)) && ["fiber", "vegetables", "proteinFoods"].every((k) => dz[k].value === "今日尚未記錄") && !rz.includes(copy.partialNote) && !rz.includes(tn.estimatedNote) && zero.reminders.length === 0, { cz, dz: Object.fromEntries(Object.entries(dz).map(([k, v]) => [k, v.value])) });
  const planned = auth.ok([{ plannedMealId: "p1", date: DATE, mealTime: "19:00", title: "預定晚餐", estimatedNutrition: { calories: 700, protein: 30, carbohydrates: 80, fat: 20 } }]);
  const pm = await modelOf({ meals: [], planned });
  check("T7 planned-only -> planned kcal stays out of actual totals, mealCount 0, no vegetable verdict",
    pm.summary.totals.calories === 0 && pm.summary.mealCount === 0 && pm.plannedMeals.length === 1 && renderCard(pm.summary).includes("今天還沒有飲食紀錄。"), { totals: pm.summary.totals, planned: pm.plannedMeals.length });
  let readError = null; try { await modelOf({ mealError: { code: "meal_transport_failed" } }); } catch (e) { readError = e; }
  check("T7 a meal read error throws (screen error state), no model and no fallback numbers", readError !== null, String(readError));
  const flags = load("apps/mobile/features/consumer-meals/featureFlags.ts");
  const saved = { ...process.env };
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE = "supabase-live";
  let liveError = null; try { await ui.getCurrentUserTodayIntakeUiModel({ date: DATE }); } catch (e) { liveError = e; }
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  check("T7 live meal source without the shared composition refuses instead of falling back to demo data",
    liveError instanceof Error && /requires the shared Consumer Runtime composition/.test(liveError.message) && typeof flags.getConsumerMealRuntimeFlags === "function", String(liveError));
}

// T8 consumed ratio applied once by the calculator; true-zero macros; invalid values are explicit errors, never a fake 0.
{
  const s = (await modelOf({ meals: [meal("m8", [item("half", { calories: 400, protein: 20, carbohydrates: 40, fat: 10, fiber: 6 }, 0.5), item("none", { calories: 300, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 }, 0), item("full", { calories: 100, protein: 0, carbohydrates: 10, fat: 0, fiber: 2 }, 1)])] })).summary;
  check("T8 ratios 0.5 / 0 / 1 -> 300 kcal, 10 g protein, 30 g carbs, 5 g fat, 5 g fiber (applied once)", s.totals.calories === 300 && s.totals.protein === 10 && s.totals.carbs === 30 && s.totals.fat === 5 && s.recorded?.fiber === 5 && s.recorded?.coverage?.protein?.status === "complete", { totals: s.totals, fiber: s.recorded?.fiber });
  for (const [name, bad] of Object.entries({ negative: -1, nan: Number.NaN })) {
    let error = null; try { await modelOf({ meals: [meal("bad", [item("bad-i", { calories: 100, protein: bad })])] }); } catch (e) { error = e; }
    check(`T8 invalid ${name} protein -> explicit error, no summary`, error !== null, String(error));
  }
  const overview = (await service({ meals: [W1] }).getCurrentUserTodayIntakeOverview({ date: DATE })).value;
  const forged = { ...overview, meals: [{ ...overview.meals[0], items: [{ ...overview.meals[0].items[0], nutrition: { ...overview.meals[0].items[0].nutrition, fiber: "8" } }] }] };
  let mapError = null; try { await ui.getCurrentUserTodayIntakeUiModel({ date: DATE, overviewService: { getCurrentUserTodayIntakeOverview: async () => auth.ok(forged) } }); } catch (e) { mapError = e; }
  check("T8 an invalid value that bypasses the calculator still fails explicitly in the model (no silent 0)", mapError instanceof Error && /invalid value/.test(mapError.message), String(mapError));
}

// T9 actor / generation: the model function holds no state across actors, and the hook's actor/generation contract is byte-unchanged.
{
  const a = (await modelOf({ meals: [W1, W2] })).summary, b = (await modelOf({ meals: [] })).summary;
  check("T9 actor B after actor A sees only B (no A values, no A coverage)", b.mealCount === 0 && b.totals.calories === 0 && b.recorded?.fiber === null && b.recorded?.coverage?.fiber?.status === "none" && a.totals.calories === 620, { a: a.totals, b: b.totals });
  // The base is the TI record's own main identity (AUTH-RECOVERY), not HEAD^: a later TI commit must still compare with that base.
  const { pathToFileURL } = await import("node:url");
  const base = process.env.TI_DEF1_BASE_COMMIT ?? (await import(pathToFileURL(path.join(root, "scripts/consumer-today-intake-ti-def1-exact-successor.mjs")).href)).TI_BASE_COMMIT;
  const hook = (src) => src.slice(src.indexOf("export function useTodayIntakeUiModel"), src.indexOf("export function getUiMealCalories"));
  const before = hook(execFileSync("git", ["show", `${base}:apps/mobile/features/consumer-meals/todayIntakeUiModel.ts`], { cwd: root, encoding: "utf8" }));
  const now = hook(fs.readFileSync(path.join(root, "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts"), "utf8"));
  check("T9 useTodayIntakeUiModel (actorKey/actorGeneration reset, cancellation, timeout) is byte-identical to the base", before.length > 500 && before === now, { base, beforeLength: before.length, nowLength: now.length });
}

// T10 legacy/demo heuristics only under an explicit estimated basis, labelled as an estimate; recorded data never degrades to them.
{
  const legacy = summaryModule.calculateTodayNutritionSummary([{ id: "x", mealName: "便當", ingredients: "青菜、雞腿", calories: 600, protein: 0, carbohydrates: 0, fat: 0, mealPeriod: "午餐" }]);
  const dl = items(legacy);
  check("T10 the legacy summary declares basis estimated and labels its fiber as an estimate", legacy.nutritionBasis === "estimated" && dl.fiber.value.startsWith("估算約 "), dl.fiber);
  for (const [name, s] of Object.entries({ T1: (await modelOf({ meals: [W1] })).summary, T4: (await modelOf({ meals: [meal("m10", [item("i10", {})])] })).summary, demoSource: (await modelOf({ meals: [W1], source: "mock" })).summary })) {
    const report = renderReport(s);
    check(`T10 recorded ${name} never shows an estimate (no 估算 / 約) and keeps basis recorded`, s.nutritionBasis === "recorded" && !/估算|約 /.test(report), report);
  }
}

// Semantic guards kept from GQA-6R C-2 (zero meals) for the recorded shape as well.
{
  const zero = { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 1800, protein: 105, carbs: 180, fat: 55 }, hasVegetable: false, mealCount: 0, proteinProgress: 0, fatProgress: 0 };
  const legacyZero = items(zero);
  check("C2-16c kept: legacy-shaped zero meals -> verdicts read 今日尚未記錄", ["fiber", "vegetables", "proteinFoods", "sodium", "addedSugar", "saturatedFat"].every((k) => legacyZero[k].value === "今日尚未記錄"));
  const one = items({ ...zero, mealCount: 1, totals: { ...zero.totals, calories: 500, protein: 20, carbs: 60 }, proteinProgress: 0.2 });
  check("C2-16d kept: legacy-shaped one meal keeps its evidence-based verdicts", one.proteinFoods.value === "攝取不足" && one.sodium.value === "目前正常");
}

// X TI-A01 / TI-A02 counterexamples: recorded items carry no saturated fat and no ingredient or food-group data, so neither a fat
// amount nor a carbohydrate (or protein) amount may become a saturated-fat, grains or protein-food verdict, in the presenter or in
// either rendered component. The recorded numbers themselves (fat 14 / 100 g, carbohydrates 100 g) must still show.
{
  const unsupported = /目前正常|可能偏高|攝取充足|攝取不足|已包含於今日餐點/;
  const cases = {
    X1_fat14_noSaturatedFat: { nutrition: { calories: 520, protein: 42, carbohydrates: 48, fat: 14, fiber: 8 }, fatRow: "14 / 55 g" },
    X2_fat100_noSaturatedFat: { nutrition: { calories: 1200, protein: 40, carbohydrates: 60, fat: 100, fiber: 5 }, fatRow: "100 / 55 g" },
    X3_carbs100_noFoodGroup: { nutrition: { calories: 450, protein: 5, carbohydrates: 100, fat: 2, fiber: 1 }, carbsRow: "100 / 180 g" }
  };
  for (const [name, x] of Object.entries(cases)) {
    const s = (await modelOf({ meals: [meal(name, [item(`${name}-item`, x.nutrition)])] })).summary;
    const d = items(s), report = renderReport(s), card = renderCard(s);
    rendered[name] = { card, report };
    check(`${name}: saturated fat reads not provided (no normal / high, status not good)`,
      d.saturatedFat?.value === "未提供飽和脂肪資料" && d.saturatedFat?.status === "watch" && report.includes("飽和脂肪 | 未提供飽和脂肪資料"), d.saturatedFat);
    check(`${name}: grains and protein foods read not enough data (no inclusion / sufficiency verdict, status not good)`,
      d.grains?.value === copy.notEnoughData && d.grains?.status === "watch" && d.proteinFoods?.value === copy.notEnoughData && d.proteinFoods?.status === "watch"
        && report.includes(`全穀 / 主食 | ${copy.notEnoughData}`) && report.includes(`蛋白質食物 | ${copy.notEnoughData}`), { grains: d.grains, proteinFoods: d.proteinFoods });
    check(`${name}: neither rendered component carries an unsupported verdict`, !unsupported.test(report) && !unsupported.test(card), { report, card });
    check(`${name}: the recorded amounts still show (fat / carbohydrates rows unchanged)`,
      (x.fatRow ? d.fat?.value === x.fatRow : true) && (x.carbsRow ? d.carbs?.value === x.carbsRow : true) && d.fiber?.value === `${x.nutrition.fiber} g`, { fat: d.fat, carbs: d.carbs, fiber: d.fiber });
  }
}

// F01 the TI exact successor record and tamper controls (git reads only; the root smoke's own judgement runs, nothing on disk changes).
{
  const { pathToFileURL } = await import("node:url");
  const P = await import(pathToFileURL(path.join(root, "scripts/consumer-retention-persistence-smoke.mjs")).href);
  const T = await import(pathToFileURL(path.join(root, "scripts/consumer-today-intake-ti-def1-exact-successor.mjs")).href);
  const rootGit = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64e6, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  const lying = ({ stage = {}, hash = {} }) => (args) => {
    const out = rootGit(args);
    if (args[0] === "ls-files" && args.includes("--stage")) return out.split("\n").map((line) => { const name = line.slice(line.indexOf("\t") + 1); return name in stage ? (stage[name] === null ? "" : `100644 ${stage[name]} 0\t${name}`) : line; }).filter(Boolean).join("\n") + "\n";
    if (args[0] === "hash-object" && args.includes("--")) { const names = args.slice(args.indexOf("--") + 1), lines = out.trim().split("\n"); return names.map((n, i) => (n in hash ? hash[n] : lines[i])).join("\n") + "\n"; }
    return out;
  };
  const leaf = "apps/mobile/features/analysis/nutritionSummary.ts", fake = "0".repeat(40);
  const atBase = Object.fromEntries(Object.entries(T.TI_FILES).map(([p, f]) => [p, f.base]));
  const exact = { ti: P.checkedTiState(rootGit).state, chain: P.recoverySuccessorState(rootGit), act2: P.checkedAct2State(rootGit).state };
  check("F01 exact TI record -> ti record and the complete older chain (auth, r1a, entw1, ph1, edge, act2, billing) on the TI view",
    exact.ti === "record" && exact.chain.ti === "record" && exact.chain.exempt && ["auth", "r1a", "entw1", "ph1", "edge", "act2", "billing"].every((k) => exact.chain[k] === "record") && exact.act2 === "record",
    { ti: exact.ti, chain: { state: exact.chain.state, ti: exact.chain.ti, auth: exact.chain.auth, violations: exact.chain.violations } });
  const cases = {
    leafWorktreeTamper: { hash: { [leaf]: fake } },
    leafIndexTamper: { stage: { [leaf]: fake } },
    moduleBindingTamper: { hash: { [P.TI_MODULE_PATH]: fake } },
    newLeafRemovedFromIndex: { stage: { "scripts/consumer-today-intake-ti-def1-smoke.mjs": null } }
  };
  const observed = {};
  for (const [name, c] of Object.entries(cases)) { const g = lying(c); observed[name] = { ti: P.checkedTiState(g).state, chain: P.recoverySuccessorState(g).state, act2: P.checkedAct2State(g).state, auth: P.checkedAuthState(g).state }; }
  check("F01 any TI leaf or module mismatch -> ti, chain, act2 and auth all invalid (no partial TI state is accepted)", Object.values(observed).every((o) => o.ti === "invalid" && o.chain === "invalid" && o.act2 === "invalid" && o.auth === "invalid"), observed);
  // The predecessor view presents every existing TI leaf at its recorded AUTH-main blob and hides the new leaves from the index.
  const view = T.tiPredecessorGit(rootGit), staged = view(["ls-files", "--stage", "--", ...Object.keys(T.TI_FILES)]);
  check("F01 the TI predecessor view shows each changed leaf at its AUTH-main blob and no new leaf",
    Object.entries(T.TI_FILES).every(([p, f]) => f.base ? staged.includes(`${f.baseMode} ${f.base} 0\t${p}`) : !staged.includes(`\t${p}`)) && Object.values(atBase).some((v) => v === null), staged);
}

const out = process.env.TI_DEF1_RENDER_OUT;
if (out) fs.writeFileSync(out, JSON.stringify(rendered, null, 1));
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", phase: "TI-DEF-1 Today Intake recorded nutrition", checks, networkUsed: false, databaseUsed: false }, null, 2));
process.exitCode = failed.length ? 1 : 0;
