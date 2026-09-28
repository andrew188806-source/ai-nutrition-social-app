#!/usr/bin/env node
// PC-1 A2: Meal Buddy chat optimistic reconciliation. Executes the REAL chat controller and repository
// (transpile-only) against deterministic fakes. The realtime frame is deliberately delivered BEFORE the
// HTTP acknowledgement; timeouts are fired by hand through the injected scheduler. Local only.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const { load } = createTsLoader();
const { MealBuddyChatController } = load("apps/mobile/features/meal-buddy-chat/controller.ts");
const repositoryModule = load("apps/mobile/features/meal-buddy-chat/repository.ts");
const chatTypes = load("apps/mobile/features/meal-buddy-chat/types.ts");

const REL = "mbr1.relationship-ref-aaaa";
const CONV = "mbchat1.conversation-ref-aaaa";
const TOPIC = "mbrt1.topic-aaaaaaaa";
const counterpart = { displayName: "[DEMO] 飯友 測試帳號", mascotAvatarKey: "PB" };
const msg = (n, mine = true, body = `m${n}`) => Object.freeze({ messageRef: `mbmsg1.message-${String(n).padStart(8, "0")}`, mine, body, createdAt: `2026-09-28T03:49:0${n % 10}Z` });
const ok = (value) => Object.freeze({ ok: true, value });
const fail = (errorCode) => Object.freeze({ ok: false, errorCode });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
let uuidN = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`;

// Server fake: the canonical message list plus scripted/deferred answers per operation.
function harness({ initial = [], sendAnswers = [], listGate = null } = {}) {
  const server = { messages: [...initial] };
  const calls = [];
  let realtimeHandler = null;
  const repository = {
    source: "supabase-live",
    async open() { calls.push({ op: "open" }); return ok({ conversation: { conversationRef: CONV, counterpart }, realtimeTopic: TOPIC }); },
    async listMessages() {
      calls.push({ op: "list" });
      const snapshot = [...server.messages];
      if (listGate) { const gate = listGate.shift(); if (gate) await gate.promise; }
      return ok({ conversation: { conversationRef: CONV, counterpart }, messages: snapshot, nextCursor: null });
    },
    send(conversationRef, clientMessageId, body) {
      calls.push({ op: "send", clientMessageId, body });
      const answer = sendAnswers.shift();
      return answer && typeof answer.then === "function" ? answer : Promise.resolve(answer ?? fail("server_unavailable"));
    }
  };
  const realtime = { subscribe(topic, onActivity) { realtimeHandler = onActivity; return { unsubscribe() { realtimeHandler = null; } }; } };
  const controller = new MealBuddyChatController(repository, uuid, realtime);
  return { controller, server, calls, frame: () => realtimeHandler?.() };
}
const st = (c) => c.getState();
const refs = (c) => st(c).messages.map((m) => m.messageRef);

// ---- 1. THE race: realtime arrives before the HTTP acknowledgement
{
  const ack = deferred();
  const h = harness({ initial: [msg(1, false)], sendAnswers: [ack.promise] });
  await h.controller.setContext("actor-a", 1, REL);
  const sending = h.controller.send("GQA-6 DEMO 測試訊息");
  const key = st(h.controller).pendingSend?.clientMessageId;
  h.server.messages.push(msg(2, true, "GQA-6 DEMO 測試訊息")); // committed server-side
  h.frame(); // realtime delivered first
  await tick();
  check("A2-1 a realtime frame during an in-flight send defers reconciliation (no list read races the send)",
    h.calls.filter((c) => c.op === "list").length === 1, h.calls);
  ack.resolve(ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(2, true, "GQA-6 DEMO 測試訊息") }));
  const sent = await sending;
  check("A2-2 the acknowledgement is NOT orphaned by the realtime frame (send resolves true, pending cleared)",
    sent === true && st(h.controller).pendingSend === null, st(h.controller));
  await tick(); await tick();
  check("A2-3 the deferred reconciliation runs exactly once after the acknowledgement",
    h.calls.filter((c) => c.op === "list").length === 2 && h.calls.filter((c) => c.op === "open").length === 2, h.calls);
  const visible = st(h.controller).messages.filter((m) => m.body === "GQA-6 DEMO 測試訊息");
  check("A2-4 acknowledgement + realtime converge to exactly one visible canonical message and no pending row",
    visible.length === 1 && st(h.controller).pendingSend === null && refs(h.controller).length === 2, refs(h.controller));
  check("A2-5 one send used one clientMessageId for its single request", h.calls.filter((c) => c.op === "send").length === 1
    && h.calls.find((c) => c.op === "send").clientMessageId === key);
}

// ---- 2. timeout -> retryable (same key) -> retry collapses to the one canonical message
{
  const h = harness({ sendAnswers: [fail("network_error"), ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(3) })] });
  await h.controller.setContext("actor-a", 1, REL);
  await h.controller.send("hello");
  const pending = st(h.controller).pendingSend;
  check("A2-6 an uncertain/timed-out send becomes a retryable row that owns its text, never permanent sending",
    pending?.phase === "retryable" && pending.body === "hello", pending);
  const key = pending.clientMessageId;
  h.server.messages.push(msg(3)); // it had actually committed; a later frame shows it
  await h.controller.retrySend();
  const sends = h.calls.filter((c) => c.op === "send");
  check("A2-7 retry reuses the SAME clientMessageId", sends.length === 2 && sends[0].clientMessageId === key && sends[1].clientMessageId === key);
  check("A2-8 the idempotent acknowledgement dedupes by messageRef to exactly one message",
    refs(h.controller).filter((r) => r === msg(3).messageRef).length === 1 && st(h.controller).pendingSend === null, refs(h.controller));
}

// ---- 3. a reconciliation already in flight when the send starts cannot erase the acked message
{
  const heldPage = deferred();
  const listGate = [null, heldPage];
  const ack = deferred();
  const h = harness({ sendAnswers: [ack.promise], listGate });
  await h.controller.setContext("actor-a", 1, REL);
  h.frame(); // reconcile starts; its list read is held (pre-insert snapshot)
  await tick();
  const sending = h.controller.send("late page");
  h.server.messages.push(msg(4, true, "late page"));
  ack.resolve(ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(4, true, "late page") }));
  await sending;
  heldPage.resolve(); // the stale pre-insert page finally returns
  for (let i = 0; i < 6; i += 1) await tick();
  check("A2-9 a stale pre-send page never removes the acknowledged message",
    refs(h.controller).includes(msg(4).messageRef) && st(h.controller).pendingSend === null, refs(h.controller));
  check("A2-10 a fresh reconciliation re-runs after the send (the dropped stale read is re-queued)",
    h.calls.filter((c) => c.op === "list").length >= 3, h.calls);
}

// ---- 4. session scoping: an actor change orphans the old send by construction
{
  const ack = deferred();
  const h = harness({ sendAnswers: [ack.promise] });
  await h.controller.setContext("actor-a", 1, REL);
  const sending = h.controller.send("old actor");
  await h.controller.setContext("actor-b", 2, REL);
  ack.resolve(ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(5, true, "old actor") }));
  const result = await sending;
  check("A2-11 a send completing after an actor change does not write the new session",
    result === false && !refs(h.controller).includes(msg(5).messageRef) && st(h.controller).pendingSend === null, st(h.controller));
}

// ---- 5. one pending send at a time; admission rule mirrored by the composer
{
  const ack = deferred();
  const h = harness({ sendAnswers: [ack.promise, ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(6) })] });
  await h.controller.setContext("actor-a", 1, REL);
  const first = h.controller.send("one");
  const second = await h.controller.send("two");
  check("A2-12 a second submission while one is pending is not admitted (no second request)",
    second === false && h.calls.filter((c) => c.op === "send").length === 1);
  ack.resolve(ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(7, true, "one") }));
  await first;
  const rejected = await h.controller.send("   ");
  check("A2-13 a blank draft is not admitted and is flagged as rejected (the composer keeps it)",
    rejected === false && st(h.controller).draftRejected === true);
  check("A2-14 the composer's clear-on-accept rule is exactly the controller's admission rule",
    chatTypes.isSubmittableMealBuddyChatBody("x") && !chatTypes.isSubmittableMealBuddyChatBody("  ")
    && !chatTypes.isSubmittableMealBuddyChatBody("x".repeat(chatTypes.MEAL_BUDDY_CHAT_MAX_BODY_LENGTH + 1)));
}

// ---- 6. discard drops the row; the key goes with it
{
  const h = harness({ sendAnswers: [fail("network_error"), ok({ conversation: { conversationRef: CONV, counterpart }, message: msg(8) })] });
  await h.controller.setContext("actor-a", 1, REL);
  await h.controller.send("discard me");
  const oldKey = st(h.controller).pendingSend.clientMessageId;
  check("A2-15 discard removes the retryable row", h.controller.discardPendingSend() === true && st(h.controller).pendingSend === null);
  await h.controller.send("new message");
  check("A2-16 the next send after a discard is a NEW logical message (new key)",
    h.calls.filter((c) => c.op === "send")[1].clientMessageId !== oldKey);
}

// ---- 7. the repository bound
{
  const timers = [];
  const policy = Object.freeze({ timeoutMs: repositoryModule.MEAL_BUDDY_CHAT_REQUEST_TIMEOUT_MS,
    schedule(callback, delayMs) { const t = { callback, delayMs, cancelled: false }; timers.push(t); return () => { t.cancelled = true; }; } });
  const invocations = [];
  const session = { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "u" } } }) };
  const repo = new repositoryModule.SupabaseMealBuddyChatRepository(session,
    { functions: { invoke: (name, options) => { invocations.push(options); return new Promise(() => {}); } } }, policy);
  const pending = repo.send(CONV, "00000000-0000-4000-8000-000000000999", "hi");
  await tick();
  check("A2-17 the named chat bound is 15000 ms and the SDK request carries it",
    repositoryModule.MEAL_BUDDY_CHAT_REQUEST_TIMEOUT_MS === 15000 && invocations[0]?.timeout === 15000, invocations[0]);
  for (const t of timers) if (!t.cancelled) t.callback();
  const outcome = await pending;
  check("A2-18 a hung send settles as the uncertain network_error when the bound fires",
    outcome.ok === false && outcome.errorCode === "network_error", outcome);
  const aborted = new repositoryModule.SupabaseMealBuddyChatRepository(session,
    { functions: { invoke: async () => ({ data: null, error: { name: "FunctionsFetchError" } }) } });
  const abortedOutcome = await aborted.send(CONV, "00000000-0000-4000-8000-000000000998", "hi");
  check("A2-19 an aborted transport maps to network_error (retryable), not a server rejection",
    abortedOutcome.ok === false && abortedOutcome.errorCode === "network_error");
}

// ---- 8. the screen: composer clears on acceptance and never restores failed text
{
  const screen = fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx"), "utf8");
  const press = screen.slice(screen.indexOf("const body = draft;"), screen.indexOf("void controller.send(body);") + 30);
  check("A2-20 the composer clears before dispatch exactly under the admission rule, and never re-fills from a failure",
    /if \(state\.phase === "ready" && state\.pendingSend === null && isSubmittableMealBuddyChatBody\(body\)\) \{\s*setDraft\(""\);\s*\}\s*void controller\.send\(body\);/.test(press)
    && !/\.then\(\(sent\)/.test(screen) && !/setDraft\(state\.pendingSend|setDraft\(pending/.test(screen), press);
  check("A2-21 row-level retry and discard remain on the pending row",
    /pendingSend\?\.phase === "retryable"[\s\S]{0,200}retrySend\(\)[\s\S]{0,200}discardPendingSend\(\)/.test(screen));
}

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "pc1-meal-buddy-chat-reconciliation-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
