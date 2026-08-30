#!/usr/bin/env node
// REC-D-P1 deterministic production repository/controller smoke. No network or database.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = []; const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(condition || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

const cache = new Map();
const resolveFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
  .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absolute
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

const feature = path.join(root, "apps/mobile/features/consumer-ingredient-avoidance-settings");
const { SupabaseConsumerIngredientAvoidanceSettingsRepository } =
  load(path.join(feature, "repository.ts"));
const { ConsumerIngredientAvoidanceSettingsController } = load(path.join(feature, "controller.ts"));
const contracts = load(path.join(feature, "supabaseContracts.ts"));

let actor = "user-a"; let unresolved = 0; let loadFails = false; let saveFails = false;
const selectedByActor = new Map([["user-a", ["pork"]], ["user-b", ["beef"]]]);
const calls = [];
const response = () => ({
  source_vocabulary_id: "private-ingredient-avoidance-v1",
  source_vocabulary_version: 1,
  taxonomy_id: "tastkind-ingredient-avoidance-v1",
  taxonomy_version: 1,
  ingredient_avoidance_keys: [...(selectedByActor.get(actor) ?? [])],
  unresolved_selection_count: unresolved
});
const client = {
  async rpc(name, args = {}) {
    calls.push({ name, args, actor });
    if (name === contracts.READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC) {
      return loadFails ? { data: null, error: { code: "local" } } : { data: response(), error: null };
    }
    if (name === contracts.REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC) {
      if (saveFails) return { data: null, error: { code: "22023" } };
      selectedByActor.set(actor, [...args.p_source_value_keys]); unresolved = 0;
      return { data: response(), error: null };
    }
    throw new Error("unexpected RPC");
  }
};
const authPort = { source: "supabase-live", async getCurrentSession() {
  return { ok: true, value: actor ? { user: { userId: actor } } : null };
} };

const repository = new SupabaseConsumerIngredientAvoidanceSettingsRepository(authPort, client);
const controller = new ConsumerIngredientAvoidanceSettingsController(repository);
await controller.setActor("user-a", 1);
let state = controller.getState();
check("current-user reader loads governed pork", state.phase === "ready" && state.draft.join() === "pork");
check("reader exposes exactly three frozen options", state.options.length === 3);
check("options preserve exact P0 key order",
  state.options.map((option) => option.key).join() === "pork,beef,coriander");
check("labels are exact presentation only",
  state.options.map((option) => option.label).join() === "豬肉／豬來源成分,牛肉／牛來源成分,香菜");
check("reader RPC carries no actor argument",
  calls[0].name === contracts.READ_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC
    && !Object.keys(calls[0].args).some((key) => /user|actor|owner/i.test(key)));

check("coriander toggle changes only local draft",
  controller.toggle("coriander") && selectedByActor.get("user-a").join() === "pork");
state = controller.getState();
check("pork plus coriander multi-select is dirty", state.dirty && state.draft.join() === "pork,coriander");
check("explicit Save persists through the canonical writer", await controller.save());
const saveCall = calls.at(-1);
check("writer receives only stable source key array",
  saveCall.name === contracts.REPLACE_CURRENT_USER_INGREDIENT_AVOIDANCE_SETTINGS_RPC
    && Object.keys(saveCall.args).join() === "p_source_value_keys"
    && saveCall.args.p_source_value_keys.join() === "pork,coriander");
check("save response becomes persisted canonical keys",
  controller.getState().phase === "saved"
    && controller.getState().persisted.join() === "pork,coriander"
    && !controller.getState().dirty);

check("deselect pork is explicit", controller.toggle("pork")
  && controller.getState().draft.join() === "coriander");
check("deselect persists exactly remaining coriander",
  await controller.save() && selectedByActor.get("user-a").join() === "coriander");
controller.toggle("coriander");
check("empty input clears only the governed REC-D set",
  await controller.save() && selectedByActor.get("user-a").length === 0);

const callsAfterClear = calls.length;
const duplicate = await repository.replaceCurrentUser(["pork", "pork"]);
check("duplicate selection rejects before transport",
  !duplicate.ok && duplicate.errorCode === "save_failed" && calls.length === callsAfterClear);
for (const invalid of [["fish"], ["豬肉／豬來源成分"], ["halal"]]) {
  const result = await repository.replaceCurrentUser(invalid);
  check(`invalid selection ${invalid[0]} rejects before transport`,
    !result.ok && result.errorCode === "save_failed" && calls.length === callsAfterClear);
}

selectedByActor.set("user-a", ["beef"]); unresolved = 1;
const unresolvedController = new ConsumerIngredientAvoidanceSettingsController(repository);
await unresolvedController.setActor("user-a", 2);
check("unresolved governed row stays explicit",
  unresolvedController.getState().phase === "ready"
    && unresolvedController.getState().unresolvedSelectionCount === 1);

loadFails = true;
const failedController = new ConsumerIngredientAvoidanceSettingsController(repository);
await failedController.setActor("user-a", 3);
check("reader failure is not flattened to empty", failedController.getState().phase === "load_failed");
loadFails = false; unresolved = 0;
await failedController.load();
check("load retry restores canonical settings",
  failedController.getState().phase === "ready" && failedController.getState().draft.join() === "beef");

saveFails = true; failedController.toggle("coriander");
check("save failure preserves dirty draft and old server state",
  !(await failedController.save()) && failedController.getState().phase === "save_failed"
    && failedController.getState().dirty && selectedByActor.get("user-a").join() === "beef");
saveFails = false;
check("save retry succeeds", await failedController.save()
  && selectedByActor.get("user-a").join() === "beef,coriander");

actor = "user-b";
const actorB = new ConsumerIngredientAvoidanceSettingsController(repository);
await actorB.setActor("user-b", 4);
check("Actor B reads only Actor B selection",
  actorB.getState().draft.join() === "beef" && selectedByActor.get("user-a").join() === "beef,coriander");

actor = null;
const signedOut = new ConsumerIngredientAvoidanceSettingsController(repository);
await signedOut.setActor(null, 5);
check("signed-out actor has no success state", signedOut.getState().phase === "signed_out");

const route = fs.readFileSync(path.join(root, "apps/mobile/app/ingredient-avoidance-settings.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260902010000_user_ingredient_avoidance_setting_authority.sql"), "utf8");
check("UI is checkbox-only with explicit Save and no free-text/reason/severity picker",
  route.includes('accessibilityRole="checkbox"') && route.includes("controller.save()")
    && !/TextInput|reasonPicker|religionPicker|severity/i.test(route));
check("UI surfaces unresolved and never fakes success after failure",
  route.includes("state.unresolvedSelectionCount > 0")
    && route.includes('state.phase === "save_failed"') && route.includes('state.phase === "saved"'));
check("separate table never reads or writes legacy or Allergy settings",
  !/(?:from|join|into|update|delete\s+from|references)\s+(?:public\.)?(?:dietary_restrictions|private_restriction_allergen\w*|\w*allergy_settings\w*)\b/i
    .test(migration));
check("Taste and Social receive no REC-D table grant or projection",
  !/social_|taste_|public_profile|meal_buddy/i.test(migration.replace(/--.*$/gm, "")));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-d-p1-smoke",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  rpcCalls: calls.length,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
