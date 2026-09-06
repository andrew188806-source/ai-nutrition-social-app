#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();
const checks = [];

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push(name);
}

function loadScope() {
  const file = path.join(root, "apps/mobile/features/consumer-auth/clientStateScope.ts");
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(require, module, module.exports);
  return module.exports;
}

try {
  const scope = loadScope();
  const observed = [];
  const unsubscribe = scope.subscribeConsumerClientStateScope((next) => observed.push(`${next.actorKey}:${next.actorGeneration}`));

  scope.setConsumerClientStateScope("account-a", 1);
  const aKey = scope.consumerUserScopedStorageKey("haocu.mealBuddy.activeCards.v3");
  scope.setConsumerClientStateScope("account-b", 2);
  const bKey = scope.consumerUserScopedStorageKey("haocu.mealBuddy.activeCards.v3");
  scope.setConsumerClientStateScope(null, 3);
  unsubscribe();

  expect(aKey === "haocu.mealBuddy.activeCards.v3.account-a", "A persistence key is actor-scoped");
  expect(bKey === "haocu.mealBuddy.activeCards.v3.account-b", "B persistence key is actor-scoped");
  expect(aKey !== bKey, "account switch cannot reuse the previous persistence key");
  expect(scope.consumerUserScopedStorageKey("haocu.mealBuddy.activeCards.v3") === null, "signed-out state has no shared fallback key");
  expect(observed.join(",") === "account-a:1,account-b:2,null:3", "identity boundary emits every actor transition");

  const runtime = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts"), "utf8");
  const candidateHook = fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts"), "utf8");
  const mealBuddyScreen = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
  const scopedStores = [
    "apps/mobile/features/meal-buddy-card/mealBuddyCardStore.ts",
    "apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts",
    "apps/mobile/features/analysis/analysisMealRecordStore.ts",
    "apps/mobile/features/group-tables/groupTableStore.ts"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8"));

  expect(runtime.includes("setConsumerClientStateScope(actorKey, actorGeneration)"), "runtime publishes sign-in/account-switch boundary");
  expect(runtime.includes("setConsumerClientStateScope(null, actorGeneration)"), "runtime publishes sign-out boundary");
  expect(candidateHook.includes("actorGeneration = 0") && candidateHook.includes("actorIdentityRef.current !== requestActorIdentity"), "Meal Buddy rejects late responses from a prior actor");
  expect(mealBuddyScreen.includes("consumerRuntime.state.actorGeneration") && mealBuddyScreen.includes("useMealBuddyRealCandidates("), "Meal Buddy supplies the canonical actor identity to its reads");
  expect(scopedStores.every((source) => source.includes("consumerUserScopedStorageKey") && source.includes("ensureActorState")), "persisted Consumer demo stores require an authenticated actor scope");

  console.log(`AUTH_SCOPED_CLIENT_STATE_ISOLATION_SMOKE PASS (${checks.length} checks)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
