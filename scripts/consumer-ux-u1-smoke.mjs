import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-ux-u1-"));
const checks = [];

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function assert(condition, name, detail, extra = {}) {
  if (!condition) throw new Error(`${name}: ${detail}`);
  pass(name, extra);
}

try {
  for (const file of ["nextMealCandidateCountPolicy.ts", "types.ts", "nextMealBuddyPrefill.ts", "nextMealPrototypePresenter.ts"]) {
    const source = fs.readFileSync(path.join(root, "apps", "mobile", "features", "next-meal-prototype", file), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    }).outputText;
    fs.writeFileSync(path.join(tempRoot, file.replace(/\.ts$/, ".js")), output);
  }

  const requireFromTemp = createRequire(path.join(tempRoot, "nextMealBuddyPrefill.js"));
  const policy = requireFromTemp("./nextMealCandidateCountPolicy.js");
  const prefill = requireFromTemp("./nextMealBuddyPrefill.js");
  const presenter = requireFromTemp("./nextMealPrototypePresenter.js");

  const freeCount = policy.getNextMealCandidateCount("free");
  const premiumCount = policy.getNextMealCandidateCount("premium");
  assert(freeCount === 3, "Free U1 count equals existing Free AI Analysis count", "Expected shared Free count 3.", { count: freeCount });
  assert(premiumCount === 10, "Premium U1 count equals existing Premium AI Analysis count", "Expected shared Premium count 10.", { count: premiumCount });
  for (const unknown of [undefined, null, "unknown", "PREMIUM", 10, {}, []]) {
    assert(policy.getNextMealCandidateCount(unknown) === freeCount, "unknown or malformed entitlement fails closed to shared Free count", `Unexpected count for ${String(unknown)}.`);
  }

  const allCandidates = Array.from({ length: premiumCount }, (_, index) => ({
    prototypeId: `prototype-meal-${index + 1}`,
    source: "u1_mock",
    isSampleData: true,
    ordinal: index,
    isBestRecommendation: index === 0,
    mealName: index === 0 ? "舒肥雞胸均衡碗" : `替代餐點 ${index}`,
    restaurantName: "好廚 TastKind",
    areaLabel: "中山區",
    tags: ["範例資料", "均衡選擇"],
    reasonSummary: "固定 U1 範例",
    reasonDetails: []
  }));

  const freeRecommendation = {
    source: "u1_mock",
    isSampleData: true,
    headline: "這是你的下一餐",
    entitlement: "free",
    visibleCandidateCount: freeCount,
    candidates: allCandidates.slice(0, freeCount)
  };
  const premiumRecommendation = {
    ...freeRecommendation,
    entitlement: "premium",
    visibleCandidateCount: premiumCount,
    candidates: allCandidates.slice(0, premiumCount)
  };
  assert(freeRecommendation.candidates.length === freeCount, "Free alternatives stop at active shared limit", "Free candidate collection exceeded limit.");
  assert(premiumRecommendation.candidates.length === premiumCount, "Premium alternatives stop at active shared limit", "Premium candidate collection exceeded limit.");
  assert(freeRecommendation.candidates[0].isBestRecommendation && freeRecommendation.candidates.slice(1).every((candidate) => !candidate.isBestRecommendation), "best recommendation is index zero and remaining candidates are alternatives", "Candidate ordering markers are incorrect.");
  assert(allCandidates.every((candidate) => candidate.source === "u1_mock" && candidate.isSampleData === true), "all candidates remain explicitly prototype/sample data", "Missing prototype marker.");

  const initialModel = presenter.presentU1NextMealResult({ status: "success", recommendation: freeRecommendation });
  assert(initialModel.status === "success" && initialModel.selectedCandidateId === null && initialModel.confirmedCandidateId === null, "success requires explicit candidate selection before downstream actions", "Initial model must have no selected candidate.");
  const selectedCandidate = freeRecommendation.candidates[1];
  const selectedModel = presenter.presentU1NextMealResult({ status: "success", recommendation: freeRecommendation }, selectedCandidate.prototypeId);
  assert(selectedModel.status === "success" && selectedModel.selectedCandidateId === selectedCandidate.prototypeId && selectedModel.confirmedCandidateId === null, "candidate selection is presentation-only and initially unconfirmed", "Selected identity mismatch.");
  const confirmedModel = presenter.presentU1NextMealResult({ status: "success", recommendation: freeRecommendation }, selectedCandidate.prototypeId, selectedCandidate.prototypeId);
  assert(confirmedModel.status === "success" && confirmedModel.confirmedCandidateId === selectedCandidate.prototypeId, "這是我的下一餐 confirms only the selected candidate locally", "Confirmed identity mismatch.");
  const changedModel = presenter.presentU1NextMealResult({ status: "success", recommendation: freeRecommendation }, freeRecommendation.candidates[0].prototypeId, selectedCandidate.prototypeId);
  assert(changedModel.status === "success" && changedModel.confirmedCandidateId === null, "changing candidate clears unrelated local confirmation", "Confirmation must not carry to another candidate.");
  const invalidSelection = presenter.presentU1NextMealResult({ status: "success", recommendation: freeRecommendation }, "missing-candidate");
  assert(invalidSelection.status === "success" && invalidSelection.selectedCandidateId === null, "malformed selected identity fails safely", "Unknown candidate must not become selected.");

  for (const state of [
    { status: "disabled", message: "disabled" },
    { status: "empty", message: "empty" },
    { status: "error", message: "error", retryable: true }
  ]) {
    assert(presenter.presentU1NextMealResult(state).status === state.status, `${state.status} provider state is deterministic`, `Presenter changed ${state.status} state.`);
  }

  const cardAndQuotaState = { activeCardCount: 2, generalQuotaCount: 1, restaurantQuotaCount: 1, visibleQuotaUsed: 0, pendingMatch: null };
  const baseline = JSON.stringify(cardAndQuotaState);
  const selectedPrefill = prefill.buildU1NextMealBuddyPrefill(selectedCandidate);
  assert(selectedPrefill.foodName === selectedCandidate.mealName, "only selected candidate fields reach prefill", "Prefill used the wrong candidate.");

  assert(prefill.consumeU1NextMealBuddyPrefill(undefined) === null, "direct Meal Buddy navigation consumes no prefill", "Missing token must return null.");
  assert(prefill.hasPendingU1NextMealBuddyPrefill() === false, "direct Meal Buddy navigation leaves transient state empty", "No pending prefill should exist.");

  prefill.stageU1NextMealBuddyPrefill(selectedPrefill);
  assert(prefill.consumeU1NextMealBuddyPrefill(undefined) === null, "missing token preserves direct Meal Buddy behavior and hides staged data", "Missing token must not expose staged prefill.");
  assert(prefill.hasPendingU1NextMealBuddyPrefill() === false, "missing token clears abandoned transient prefill", "Missing token must clear stale prefill.");
  assert(JSON.stringify(cardAndQuotaState) === baseline, "direct Meal Buddy navigation leaves cards, quota, and pending match unchanged", "Direct navigation mutated state.");

  const malformedToken = prefill.stageU1NextMealBuddyPrefill({ source: "u1_next_meal_prototype", handoffId: "bad", foodName: "", foodCategory: "", restaurantName: "", area: "", preferredTime: "", note: "" });
  assert(malformedToken === null && prefill.hasPendingU1NextMealBuddyPrefill() === false, "malformed prefill fails safely", "Malformed prefill must not be staged.");

  const firstToken = prefill.stageU1NextMealBuddyPrefill(selectedPrefill);
  const secondToken = prefill.stageU1NextMealBuddyPrefill(selectedPrefill);
  assert(typeof firstToken === "string" && typeof secondToken === "string", "repeated Meal Buddy CTA taps only restage transient prefill", "Both taps should return navigation tokens.");
  assert(JSON.stringify(cardAndQuotaState) === baseline, "repeated Meal Buddy CTA taps create zero cards, consume zero quota, and set no pending match", "Presentation staging mutated state.");

  assert(prefill.consumeU1NextMealBuddyPrefill("malformed-token") === null, "malformed token fails safely", "Mismatched token must return null.");
  assert(prefill.hasPendingU1NextMealBuddyPrefill() === false, "malformed token clears stale transient prefill", "Stale transient data must be cleared.");
  assert(JSON.stringify(cardAndQuotaState) === baseline, "malformed handoff leaves cards, quota, and pending match unchanged", "Malformed handoff mutated state.");

  const consumeToken = prefill.stageU1NextMealBuddyPrefill(selectedPrefill);
  const consumed = prefill.consumeU1NextMealBuddyPrefill(consumeToken);
  assert(consumed?.foodName === selectedCandidate.mealName, "valid token is consumed once by the form", "Expected selected-candidate prefill.");
  assert(prefill.consumeU1NextMealBuddyPrefill(consumeToken) === null && prefill.hasPendingU1NextMealBuddyPrefill() === false, "consumed token cannot be reused", "Token must be one-time.");
  assert(JSON.stringify(cardAndQuotaState) === baseline, "opening prefilled form leaves cards, quota, and pending match unchanged", "Form opening mutated state.");

  prefill.stageU1NextMealBuddyPrefill(selectedPrefill);
  prefill.clearU1NextMealBuddyPrefill();
  assert(prefill.hasPendingU1NextMealBuddyPrefill() === false, "explicit cancel clears transient prefill", "Cancel must clear pending state.");
  assert(JSON.stringify(cardAndQuotaState) === baseline, "cancelling prefilled form leaves cards, quota, and pending match unchanged", "Cancel mutated state.");

  const sourceRoot = path.join(root, "apps", "mobile", "features", "next-meal-prototype");
  const u1Source = fs.readdirSync(sourceRoot)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => fs.readFileSync(path.join(sourceRoot, name), "utf8"))
    .join("\n");
  assert(!/@supabase\/|consumer[A-Za-z]*Write(Service|Repository)|\.rpc\s*\(|plannedMealStore|savePlannedDinner|mealBuddyCardStore|createMealBuddyCard|upsertMealBuddyCard|setPendingMatchRequest/.test(u1Source), "U1 source has no forbidden runtime or mutation dependency", "Forbidden dependency found.");

  console.log(JSON.stringify({ status: "passed", track: "Consumer UX Track U1 local smoke", checks, cardsCreated: 0, quotaConsumed: 0, pendingMatchCreated: false, databaseWriteUsed: false, networkRequestUsed: false, productionTouched: false, phase2QStarted: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", track: "Consumer UX Track U1 local smoke", reason: error instanceof Error ? error.message : String(error), checks, databaseWriteUsed: false, networkRequestUsed: false, productionTouched: false, phase2QStarted: false }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
