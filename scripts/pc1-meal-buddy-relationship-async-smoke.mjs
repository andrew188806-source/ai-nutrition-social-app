#!/usr/bin/env node
// PC-1 A1: Meal Buddy invitation async reconciliation. Executes the REAL controller and repository
// (transpile-only) against deterministic fakes. Timeouts are driven by an injected scheduler that the
// test fires by hand, so nothing waits in real time. Local only: no network, no database.
import { createTsLoader } from "./gqa6r-ts-loader.mjs";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const { load } = createTsLoader();
const { MealBuddyRelationshipProfileController, MealBuddyRelationshipInboxController } =
  load("apps/mobile/features/meal-buddy-relationships/controller.ts");
const { SupabaseMealBuddyRelationshipRepository } = load("apps/mobile/features/meal-buddy-relationships/repository.ts");
const types = load("apps/mobile/features/meal-buddy-relationships/types.ts");

const CANDIDATE = "scr1.candidate-ref-aaaaaaaa";
const REL = "mbr1.relationship-ref-aaaa";
const item = (state) => Object.freeze({ relationshipRef: REL, state, counterpart: { displayName: "[DEMO] 飯友 01", mascotAvatarKey: "BG" } });
const ok = (...items) => Object.freeze({ ok: true, value: Object.freeze({ relationships: items }) });
const fail = (errorCode) => Object.freeze({ ok: false, errorCode });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

// Scripted repository: each call pops the next queued answer (a value or a deferred promise).
function scriptedRepository(script) {
  const calls = [];
  const next = (op, arg) => {
    calls.push({ op, arg });
    const queue = script[op] ?? [];
    if (!queue.length) return Promise.resolve(fail("server_unavailable"));
    const answer = queue.shift();
    return answer && typeof answer.then === "function" ? answer : Promise.resolve(answer);
  };
  return {
    calls,
    source: "supabase-live",
    read: (ref) => next("read", ref), list: () => next("list"), send: (ref) => next("send", ref),
    accept: (ref) => next("accept", ref), decline: (ref) => next("decline", ref),
    cancel: (ref) => next("cancel", ref), unfriend: (ref) => next("unfriend", ref)
  };
}
async function readyProfile(script, initial = "none") {
  const repo = scriptedRepository({ ...script, read: [ok(...(initial === "none" ? [] : [item(initial)])), ...(script.read ?? [])] });
  const controller = new MealBuddyRelationshipProfileController(repo);
  const seen = [];
  controller.subscribe((state) => seen.push(state));
  await controller.setContext("actor-a", 1, CANDIDATE);
  return { controller, repo, seen };
}
const s = (c) => c.getState();

// ---- 1. canonical success, one click = one mutation
{
  const gate = deferred();
  const { controller, repo } = await readyProfile({ send: [gate.promise] });
  const first = controller.send();
  const second = controller.send(); // double click while the first is in flight
  check("A1-1 a second click while sending issues no second mutation", repo.calls.filter((c) => c.op === "send").length === 1);
  check("A1-2 the button shows the send action as pending while it runs", s(controller).pendingAction === "send");
  gate.resolve(ok(item("outgoing_pending")));
  await Promise.all([first, second]);
  const state = s(controller);
  check("A1-3 success lands on the canonical outgoing_pending with the spinner cleared",
    state.relationship.state === "outgoing_pending" && state.pendingAction === null && state.syncPhase === "stable" && state.errorCode === null, state);
}

// ---- 2. uncertain -> reconciling -> canonical success (commit happened, response lost)
{
  const { controller, repo, seen } = await readyProfile({ send: [fail("request_timeout")], read: [ok(item("outgoing_pending"))] });
  const result = await controller.send();
  const phases = seen.filter((x) => x.phase === "ready").map((x) => `${x.pendingAction ?? "-"}/${x.syncPhase}`);
  check("A1-4 an uncertain result clears the action spinner and enters reconciling before the re-read",
    phases.includes("send/stable") && phases.includes("-/reconciling"), phases);
  check("A1-5 exactly one bounded canonical re-read follows an uncertain result",
    repo.calls.filter((c) => c.op === "read").length === 2 && repo.calls[repo.calls.length - 1].arg === CANDIDATE, repo.calls);
  const state = s(controller);
  check("A1-6 a re-read showing the invite landed shows that canonical state (no error, no resend)",
    result === true && state.relationship.state === "outgoing_pending" && state.errorCode === null && state.syncPhase === "stable"
    && repo.calls.filter((c) => c.op === "send").length === 1, state);
}

// ---- 3. uncertain -> re-read shows none -> safe retry
{
  const { controller, repo } = await readyProfile({ send: [fail("network_error"), ok(item("outgoing_pending"))], read: [ok()] });
  await controller.send();
  const state = s(controller);
  check("A1-7 a re-read showing nothing changed ends in a retryable failure, not success",
    state.relationship.state === "none" && state.errorCode === "network_error" && state.pendingAction === null && state.syncPhase === "stable", state);
  await controller.send();
  check("A1-8 retry is permitted after canonical none and resolves canonically",
    repo.calls.filter((c) => c.op === "send").length === 2 && s(controller).relationship.state === "outgoing_pending");
}

// ---- 4. uncertain -> re-read fails -> unknown_server_state; blind resend disabled; refresh recovers
{
  const { controller, repo } = await readyProfile({ send: [fail("server_unavailable")], read: [fail("network_error"), ok(item("outgoing_pending"))] });
  await controller.send();
  const state = s(controller);
  check("A1-9 mutation and re-read both failing clears the spinner and enters unknown_server_state",
    state.syncPhase === "unknown_server_state" && state.pendingAction === null, state);
  const blocked = await controller.send();
  check("A1-10 in unknown_server_state a blind resend is refused (no mutation issued)",
    blocked === false && repo.calls.filter((c) => c.op === "send").length === 1);
  await controller.load(); // the explicit "重新整理狀態" action (hook `retry`)
  check("A1-11 the explicit state refresh returns to canonical truth",
    s(controller).relationship.state === "outgoing_pending" && s(controller).syncPhase === "stable");
}

// ---- 5. definite rejection is never success; it still re-reads once (frozen SR-2I-B contract)
{
  const { controller, repo } = await readyProfile({ send: [fail("invalid_request")], read: [ok()] });
  const result = await controller.send();
  const state = s(controller);
  check("A1-12 a definite rejection re-reads once and keeps the canonical state with its error (not success)",
    result === false && state.relationship.state === "none" && state.errorCode === "invalid_request" && state.syncPhase === "stable"
    && repo.calls.filter((c) => c.op === "read").length === 2, { state, calls: repo.calls });
  const { controller: c2 } = await readyProfile({ send: [fail("invalid_request")], read: [fail("network_error")] });
  await c2.send();
  check("A1-12b a definite rejection whose re-read fails stays stable (the action surely did not happen), not unknown",
    s(c2).syncPhase === "stable" && s(c2).errorCode === "invalid_request" && s(c2).pendingAction === null, s(c2));
}

// ---- 6. server idempotency answers are canonical
{
  const { controller } = await readyProfile({ send: [ok(item("accepted"))] });
  await controller.send();
  check("A1-13 an already-related pair resolves to accepted (already_related), not an error",
    s(controller).relationship.state === "accepted" && s(controller).errorCode === null);
  const { controller: c2 } = await readyProfile({ send: [ok(item("incoming_pending"))] });
  await c2.send();
  check("A1-14 a reverse pending pair resolves to incoming_pending", s(c2).relationship.state === "incoming_pending");
}

// ---- 7. accept / decline / cancel / unfriend share the bounded contract
for (const [action, from, to] of [["accept", "incoming_pending", "accepted"], ["decline", "incoming_pending", "none"],
  ["cancel", "outgoing_pending", "none"], ["unfriend", "accepted", "none"]]) {
  const landed = to === "none" ? ok() : ok(item(to));
  const { controller, repo } = await readyProfile({ [action]: [fail("request_timeout")], read: [landed] }, from);
  await controller[action]();
  const state = s(controller);
  check(`A1-15 ${action}: uncertain result -> re-read -> canonical ${to}, spinner cleared`,
    state.relationship.state === to && state.pendingAction === null && state.syncPhase === "stable"
    && repo.calls.filter((c) => c.op === action).length === 1, state);
}

// ---- 8. stale completion never touches a newer actor
{
  const gate = deferred();
  const repo = scriptedRepository({ read: [ok(), ok(item("accepted"))], send: [gate.promise] });
  const controller = new MealBuddyRelationshipProfileController(repo);
  await controller.setContext("actor-a", 1, CANDIDATE);
  const sending = controller.send();
  await controller.setContext("actor-b", 2, CANDIDATE); // sign-in switch mid-flight
  gate.resolve(ok(item("outgoing_pending")));
  await sending;
  check("A1-16 an in-flight send completing after an actor change does not write the new actor's state",
    s(controller).relationship.state === "accepted" && s(controller).pendingAction === null, s(controller));
  const gate2 = deferred();
  const repo2 = scriptedRepository({ read: [ok()], send: [gate2.promise] });
  const c2 = new MealBuddyRelationshipProfileController(repo2);
  const seen = [];
  c2.subscribe((x) => seen.push(x));
  await c2.setContext("actor-a", 1, CANDIDATE);
  const p = c2.send();
  c2.dispose();
  const before = seen.length;
  gate2.resolve(ok(item("outgoing_pending")));
  await p;
  check("A1-17 a completion after unmount (dispose) emits nothing", seen.length === before);
}

// ---- 9. inbox mutations terminate even when the answer is uncertain
{
  const repo = scriptedRepository({ list: [ok(item("incoming_pending")), ok(item("accepted"))], accept: [fail("request_timeout")] });
  const inbox = new MealBuddyRelationshipInboxController(repo);
  await inbox.setActor("actor-a", 1);
  await inbox.accept(REL);
  const state = inbox.getState();
  check("A1-18 inbox accept with an uncertain answer re-reads the list and clears its pending state",
    state.phase === "ready" && state.pendingAction === null && state.relationships[0]?.state === "accepted", state);
}

// ---- 10. the repository bound: whole operation raced against the named policy
function manualScheduler() {
  const timers = [];
  return {
    timers,
    policy: Object.freeze({
      timeoutMs: types.MEAL_BUDDY_RELATIONSHIP_REQUEST_TIMEOUT_MS,
      schedule(callback, delayMs) { const t = { callback, delayMs, cancelled: false }; timers.push(t); return () => { t.cancelled = true; }; }
    }),
    fire() { for (const t of timers) if (!t.cancelled) t.callback(); }
  };
}
const liveSession = { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "u" } } }) };
check("A1-19 the named default bound is 15000 ms", types.MEAL_BUDDY_RELATIONSHIP_REQUEST_TIMEOUT_MS === 15000
  && types.DEFAULT_MEAL_BUDDY_RELATIONSHIP_TIMEOUT_POLICY.timeoutMs === 15000);
{
  const clock = manualScheduler();
  const invocations = [];
  const hungClient = { functions: { invoke: (name, options) => { invocations.push({ name, options }); return new Promise(() => {}); } } };
  const repo = new SupabaseMealBuddyRelationshipRepository(liveSession, hungClient, clock.policy);
  const pending = repo.send(CANDIDATE);
  await tick();
  check("A1-20 the SDK request carries the same timeout (functions-js aborts the fetch)",
    invocations[0]?.options.timeout === 15000 && invocations[0]?.options.body.operation === "send", invocations[0]);
  clock.fire();
  const outcome = await pending;
  check("A1-21 a request that never answers settles as request_timeout when the bound fires",
    outcome.ok === false && outcome.errorCode === "request_timeout", outcome);
}
{
  const clock = manualScheduler();
  const hungSession = { getCurrentSession: () => new Promise(() => {}) };
  const repo = new SupabaseMealBuddyRelationshipRepository(hungSession, { functions: { invoke: () => { throw new Error("unreachable"); } } }, clock.policy);
  const pending = repo.read(CANDIDATE);
  clock.fire();
  const outcome = await pending;
  check("A1-22 a hung session read (before any fetch) is bounded too", outcome.ok === false && outcome.errorCode === "request_timeout");
}
{
  const clock = manualScheduler();
  const client = { functions: { invoke: async () => ({ data: { policyVersion: "meal-buddy-relationship-v1", relationships: [item("outgoing_pending")] }, error: null }) } };
  const repo = new SupabaseMealBuddyRelationshipRepository(liveSession, client, clock.policy);
  const outcome = await repo.send(CANDIDATE);
  check("A1-23 a normal answer cancels the bound", outcome.ok === true && clock.timers.every((t) => t.cancelled));
  const aborted = new SupabaseMealBuddyRelationshipRepository(liveSession,
    { functions: { invoke: async () => ({ data: null, error: { name: "FunctionsFetchError" } }) } }, manualScheduler().policy);
  const abortedOutcome = await aborted.send(CANDIDATE);
  check("A1-24 an aborted/failed transport maps to the uncertain network_error",
    abortedOutcome.ok === false && abortedOutcome.errorCode === "network_error", abortedOutcome);
  check("A1-25 only transport outcomes are uncertain; domain rejections are definite",
    ["network_error", "server_unavailable", "invalid_server_response", "request_timeout"].every((c) => types.UNCERTAIN_MEAL_BUDDY_RELATIONSHIP_ERRORS.has(c))
    && ["invalid_request", "authentication_required", "operation_not_enabled"].every((c) => !types.UNCERTAIN_MEAL_BUDDY_RELATIONSHIP_ERRORS.has(c)));
}

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "pc1-meal-buddy-relationship-async-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
