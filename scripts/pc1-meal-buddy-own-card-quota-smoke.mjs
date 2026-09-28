#!/usr/bin/env node
// PC-1 B1: canonical Meal Buddy card quota. Executes the REAL quota reader, the create client and the
// REAL `useMealBuddyOwnCardQuota` hook (driven by a small deterministic hook runtime supplied as the
// `react` stub), plus the live/mock wiring of /meal-buddies. Local only: no network, no database.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTsLoader } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

// ---- deterministic hook runtime (one component, re-rendered on state change)
function createHookRuntime() {
  let slots = [];
  let index = 0;
  let pending = [];
  let hookFn = null;
  let hookArgs = [];
  let result;
  let scheduled = false;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const rerender = () => {
    scheduled = false;
    index = 0;
    pending = [];
    result = hookFn(...hookArgs);
    const effects = pending;
    pending = [];
    for (const run of effects) run();
  };
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(rerender); } };
  const react = {
    useState(init) {
      const i = index++;
      if (!(i in slots)) slots[i] = { value: typeof init === "function" ? init() : init };
      const slot = slots[i];
      return [slot.value, (next) => { slot.value = typeof next === "function" ? next(slot.value) : next; schedule(); }];
    },
    useRef(init) { const i = index++; if (!(i in slots)) slots[i] = { current: init }; return slots[i]; },
    useMemo(factory, deps) {
      const i = index++;
      const prev = slots[i];
      if (prev && same(prev.deps, deps)) return prev.value;
      slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const i = index++;
      const prev = slots[i];
      if (prev && same(prev.deps, deps)) return;
      slots[i] = { deps, cleanup: prev?.cleanup };
      pending.push(() => {
        if (typeof slots[i].cleanup === "function") slots[i].cleanup();
        const cleanup = effect();
        slots[i].cleanup = typeof cleanup === "function" ? cleanup : undefined;
      });
    }
  };
  return {
    react,
    mount(fn, ...args) { hookFn = fn; hookArgs = args; slots = []; rerender(); return () => result; },
    update(...args) { hookArgs = args; rerender(); },
    unmount() { for (const slot of slots) if (slot && typeof slot.cleanup === "function") slot.cleanup(); }
  };
}

const runtime = createHookRuntime();
const { load } = createTsLoader({ stubs: { react: runtime.react } });
const quotaModule = load("apps/mobile/features/meal-buddy-card-create/ownCardQuota.ts");
const binding = load("apps/mobile/features/meal-buddy-card-create/runtimeBinding.ts");
const { createRecommendationMealBuddyCard } = load("apps/mobile/features/meal-buddy-card-create/createRecommendationMealBuddyCard.ts");
const { useMealBuddyOwnCardQuota } = load("apps/mobile/features/meal-buddy-card-create/useMealBuddyOwnCardQuota.ts");

const QUOTA = { general: { used: 0, limit: 1 }, restaurant: { used: 1, limit: 1 } };
const listBody = (quota = QUOTA, policyVersion = "meal-buddy-card-write-api-v1") => ({ policyVersion, cards: [{ sourceCardRef: "mbc1.x" }], quota });
const session = { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "u" } } }) };

// ---- 1. response validation
{
  const p = quotaModule.parseMealBuddyOwnCardQuotaResponse;
  check("B1-1 a valid SR-2G-B response yields exactly the server quota (no cards exposed)",
    JSON.stringify(p(listBody())) === JSON.stringify(QUOTA) && Object.keys(p(listBody())).sort().join() === "general,restaurant");
  check("B1-2 a wrong policyVersion, a missing quota or a malformed allowance is rejected",
    p(listBody(QUOTA, "meal-buddy-card-write-api-v2")) === null && p({ policyVersion: "meal-buddy-card-write-api-v1", cards: [] }) === null
    && p(listBody({ general: { used: -1, limit: 1 }, restaurant: QUOTA.restaurant })) === null
    && p(listBody({ general: { used: 0.5, limit: 1 }, restaurant: QUOTA.restaurant })) === null
    && p(listBody({ general: QUOTA.general })) === null);
  check("B1-3 premium caps come from the server response as-is (no local tier)",
    JSON.stringify(p(listBody({ general: { used: 2, limit: 3 }, restaurant: { used: 1, limit: 2 } }))) === JSON.stringify({ general: { used: 2, limit: 3 }, restaurant: { used: 1, limit: 2 } }));
}

// ---- 2. the bounded reader
{
  const invocations = [];
  const repo = new quotaModule.SupabaseMealBuddyOwnCardQuotaRepository(session,
    { functions: { invoke: async (name, options) => { invocations.push({ name, options }); return { data: listBody(), error: null }; } } });
  const outcome = await repo.readQuota();
  check("B1-4 the reader calls meal-buddy-card-list with the frozen empty body and the named timeout",
    invocations[0]?.name === "meal-buddy-card-list" && JSON.stringify(invocations[0]?.options.body) === "{}"
    && invocations[0]?.options.timeout === quotaModule.MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_MS && quotaModule.MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_MS === 15000, invocations);
  check("B1-5 an active persisted Restaurant card shows as restaurant used=1 exactly as the server counts it",
    outcome.ok && outcome.value.restaurant.used === 1 && outcome.value.restaurant.limit === 1, outcome);
  const timers = [];
  const hung = new quotaModule.SupabaseMealBuddyOwnCardQuotaRepository(session, { functions: { invoke: () => new Promise(() => {}) } },
    { timeoutMs: 15000, schedule(callback) { timers.push(callback); return () => {}; } });
  const pending = hung.readQuota();
  await tick();
  timers.forEach((fire) => fire());
  const timedOut = await pending;
  check("B1-6 a hung read settles as a failure when the bound fires", timedOut.ok === false && timedOut.errorCode === "network_error");
  const unauth = new quotaModule.SupabaseMealBuddyOwnCardQuotaRepository({ getCurrentSession: async () => ({ ok: true, value: null }) },
    { functions: { invoke: async () => { throw new Error("unreachable"); } } });
  check("B1-7 no session -> authentication_required, no request", (await unauth.readQuota()).errorCode === "authentication_required");
  const bad = new quotaModule.SupabaseMealBuddyOwnCardQuotaRepository(session, { functions: { invoke: async () => ({ data: listBody(QUOTA, "other"), error: null }) } });
  check("B1-8 an invalid response is a failure, never a guessed quota", (await bad.readQuota()).errorCode === "invalid_server_response");
}

// ---- 3. the create response carries the post-create quota
{
  const after = { general: { used: 0, limit: 1 }, restaurant: { used: 1, limit: 1 } };
  binding.bindMealBuddyCardCreateRuntimeDependencies({ authPort: session, client: { functions: { invoke: async () => ({
    data: { policyVersion: "meal-buddy-card-write-api-v1", card: { sourceCardRef: "mbc1.new", restaurantId: "r1", foodContextTagKey: null }, quota: after }, error: null }) } } });
  const created = await createRecommendationMealBuddyCard({});
  check("B1-9 a successful create returns the server's post-create quota", created.ok && JSON.stringify(created.quota) === JSON.stringify(after), created);
  binding.bindMealBuddyCardCreateRuntimeDependencies({ authPort: session, client: { functions: { invoke: async () => ({
    data: { card: { sourceCardRef: "mbc1.new", restaurantId: "r1", foodContextTagKey: null } }, error: null }) } } });
  const noQuota = await createRecommendationMealBuddyCard({});
  check("B1-10 a create response without a valid quota block yields quota=null (the card still counts as created)",
    noQuota.ok === true && noQuota.quota === null, noQuota);
  binding.clearMealBuddyCardCreateRuntimeDependencies();
  check("B1-11 without the live owner-card binding the reader is disabled (mock/no-live never reads)",
    quotaModule.createMealBuddyOwnCardQuotaRepository().source === "disabled");
}

// ---- 4. the REAL hook: no fabricated zero, fail closed, update from create without a second read
{
  const reads = [];
  const gates = [];
  const factory = () => ({ source: "supabase-live", readQuota: () => { const gate = deferred(); gates.push(gate); reads.push(1); return gate.promise; } });
  const get = runtime.mount(useMealBuddyOwnCardQuota, "actor-a", 1, factory);
  check("B1-12 the first render is loading, never a fabricated 0/limit", get().state.phase === "loading");
  gates[0].resolve({ ok: true, value: QUOTA });
  await tick(); await tick();
  check("B1-13 the canonical quota becomes ready from ONE list read", get().state.phase === "ready" && reads.length === 1
    && get().state.quota.restaurant.used === 1, get().state);
  const next = { general: { used: 1, limit: 1 }, restaurant: { used: 1, limit: 1 } };
  get().applyFromCreate(next);
  await tick(); await tick();
  check("B1-14 applyFromCreate uses the create response directly — no second list request",
    reads.length === 1 && JSON.stringify(get().state.quota) === JSON.stringify(next));
  get().applyFromCreate(null);
  await tick();
  check("B1-15 a create without a quota block triggers exactly one canonical re-read", reads.length === 2 && get().state.phase === "loading");
  gates[1].resolve({ ok: false, errorCode: "network_error" });
  await tick(); await tick();
  check("B1-16 a failed read is an explicit failed state (the screen fails closed)", get().state.phase === "failed");
  runtime.update("actor-b", 2, factory);
  await tick();
  check("B1-17 an actor/generation change re-reads for the new actor", reads.length === 3 && get().state.phase === "loading");
  runtime.update("actor-c", 3, factory);
  await tick();
  gates[2].resolve({ ok: true, value: { general: { used: 9, limit: 9 }, restaurant: { used: 9, limit: 9 } } });
  gates[3].resolve({ ok: true, value: QUOTA });
  await tick(); await tick();
  check("B1-18 a stale read for a previous actor never overwrites the current actor's quota",
    get().state.phase === "ready" && get().state.quota.general.limit === 1, get().state);
  runtime.update(null, 4, factory);
  await tick(); await tick();
  check("B1-19 no live actor (mock mode) -> disabled, and no read", get().state.phase === "disabled" && reads.length === 4);
  runtime.unmount();
}

// ---- 5. /meal-buddies wiring (live vs mock) and the frozen SR-2G-E boundary
{
  const screen = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
  check("B1-20 live counters and gating use ONLY the canonical quota (mock keeps the local store)",
    /cardUsage=\{isRealCandidateMode \? canonicalCardUsage : cardUsage\}/.test(screen)
    && /const canonicalCardUsage = ownQuota\.state\.phase === "ready" \? toCardUsage\(ownQuota\.state\.quota\) : null;/.test(screen)
    && /count: quota\.restaurant\.used, limit: quota\.restaurant\.limit/.test(screen));
  check("B1-21 unavailable quota fails closed for both the handoff form and manual create",
    (screen.match(/if \(!cardUsage\) \{\s*setCardQuotaMessage\(quotaPhase === "loading" \? QUOTA_LOADING_MESSAGE : QUOTA_UNAVAILABLE_MESSAGE\);\s*return;\s*\}/g) ?? []).length === 2
    && /QUOTA_UNAVAILABLE_MESSAGE = "無法取得額度/.test(screen) && /: "無法取得額度"/.test(screen));
  check("B1-22 a successful canonical create updates the quota from its own response",
    /onCanonicalQuota\(result\.quota\);/.test(screen) && /onCanonicalQuota=\{ownQuota\.applyFromCreate\}/.test(screen));
  check("B1-23 live hides the demo tier toggle, the local card list and the local daily counter; mock keeps them",
    /\{isRealCandidateMode \? null : <DemoModeToggle mode=\{demoMode\} onChange=\{setDemoMode\} \/>\}/.test(screen)
    && /\{isRealCandidateMode \? null : \(\s*<View style=\{\[styles\.miniStat, styles\.miniStatBlue\]\}>/.test(screen)
    && /\{isRealCandidateMode \? null : activeCards\.length === 0 \?/.test(screen)
    && /subtitle=\{isRealCandidateMode \? "依你選擇的飯友卡推薦" : /.test(screen));
  const frozen = spawnSync("git", ["diff", "--name-only", "HEAD", "--",
    "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddySourceCardRepository.ts",
    "apps/mobile/features/meal-buddy-candidates/ports.ts"], { cwd: root, encoding: "utf8" }).stdout.trim();
  check("B1-24 the frozen SR-2G-E source-card adapter and port are untouched", frozen === "", frozen);
}

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "pc1-meal-buddy-own-card-quota-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
