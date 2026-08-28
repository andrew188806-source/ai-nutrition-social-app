#!/usr/bin/env node
// REC-C-P1 deterministic production repository/controller smoke. No network or database.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd(); const require_ = createRequire(import.meta.url); const ts = require_("typescript");
const checks = []; const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
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

const feature = path.join(root, "apps/mobile/features/consumer-allergy-settings");
const { SupabaseConsumerAllergySettingsRepository } = load(path.join(feature, "repository.ts"));
const { ConsumerAllergySettingsController } = load(path.join(feature, "controller.ts"));
const contracts = load(path.join(feature, "supabaseContracts.ts"));

let actor = "user-a"; let selected = ["peanut"]; let unresolved = 0; let loadFails = false; let saveFails = false;
const calls = [];
const response = () => ({
  source_vocabulary_id: "private-restriction-allergen-v1",
  source_vocabulary_version: 1,
  taxonomy_id: "tastkind-allergen-tw-v1",
  taxonomy_version: 1,
  allergen_keys: [...selected],
  unresolved_selection_count: unresolved
});
const client = {
  async rpc(name, args = {}) {
    calls.push({ name, args, actor });
    if (name === contracts.READ_CURRENT_USER_ALLERGY_SETTINGS_RPC) {
      return loadFails ? { data: null, error: { code: "local" } } : { data: response(), error: null };
    }
    if (name === contracts.REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC) {
      if (saveFails) return { data: null, error: { code: "22023" } };
      selected = [...args.p_source_value_keys]; unresolved = 0;
      return { data: response(), error: null };
    }
    throw new Error("unexpected RPC");
  }
};
const authPort = { source: "supabase-live", async getCurrentSession() {
  return { ok: true, value: actor ? { user: { userId: actor } } : null };
} };

const repository = new SupabaseConsumerAllergySettingsRepository(authPort, client);
const controller = new ConsumerAllergySettingsController(repository);
await controller.setActor("user-a", 1);
let state = controller.getState();
check("current-user reader loads governed peanut", state.phase === "ready" && state.draft.join() === "peanut");
check("reader exposes exactly eleven frozen options", state.options.length === 11);
check("options preserve exact P0 order", state.options.map((option) => option.key).join(",")
  === "crustacean,mango,peanut,milk,egg,tree_nut,sesame,gluten_containing_cereal,soy,fish,sulfites_ge_10mg_per_kg");
check("canonical zh-TW labels are presentation only", state.options.find((option) => option.key === "peanut")?.label === "花生");
check("load uses the canonical reader RPC and no actor argument", calls[0].name === contracts.READ_CURRENT_USER_ALLERGY_SETTINGS_RPC
  && !Object.keys(calls[0].args).some((key) => /user|actor|owner/i.test(key)));

check("milk selection changes only local draft", controller.toggle("milk") && selected.join() === "peanut");
state = controller.getState();
check("peanut plus milk multi-select is dirty", state.dirty && state.draft.join() === "peanut,milk");
check("save persists stable keys through one writer call", await controller.save());
state = controller.getState();
const saveCall = calls.at(-1);
check("writer call carries only source key array", saveCall.name === contracts.REPLACE_CURRENT_USER_ALLERGY_SETTINGS_RPC
  && Object.keys(saveCall.args).join() === "p_source_value_keys" && saveCall.args.p_source_value_keys.join() === "peanut,milk");
check("save response becomes persisted canonical keys", state.phase === "saved" && state.persisted.join() === "peanut,milk" && !state.dirty);

check("deselecting peanut is explicit", controller.toggle("peanut") && controller.getState().draft.join() === "milk");
check("deselect persists exactly remaining milk", await controller.save() && selected.join() === "milk");
controller.toggle("milk");
check("empty selection is a valid explicit clear", await controller.save() && selected.length === 0);
const callsAfterClear = calls.length;
check("identical save is idempotent and issues no extra writer call", await controller.save() && calls.length === callsAfterClear);

const duplicate = await repository.replaceCurrentUser(["peanut", "peanut"]);
check("duplicate active selection is rejected before transport", !duplicate.ok && duplicate.errorCode === "save_failed" && calls.length === callsAfterClear);
const arbitrary = await repository.replaceCurrentUser(["shellfish"]);
check("arbitrary free text cannot become governed Allergy", !arbitrary.ok && arbitrary.errorCode === "save_failed" && calls.length === callsAfterClear);

selected = ["egg"]; unresolved = 1;
const unresolvedController = new ConsumerAllergySettingsController(repository);
await unresolvedController.setActor("user-a", 2);
check("unresolved governed row remains explicit", unresolvedController.getState().phase === "ready"
  && unresolvedController.getState().unresolvedSelectionCount === 1);

loadFails = true;
const failedController = new ConsumerAllergySettingsController(repository);
await failedController.setActor("user-a", 3);
check("reader failure is not flattened to empty", failedController.getState().phase === "load_failed");
loadFails = false; unresolved = 0;
await failedController.load();
check("load retry restores canonical settings", failedController.getState().phase === "ready" && failedController.getState().draft.join() === "egg");

saveFails = true; failedController.toggle("milk");
check("save failure preserves dirty draft and old server state", !(await failedController.save())
  && failedController.getState().phase === "save_failed" && failedController.getState().dirty && selected.join() === "egg");
saveFails = false;
check("save retry succeeds", await failedController.save() && selected.join() === "milk,egg");

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
const loadA = deferred(); const loadB = deferred(); let count = 0;
const staleRepository = { source: "supabase-live", loadCurrentUser() { return ++count === 1 ? loadA.promise : loadB.promise; }, replaceCurrentUser() { throw new Error("unused"); } };
const staleController = new ConsumerAllergySettingsController(staleRepository);
const first = staleController.setActor("user-a", 10); const second = staleController.setActor("user-b", 11);
loadB.resolve({ ok: true, value: snapshot(["milk"]) }); await second;
loadA.resolve({ ok: true, value: snapshot(["peanut"]) }); await first;
check("actor-generation switch rejects stale user A read", staleController.getState().draft.join() === "milk");

actor = null; const signedOut = new ConsumerAllergySettingsController(repository); await signedOut.setActor(null, 12);
check("signed-out actor has no settings success state", signedOut.getState().phase === "signed_out");

const route = fs.readFileSync(path.join(root, "apps/mobile/app/allergy-settings.tsx"), "utf8");
const tasteReader = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository.ts"), "utf8");
check("UI is checkbox-only and persists no localized label identity", route.includes('accessibilityRole="checkbox"') && !/TextInput|severity/i.test(route));
check("UI shows truthful cross-contact disclaimer and no safety badge", route.includes("copy.disclaimer") && !/safe|allergen.?free|保證安全/i.test(route));
check("Taste foundation excludes governed rows at query time", tasteReader.includes('.is("source_vocabulary_id", null)'));

function snapshot(keys) {
  return Object.freeze({
    options: Object.freeze([
      { key: "peanut", label: "花生" }, { key: "milk", label: "牛奶／羊奶" }, { key: "egg", label: "蛋" }
    ]), selectedAllergenKeys: Object.freeze(keys), unresolvedSelectionCount: 0
  });
}

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-c-p1-smoke", total: checks.length,
  passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), rpcCalls: calls.length,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
