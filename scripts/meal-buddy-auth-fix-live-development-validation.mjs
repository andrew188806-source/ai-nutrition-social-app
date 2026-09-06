// AUTH_AND_MEAL_BUDDY_RUNTIME live Development validation. Exercises the REAL mobile client, REAL
// Development sign-in, and REAL Mobile repositories/service (same objects useMealBuddyRealCandidates
// calls) against the deployed meal-buddy-card-list / meal-buddy-candidate-list Edge Functions.
//
// Proves, against a real Development backend, the two guarantees the Auth + Meal Buddy runtime fix
// exists for: (1) a valid source card with qualified candidates renders the candidate list, a valid
// card with zero eligible candidates is a distinct legal empty state, and a genuine failure (signed
// out) is a third, never-confused state; (2) two different real accounts never see each other's
// cards, candidates or identifiers, and signing back in as the first account gets a fresh
// server-backed read, not a stale leftover.
//
// Development only (msbgnnoorsoefuiwluye). No credential rotation: signs in with the already-existing
// meal-buddy-demo-v1 fixture's stored password (scripts/development/meal-buddy-demo-seed.mjs). No
// Production reference anywhere. Opt in with TASTKIND_MEAL_BUDDY_AUTH_FIX_LIVE_VALIDATION=1.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_MEAL_BUDDY_AUTH_FIX_LIVE_VALIDATION";
const SUITE = "meal-buddy-live-development-validation";
if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only validation` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");
const CREDENTIALS_PATH = path.join(root, "tmp/meal-buddy-demo-credentials.json");
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "tmp/meal-buddy-demo-credentials.json absent -- run scripts/development/meal-buddy-demo-seed.mjs first" }, null, 2));
  process.exit(0);
}

const checks = []; const failures = [];
function check(name, pass, detail) {
  const r = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(r); if (!r.pass) failures.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} ${name}`);
  if (!r.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
}

const require_ = createRequire(import.meta.url);
const requireMobile = createRequire(path.join(root, "apps/mobile/package.json"));
const ts = require_("typescript");
const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (specifier === "@haocu/shared") return load(path.join(root, "packages/shared/src/index.ts"));
    if (!specifier.startsWith(".")) {
      for (const resolver of [requireMobile, require_]) { try { return resolver(specifier); } catch { /* next */ } }
      throw new Error(`unresolved external: ${specifier}`);
    }
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const feature = load(path.join(root, "apps/mobile/features/meal-buddy-candidates/index.ts"));

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const projectKeys = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const anon = projectKeys.find((k) => k.name === "anon")?.api_key;
if (!anon) throw new Error("anon key unavailable");
const { createClient } = requireMobile("@supabase/supabase-js");

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
async function signedInClient(email) {
  const client = createClient(`https://${DEV_REF}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: credentials.password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return client;
}
const authPortFor = (client) => ({ source: "supabase-live", async getCurrentSession() {
  const { data, error } = await client.auth.getSession();
  if (error) return { ok: false, error };
  return { ok: true, value: data.session };
} });
const serviceFor = (client) => feature.createMealBuddyCandidateService(
  "supabase-live", true, { authPort: authPortFor(client), mealBuddyClient: client }, { candidateSource: "supabase-live", issues: [] });
async function callFunction(name, token, body, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(`https://${DEV_REF}.supabase.co/functions/v1/${name}`, {
      method: "POST", headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    let payload = null; try { payload = JSON.parse(await res.text()); } catch { payload = null; }
    if (res.status !== 502 && res.status !== 504) return { status: res.status, payload };
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`${name} unavailable`);
}

const VIEWER_EMAIL = credentials.viewerEmail; // "Account A"
const B_EMAIL = credentials.candidateEmails[0]; // "Account B" -- mealbuddy.demo.01

console.log("=== Case A: valid source card + qualified candidates -> cards visible ===");
const viewerClient = await signedInClient(VIEWER_EMAIL);
const viewerService = serviceFor(viewerClient);
const viewerCards = await viewerService.listSourceCards();
check("A: source-card list succeeds (this is the ONLY thing that can produce '暫時無法讀取飯友卡')",
  viewerCards.ok === true, viewerCards.ok ? undefined : viewerCards.error?.code);
const generalCard = viewerCards.value.find((c) => c.cardType === "general" && c.restaurantId === null);
check("A: a currently-valid general source card exists", Boolean(generalCard), viewerCards.value);
const caseA = await viewerService.listCandidates(generalCard.sourceCardRef);
check("A: candidate read succeeds (ok:true) -- this is 'ready', never 'failed'", caseA.ok === true, caseA.ok ? undefined : caseA.error);
check("A: at least 5 qualified candidates returned -> UI renders the candidate list branch",
  caseA.ok && caseA.value.candidates.length >= 5, caseA.ok ? caseA.value.candidates.length : null);
console.log(`    candidates returned: ${caseA.ok ? caseA.value.candidates.length : "n/a"}`);

console.log("\n=== Case B: valid source card + zero eligible candidates -> empty state, not failure ===");
// The viewer's card quota is already full (5 active fixture cards). Free one slot by cancelling an
// existing general card, prove the empty-result case, cancel the throwaway card, then let the
// idempotent seed script reconcile the fixture back to its canonical set at the very end.
const tokenForB = (await viewerClient.auth.getSession()).data.session.access_token;
const freedCard = viewerCards.value.find((c) => c.cardType === "general" && c.foodContextTagKey !== null && c.sourceCardRef !== generalCard.sourceCardRef);
const freed = await callFunction("meal-buddy-card-cancel", tokenForB, { sourceCardRef: freedCard.sourceCardRef });
check("B: fixture setup -- one existing general card cancelled to free quota", freed.status === 200, freed);
// A fresh general card at a meal period no fixture candidate uses (breakfast) -- matches nobody.
const b1 = await callFunction("meal-buddy-card-create", tokenForB, {
  cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: generalCard.diningDate, mealPeriod: "breakfast", preferredTime: null, foodContextTagKey: null
});
check("B: fixture setup -- lonely breakfast card created through the real endpoint", b1.status === 200, b1);
const lonelyCardRef = b1.payload?.card?.sourceCardRef;
const caseB = lonelyCardRef ? await viewerService.listCandidates(lonelyCardRef) : { ok: false };
check("B: candidate read still succeeds (ok:true) with a legal empty result, never a failure",
  caseB.ok === true && caseB.value.candidates.length === 0, caseB.ok ? caseB.value.candidates.length : caseB.error);
// Clean up the throwaway card immediately.
if (lonelyCardRef) {
  const cancelled = await callFunction("meal-buddy-card-cancel", tokenForB, { sourceCardRef: lonelyCardRef });
  check("B: throwaway breakfast card cancelled through the real endpoint (no lasting fixture drift)", cancelled.status === 200, cancelled);
}

console.log("\n=== Case C: a genuine Development request failure -> error state, never confused with empty ===");
await viewerClient.auth.signOut();
const caseC = await viewerService.listCandidates(generalCard.sourceCardRef);
check("C: signed-out request is a typed failure (authentication_required), never an empty success",
  caseC.ok === false && caseC.error.code === "authentication_required", caseC.ok ? "ok" : caseC.error?.code);
const caseC2 = await viewerService.listSourceCards();
check("C: signed-out source-card read is ALSO a typed failure -> THIS is what actually produces '暫時無法讀取飯友卡'",
  caseC2.ok === false && caseC2.error.code === "authentication_required", caseC2.ok ? "ok" : caseC2.error?.code);
check("candidate-empty (Case B) and real failure (Case C) are provably distinct outcomes",
  caseB.ok === true && caseC.ok === false);

console.log("\n=== Cross-account: A -> B privacy ===");
const bClient = await signedInClient(B_EMAIL);
const bService = serviceFor(bClient);
const bCards = await bService.listSourceCards();
check("B: source-card read succeeds on B's own fresh session", bCards.ok === true, bCards.ok ? undefined : bCards.error);
const bGeneralCard = bCards.value.find((c) => c.cardType === "general" && c.restaurantId === null);
const bCandidates = bGeneralCard ? await bService.listCandidates(bGeneralCard.sourceCardRef) : { ok: false };
check("B: candidate read succeeds on B's own fresh session", bCandidates.ok === true, bCandidates.ok ? undefined : bCandidates.error);

const aRefs = new Set(viewerCards.value.map((c) => c.sourceCardRef));
const bRefs = new Set(bCards.value.map((c) => c.sourceCardRef));
check("A and B never share a source-card reference", ![...aRefs].some((r) => bRefs.has(r)));
check("A's own card is absent from B's card list", !bCards.value.some((c) => c.sourceCardRef === generalCard.sourceCardRef));
const bSerialized = JSON.stringify(bCandidates.ok ? bCandidates.value : {});
const idRows = await sql(`select u.id::text as id from auth.users u where u.email in ('${VIEWER_EMAIL}');`);
check("no raw viewer identifier reaches B's candidate response", !idRows.some((row) => bSerialized.includes(row.id)));

console.log("\n=== B -> A: A gets a fresh server-backed reload, not a stale leftover ===");
await bClient.auth.signOut();
const viewerClient2 = await signedInClient(VIEWER_EMAIL);
const viewerService2 = serviceFor(viewerClient2);
const aAgain = await viewerService2.listCandidates(generalCard.sourceCardRef);
// Opaque candidateRef/candidateCardRef are intentionally re-minted on every request (never a stable
// identity -- see SR-2G-E1 acceptance check 13), so the SET of people is compared by displayName, not
// by raw JSON equality including those references.
check("A signing back in gets a real, fresh server response with the same underlying candidate set",
  aAgain.ok === true && JSON.stringify(aAgain.value.candidates.map((c) => c.displayName).sort())
    === JSON.stringify(caseA.value.candidates.map((c) => c.displayName).sort()),
  { first: caseA.ok ? caseA.value.candidates.map((c) => c.displayName) : null, second: aAgain.ok ? aAgain.value.candidates.map((c) => c.displayName) : null });
check("A's re-fetched candidate references are freshly minted, not replayed from the first call",
  aAgain.ok && caseA.ok && aAgain.value.candidates.length > 0 && aAgain.value.candidates[0].candidateRef !== caseA.value.candidates[0].candidateRef);

await viewerClient2.auth.signOut();

console.log("\n=== fixture reconciliation: restore the canonical meal-buddy-demo-v1 card set ===");
const { execFileSync } = await import("node:child_process");
try {
  execFileSync(process.execPath, ["scripts/development/meal-buddy-demo-seed.mjs"], { cwd: root, stdio: "inherit", env: process.env });
  check("fixture reconciled back to its canonical card set via the idempotent seed script", true);
} catch (error) {
  check("fixture reconciled back to its canonical card set via the idempotent seed script", false, error.message);
}

console.log("\n" + JSON.stringify({
  suite: "meal-buddy-live-development-validation", projectRef: DEV_REF, environment: "development", productionTouched: false,
  diningDate: generalCard.diningDate, mealPeriod: generalCard.mealPeriod,
  caseACandidateCount: caseA.ok ? caseA.value.candidates.length : null,
  passed: checks.length - failures.length, failed: failures.length, failures
}, null, 2));
if (failures.length) process.exitCode = 1;
