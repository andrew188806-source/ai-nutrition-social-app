#!/usr/bin/env node
// SR-2H-B deterministic Mobile smoke. Executes the production repository and controller against a
// local Supabase-shaped client. No network, database, credentials or repository writes.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
const cache = new Map();
const resolveFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
  .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
  });
  const module = { exports: {} }; cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const repositoryModule = load(path.join(root, "apps/mobile/features/social-interest-settings/repository.ts"));
const controllerModule = load(path.join(root, "apps/mobile/features/social-interest-settings/controller.ts"));
const contracts = load(path.join(root, "apps/mobile/features/social-interest-settings/supabaseContracts.ts"));

const catalogRows = [];
const labelRows = [];
function addCatalog(namespace, categoryNumber, optionCount) {
  const categoryKey = `${namespace}.category_${categoryNumber}`;
  catalogRows.push({ tag_key: categoryKey, namespace, parent_key: null, depth: 0, selectable: false, display_order: categoryNumber * 100, active: true });
  labelRows.push({ tag_key: categoryKey, label: `${namespace === "general" ? "一般" : "美食"}分類 ${categoryNumber}` });
  for (let index = 1; index <= optionCount; index += 1) {
    const tagKey = `${categoryKey}.option_${index}`;
    catalogRows.push({ tag_key: tagKey, namespace, parent_key: categoryKey, depth: 1, selectable: true, display_order: categoryNumber * 100 + index, active: true });
    labelRows.push({ tag_key: tagKey, label: `${namespace === "general" ? "一般" : "愛吃"}選項 ${categoryNumber}-${index}` });
  }
}
addCatalog("general", 1, 10);
addCatalog("food", 1, 7);
const generalKeys = catalogRows.filter((row) => row.namespace === "general" && row.depth === 1).map((row) => row.tag_key);
const foodKeys = catalogRows.filter((row) => row.namespace === "food" && row.depth === 1).map((row) => row.tag_key);
let selections = [
  { tag_key: generalKeys[0], namespace: "general" },
  { tag_key: generalKeys[1], namespace: "general" },
  { tag_key: foodKeys[0], namespace: "food" }
];
let currentActor = "viewer-a";
let loadShouldFail = false;
let saveShouldFail = false;
const rpcCalls = [];

class Query {
  constructor(produce) { this.produce = produce; }
  eq() { return this; }
  order() { return this; }
  then(resolve, reject) { return Promise.resolve(this.produce()).then(resolve, reject); }
}
const client = {
  from(table) {
    return {
      select() {
        return new Query(() => {
          if (loadShouldFail) return { data: null, error: { code: "local_failure" } };
          if (table === contracts.SOCIAL_INTEREST_CATALOG_TABLE) return { data: catalogRows, error: null };
          if (table === contracts.SOCIAL_INTEREST_CATALOG_LABEL_TABLE) return { data: labelRows, error: null };
          if (table === contracts.SOCIAL_PROFILE_INTEREST_SELECTION_TABLE) return { data: selections, error: null };
          throw new Error("unexpected table");
        });
      }
    };
  },
  async rpc(name, args) {
    rpcCalls.push({ name, args, actor: currentActor });
    if (saveShouldFail) return { data: null, error: { code: "22023" } };
    selections = [
      ...args.p_general_tag_keys.map((tag_key) => ({ tag_key, namespace: "general" })),
      ...args.p_food_tag_keys.map((tag_key) => ({ tag_key, namespace: "food" }))
    ];
    return { data: { general_tag_keys: [...args.p_general_tag_keys], food_tag_keys: [...args.p_food_tag_keys] }, error: null };
  }
};
const authPort = {
  source: "supabase-live",
  async getCurrentSession() {
    return currentActor
      ? { ok: true, value: { user: { userId: currentActor } } }
      : { ok: true, value: null };
  }
};

const repository = new repositoryModule.SupabaseSocialInterestSettingsRepository(authPort, client);
const controller = new controllerModule.SocialInterestSettingsController(repository);
await controller.setActor(currentActor, 1);
let state = controller.getState();
check("01 current selections load through the production repository", state.phase === "ready" && state.draft.general.length === 2 && state.draft.food.length === 1);
check("02 canonical hierarchy and localized labels load", state.categories.general[0].label === "一般分類 1" && state.categories.food[0].options[0].label === "愛吃選項 1-1");
check("03 raw keys are distinct from every user-facing label", [...labelRows].every((row) => !row.label.includes(row.tag_key)));

for (const tagKey of generalKeys.slice(2, 8)) controller.toggle("general", tagKey);
state = controller.getState();
check("04 exactly eight general interests are selectable", state.draft.general.length === 8);
check("05 local ninth general selection is blocked", controller.toggle("general", generalKeys[8]) === false && controller.getState().limitError === "general" && controller.getState().draft.general.length === 8);
for (const tagKey of foodKeys.slice(1, 5)) controller.toggle("food", tagKey);
state = controller.getState();
check("06 exactly five food interests are selectable", state.draft.food.length === 5);
check("07 local sixth food selection is blocked", controller.toggle("food", foodKeys[5]) === false && controller.getState().limitError === "food" && controller.getState().draft.food.length === 5);

check("08 dirty settings save succeeds only after the combined RPC", await controller.save() && controller.getState().phase === "saved");
check("09 one Save issues exactly one combined authority call", rpcCalls.length === 1 && rpcCalls[0].name === contracts.REPLACE_SOCIAL_INTEREST_SETTINGS_RPC);
check("10 the one call carries complete general and food sets together", rpcCalls[0].args.p_general_tag_keys.length === 8 && rpcCalls[0].args.p_food_tag_keys.length === 5 && !Object.keys(rpcCalls[0].args).some((key) => /user|actor|owner/i.test(key)));

controller.toggle("general", generalKeys[7]);
saveShouldFail = true;
check("11 save failure never becomes success", !(await controller.save()) && controller.getState().phase === "save_failed" && controller.getState().dirty);
saveShouldFail = false;
check("12 save retry reuses the complete draft and succeeds", await controller.save() && controller.getState().phase === "saved" && rpcCalls.length === 3);

for (const namespace of ["general", "food"]) {
  for (const tagKey of [...controller.getState().draft[namespace]]) controller.toggle(namespace, tagKey);
}
check("13 empty general plus empty food saves as one atomic clear", await controller.save() && rpcCalls.at(-1).args.p_general_tag_keys.length === 0 && rpcCalls.at(-1).args.p_food_tag_keys.length === 0);
const callsAfterClear = rpcCalls.length;
check("14 repeated identical Save is safe and does not invent another mutation", await controller.save() && rpcCalls.length === callsAfterClear);

loadShouldFail = true;
const retryController = new controllerModule.SocialInterestSettingsController(repository);
await retryController.setActor(currentActor, 1);
check("15 load failure is explicit and non-success", retryController.getState().phase === "load_failed");
loadShouldFail = false;
await retryController.load();
check("16 load retry reaches a valid empty state", retryController.getState().phase === "ready" && retryController.getState().draft.general.length === 0 && retryController.getState().draft.food.length === 0);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const loadA = deferred(); const loadB = deferred(); const saveA = deferred();
let staleLoadCount = 0;
const staleRepository = {
  source: "supabase-live",
  load() { staleLoadCount += 1; return staleLoadCount === 1 ? loadA.promise : loadB.promise; },
  save() { return saveA.promise; }
};
const staleController = new controllerModule.SocialInterestSettingsController(staleRepository);
const setA = staleController.setActor("viewer-a", 10);
const setB = staleController.setActor("viewer-b", 11);
loadB.resolve({ ok: true, value: snapshot([generalKeys[1]], [foodKeys[1]]) });
await setB;
loadA.resolve({ ok: true, value: snapshot([generalKeys[0]], [foodKeys[0]]) });
await setA;
check("17 stale viewer A load cannot populate viewer B state", staleController.getState().draft.general[0] === generalKeys[1] && staleController.getState().draft.food[0] === foodKeys[1]);

staleController.toggle("general", generalKeys[2]);
const pendingSaveA = staleController.save();
const loadC = deferred(); staleRepository.load = () => loadC.promise;
const setC = staleController.setActor("viewer-c", 12);
loadC.resolve({ ok: true, value: snapshot([], []) });
await setC;
saveA.resolve({ ok: true, value: { generalTagKeys: [generalKeys[1], generalKeys[2]], foodTagKeys: [foodKeys[1]] } });
await pendingSaveA;
check("18 actor generation change prevents stale save success in the new viewer UI", staleController.getState().phase === "ready" && staleController.getState().draft.general.length === 0);

currentActor = null;
const signedOut = new controllerModule.SocialInterestSettingsController(repository);
await signedOut.setActor(null, 2);
check("19 sign-out has no load or save success state", signedOut.getState().phase === "signed_out");

const route = fs.readFileSync(path.join(root, "apps/mobile/app/social-interest-settings.tsx"), "utf8");
check("20 route renders catalog labels and never renders tagKey text", route.includes("category.label") && route.includes("option.label") && !/<Text[^>]*>[^<]*tagKey/.test(route));
check("21 one shared page contains both sections and one Save control", (route.match(/<PrimaryButton/g) ?? []).length === 2 && route.includes('namespace="general"') && route.includes('namespace="food"'));

function snapshot(general, food) {
  const generalOptions = generalKeys.map((tagKey, index) => Object.freeze({ tagKey, label: `一般 ${index}`, namespace: "general", active: true, selectable: true, displayOrder: index }));
  const foodOptions = foodKeys.map((tagKey, index) => Object.freeze({ tagKey, label: `愛吃 ${index}`, namespace: "food", active: true, selectable: true, displayOrder: index }));
  return Object.freeze({
    categories: Object.freeze({
      general: Object.freeze([{ tagKey: "general.category", label: "一般分類", namespace: "general", displayOrder: 0, options: Object.freeze(generalOptions) }]),
      food: Object.freeze([{ tagKey: "food.category", label: "美食分類", namespace: "food", displayOrder: 0, options: Object.freeze(foodOptions) }])
    }),
    selected: Object.freeze({ general: Object.freeze(general), food: Object.freeze(food) })
  });
}

console.log(JSON.stringify({ suite: "social-interest-sr2h-b-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, rpcCalls: rpcCalls.length, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
