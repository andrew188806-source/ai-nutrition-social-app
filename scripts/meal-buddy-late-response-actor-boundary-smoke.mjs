// Automated regression: proves the REAL useMealBuddyRealCandidates hook source cannot let a slow
// response from a PREVIOUS actor overwrite the current actor's screen, even when both actors are in
// live mode (the exact Auth root-cause scenario). The real hook file is transpiled and executed
// as-is; only "react", "./factories", "./runtimeBinding" and "./interestCatalog" are substituted with
// controllable fakes so the timing of the network response can be driven deterministically.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createHookHost } from "./meal-buddy-hook-test-host.mjs";

const ROOT = "D:/haocu app/ai-nutrition-social-mvp";
const HOOK_FILE = path.join(ROOT, "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts");

const checks = []; const failures = [];
function check(name, pass, detail) {
  const r = { name, pass: Boolean(pass) };
  checks.push(r); if (!r.pass) failures.push({ ...r, detail });
  console.log(`${r.pass ? "PASS" : "FAIL"} ${name}`);
  if (!r.pass && detail !== undefined) console.log("     detail:", JSON.stringify(detail));
}

// --- controllable fake service: listCandidates() for "card-a" does not resolve until we say so -----
let resolveSlowCandidateCall = null;
const calls = [];
function makeFakeService(tag) {
  return {
    async listSourceCards() {
      calls.push(`${tag}:listSourceCards`);
      return { ok: true, value: [{ sourceCardRef: `card-${tag}`, cardType: "general", intentionType: "eat_together", restaurantId: null, diningDate: "2099-01-01", mealPeriod: "dinner", foodContextTagKey: null }] };
    },
    async listCandidates(sourceCardRef) {
      calls.push(`${tag}:listCandidates:${sourceCardRef}`);
      if (tag === "A") {
        return new Promise((resolve) => { resolveSlowCandidateCall = () => resolve({ ok: true, value: { policyVersion: "meal-buddy-candidate-api-v1", candidates: [{ candidateRef: "scr1.stale-from-A" }] } }); });
      }
      return { ok: true, value: { policyVersion: "meal-buddy-candidate-api-v1", candidates: [{ candidateRef: `scr1.fresh-from-${tag}` }] } };
    }
  };
}
let currentServiceTag = "A";

// --- module loader: transpile the REAL hook file, substitute only its external dependencies --------
async function main() {
  const host = createHookHost();
  const source = fs.readFileSync(HOOK_FILE, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const moduleObj = { exports: {} };
  const fakeModules = {
    "./factories": { createMealBuddyCandidateService: () => makeFakeService(currentServiceTag) },
    "./runtimeBinding": { getMealBuddyCandidateRuntimeDependencies: () => ({}) },
    "./interestCatalog": { loadInterestCategoryLabels: async () => ({ ok: true, value: new Map() }) }
  };
  const localRequire = (specifier) => {
    if (specifier === "react") return host.react;
    if (specifier in fakeModules) return fakeModules[specifier];
    throw new Error(`unexpected import in regression harness: ${specifier}`);
  };
  new Function("require", "module", "exports", output)(localRequire, moduleObj, moduleObj.exports);
  const realHookFn = moduleObj.exports.useMealBuddyRealCandidates;

  currentServiceTag = "A";
  const r1 = host.mount(realHookFn, true, null, "actor-a", 1);
  check("mount as actor A starts idle", r1.state.phase === "idle" && r1.sourceCards.phase === "idle");

  await r1.loadSourceCards();
  const r2 = host.result;
  check("actor A source-card list loaded", r2.sourceCards.phase === "ready" && r2.sourceCards.cards.length === 1);

  // Start selecting A's card -- this awaits listCandidates("card-A"), which we hold open deliberately.
  const selectPromise = host.result.selectSourceCard("card-A");
  const r3 = host.result;
  check("actor A candidate load is in flight (loading)", r3.state.phase === "loading");

  // --- the exact bug scenario: actor switches to B WHILE A's request is still in flight -------------
  currentServiceTag = "B";
  const r4 = host.rerender(true, null, "actor-b", 2);
  check("actor switch resets the screen to idle before B's own read begins", r4.state.phase === "idle" && r4.sourceCards.phase === "idle");

  // --- narrow scenario: B has NOT issued any request of its own yet. Only the actor-identity guard --
  // (not the request-sequence counter, since B hasn't incremented it) can protect this window. This is
  // the precise vulnerability the fix's own comment names: "even when both actors are in live mode."
  resolveSlowCandidateCall();
  await selectPromise;
  const afterALandsWithNoBRequestYet = host.result;
  check("A's stale response cannot resurrect onto B's screen even before B has made its own request",
    afterALandsWithNoBRequestYet.state.phase === "idle", afterALandsWithNoBRequestYet.state);

  // --- broader scenario: B now makes its own overlapping request; a second stale A response (from a
  // hypothetical retry) must still never land, and B's own fresh response is what actually renders ---
  await r4.loadSourceCards();
  currentServiceTag = "A";
  const secondStalePromise = host.result.selectSourceCard("card-A-second"); // simulates a lingering retry from A, still resolved by the "A" tag's deferred branch
  currentServiceTag = "B";
  const beforeStalePromise = host.result.selectSourceCard("card-B");
  const r5 = host.result;
  check("actor B's own candidate load is in flight", r5.state.phase === "loading");

  resolveSlowCandidateCall();
  await secondStalePromise;
  const afterSecondStale = host.result;
  check("a second lingering A response also cannot overwrite B's in-flight/loading state",
    afterSecondStale.state.phase !== "ready" || !afterSecondStale.state.candidates.some((c) => c.candidateRef === "scr1.stale-from-A"),
    afterSecondStale.state);

  await beforeStalePromise;
  const final = host.result;
  check("B's own fresh response is what actually renders", final.state.phase === "ready" && final.state.candidates.some((c) => c.candidateRef === "scr1.fresh-from-B"));
  check("A's stale candidate reference never appears anywhere in B's final state", !JSON.stringify(final.state).includes("stale-from-A"));

  console.log(JSON.stringify({ suite: "meal-buddy-late-response-actor-boundary-regression", calls, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
