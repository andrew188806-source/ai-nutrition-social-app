#!/usr/bin/env node
// SR-2J-B behavioural smoke: the real Mobile chat repository and controller driven against a
// deterministic in-process transport. No network, no database, no credentials.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module";
const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");

// Load the real .ts modules unmodified.
require_.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, isolatedModules: true },
    fileName: filename
  });
  module._compile(out.outputText, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith(".") && parent?.filename) {
    const base = path.resolve(path.dirname(parent.filename), request);
    for (const ext of [".ts", ".tsx"]) if (fs.existsSync(base + ext)) return base + ext;
  }
  return origResolve.call(this, request, parent, ...rest);
};
const FEATURE = path.join(root, "apps/mobile/features/meal-buddy-chat");
const { SupabaseMealBuddyChatRepository, DisabledMealBuddyChatRepository } = require_(path.join(FEATURE, "repository.ts"));
const { MealBuddyChatController } = require_(path.join(FEATURE, "controller.ts"));
const { isSubmittableMealBuddyChatBody, MEAL_BUDDY_CHAT_MAX_BODY_LENGTH } = require_(path.join(FEATURE, "types.ts"));

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

const CONV = `mbchat1.${"c".repeat(180)}`;
const CONV2 = `mbchat1.${"d".repeat(180)}`;
const REL = `mbr1.${"r".repeat(180)}`;
const msgRef = (n) => `mbmsg1.${String(n).padStart(3, "0")}${"m".repeat(160)}`;
const counterpart = { displayName: "小夏", mascotAvatarKey: "DH" };
const conversation = (ref = CONV) => ({ conversationRef: ref, counterpart });
const message = (n, mine = false, body = `m${n}`) => ({
  messageRef: msgRef(n), mine, body, createdAt: new Date(1767225600000 + n * 60000).toISOString()
});
const okOpen = (ref = CONV) => ({ policyVersion: "meal-buddy-chat-v1", conversation: conversation(ref) });
const okList = (messages, nextCursor = null, ref = CONV) =>
  ({ policyVersion: "meal-buddy-chat-v1", conversation: conversation(ref), messages, nextCursor });
const okSend = (m, ref = CONV) => ({ policyVersion: "meal-buddy-chat-v1", conversation: conversation(ref), message: m });

const authPort = { getCurrentSession: async () => ({ ok: true, value: { userId: "actor", accessToken: "t" } }) };
// Records every transport call so "rendering causes zero chat calls" is provable, not asserted.
function transport(script) {
  const calls = [];
  const client = {
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, body: options.body });
        const step = script(options.body, calls.length);
        if (step?.throws) throw new Error("network down");
        return { data: step?.data ?? null, error: step?.error ?? null };
      }
    }
  };
  return { calls, repository: new SupabaseMealBuddyChatRepository(authPort, client) };
}
const uuidSeq = () => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------- ENTRY / lazy creation ----------------
{
  const { calls, repository } = transport(() => ({ data: okOpen() }));
  const controller = new MealBuddyChatController(repository, uuidSeq());
  check("constructing a chat controller performs zero transport calls", calls.length === 0);
  check("initial state is signed_out", controller.getState().phase === "signed_out");
  await controller.setContext(null, 1, REL);
  check("a signed-out actor performs zero transport calls", calls.length === 0);
}
{
  const { calls, repository } = transport((body) =>
    body.operation === "open" ? { data: okOpen() } : { data: okList([message(1)]) });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("entering the chat route opens exactly once", calls.filter((c) => c.body.operation === "open").length === 1);
  check("open carries only the opaque relationship ref",
    JSON.stringify(Object.keys(calls[0].body).sort()) === JSON.stringify(["operation", "relationshipRef"])
    && calls[0].body.relationshipRef === REL);
  check("open is immediately followed by exactly one initial page",
    calls.filter((c) => c.body.operation === "list_messages").length === 1);
  check("ready state exposes the current counterpart identity",
    controller.getState().phase === "ready" && controller.getState().counterpart.displayName === "小夏");
}
{
  const { calls, repository } = transport(() => ({ data: okOpen() }));
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, "not-a-ref");
  check("a malformed route ref fails closed with zero transport calls",
    calls.length === 0 && controller.getState().phase === "open_failed"
    && controller.getState().errorCode === "invalid_request");
  await controller.setContext("A", 1, `mbchat1.${"x".repeat(60)}`);
  check("a wrong-prefix route ref is rejected with zero transport calls",
    calls.length === 0 && controller.getState().phase === "open_failed");
}

// ---------------- OPEN validation ----------------
for (const [label, data] of [
  ["missing conversation", { policyVersion: "meal-buddy-chat-v1" }],
  ["wrong policy version", { policyVersion: "meal-buddy-chat-v2", conversation: conversation() }],
  ["extra top-level field", { ...okOpen(), extra: 1 }],
  ["counterpart with an extra private field", { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart: { ...counterpart, publicBio: "leak" } } }],
  ["counterpart carrying a uuid", { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart: { ...counterpart, userId: "de300001-0000-4000-8000-000000000001" } } }],
  ["conversation ref with the wrong prefix", { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: `mbr1.${"z".repeat(60)}`, counterpart } }],
  ["empty display name", { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart: { displayName: "", mascotAvatarKey: "DH" } } }]
]) {
  const { repository } = transport(() => ({ data }));
  const result = await repository.open(REL);
  check(`open rejects ${label}`, result.ok === false && result.errorCode === "invalid_server_response");
}

// ---------------- MESSAGES ----------------
{
  const { repository } = transport((body) =>
    body.operation === "open" ? { data: okOpen() } : { data: okList([message(1, false), message(2, true)]) });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  const state = controller.getState();
  check("initial page renders in canonical server order",
    state.messages.map((m) => m.body).join(",") === "m1,m2");
  check("mine and not-mine are preserved exactly",
    state.messages[0].mine === false && state.messages[1].mine === true);
  check("history exhausted when the server returns no cursor", state.olderPhase === "exhausted");
}
{
  const { repository } = transport((body) => body.operation === "open" ? { data: okOpen() } : { data: okList([]) });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("empty history is a valid ready state",
    controller.getState().phase === "ready" && controller.getState().messages.length === 0);
}
for (const [label, bad] of [
  ["a malformed message item", [{ messageRef: msgRef(1), mine: true, body: "x" }]],
  ["a message with an extra private field", [{ ...message(1), senderUserId: "de300001-0000-4000-8000-000000000001" }]],
  ["a message ref with the wrong prefix", [{ ...message(1), messageRef: `mbchat1.${"q".repeat(60)}` }]],
  ["a duplicate message ref in one page", [message(1), message(1)]],
  ["an over-long body", [{ ...message(1), body: "x".repeat(2001) }]],
  ["a non-boolean mine", [{ ...message(1), mine: "yes" }]]
]) {
  const { repository } = transport(() => ({ data: okList(bad) }));
  const result = await repository.listMessages(CONV, null, 30);
  check(`list rejects ${label}`, result.ok === false && result.errorCode === "invalid_server_response");
}
{
  const { repository } = transport(() => ({ data: { ...okList([message(1)]), nextCursor: "not-a-cursor" } }));
  const result = await repository.listMessages(CONV, null, 30);
  check("list rejects a malformed nextCursor", result.ok === false);
}

// ---------------- PAGINATION ----------------
{
  const cursor = msgRef(2);
  const { calls, repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.before === null) return { data: okList([message(3), message(4)], cursor) };
    return { data: okList([message(1), message(2)], null) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("first page keeps the server cursor and offers older history",
    controller.getState().olderPhase === "idle");
  await controller.loadOlder();
  const state = controller.getState();
  check("older page is prepended in canonical order",
    state.messages.map((m) => m.body).join(",") === "m1,m2,m3,m4");
  check("the older request used the exact server cursor",
    calls.some((c) => c.body.operation === "list_messages" && c.body.before === cursor));
  check("no cursor remains once history is exhausted", state.olderPhase === "exhausted");
  const before = calls.length;
  await controller.loadOlder();
  check("loading older is a no-op once exhausted", calls.length === before);
}
{
  const cursor = msgRef(2);
  const { repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.before === null) return { data: okList([message(2), message(3)], cursor) };
    return { data: okList([message(2), message(1)], null) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  await controller.loadOlder();
  const bodies = controller.getState().messages.map((m) => m.messageRef);
  check("a repeated item across the page seam is deduplicated",
    new Set(bodies).size === bodies.length && bodies.length === 3);
}
{
  let failNext = true;
  const { repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.before === null) return { data: okList([message(2)], msgRef(2)) };
    if (failNext) { failNext = false; return { throws: true }; }
    return { data: okList([message(1)], null) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  await controller.loadOlder();
  check("an older-page transport failure is retryable and keeps history",
    controller.getState().olderPhase === "failed" && controller.getState().messages.length === 1);
  await controller.loadOlder();
  check("retrying the older page succeeds and merges",
    controller.getState().messages.map((m) => m.body).join(",") === "m1,m2");
}

// ---------------- SEND + IDEMPOTENCY ----------------
check("empty body is not submittable", !isSubmittableMealBuddyChatBody(""));
check("whitespace-only body is not submittable", !isSubmittableMealBuddyChatBody("   \n "));
check("2000 characters is submittable", isSubmittableMealBuddyChatBody("x".repeat(MEAL_BUDDY_CHAT_MAX_BODY_LENGTH)));
check("2001 characters is not submittable", !isSubmittableMealBuddyChatBody("x".repeat(MEAL_BUDDY_CHAT_MAX_BODY_LENGTH + 1)));
{
  const { calls, repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.operation === "list_messages") return { data: okList([]) };
    return { data: okSend(message(9, true, body.body)) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  const before = calls.length;
  await controller.send("  ");
  check("a whitespace body performs no transport call", calls.length === before);
  check("a rejected draft is surfaced without a fake message",
    controller.getState().draftRejected === true && controller.getState().messages.length === 0);
  await controller.send("hello");
  const sends = calls.filter((c) => c.body.operation === "send");
  check("a valid send performs exactly one transport call", sends.length === 1);
  check("send carries only the frozen closed fields",
    JSON.stringify(Object.keys(sends[0].body).sort()) === JSON.stringify(["body", "clientMessageId", "conversationRef", "operation"]));
  check("no sender identifier is ever supplied", !("senderUserId" in sends[0].body));
  check("canonical message comes from the server response",
    controller.getState().messages.length === 1 && controller.getState().messages[0].messageRef === msgRef(9));
  check("pending send is cleared on definitive success", controller.getState().pendingSend === null);
}
{
  // Uncertain transport: the SAME logical message must retry under the SAME key.
  let attempt = 0;
  const { calls, repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.operation === "list_messages") return { data: okList([]) };
    attempt += 1;
    if (attempt === 1) return { throws: true };
    return { data: okSend(message(9, true, body.body)) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  await controller.send("uncertain");
  const pending = controller.getState().pendingSend;
  check("an uncertain send is retryable and preserves the body",
    pending?.phase === "retryable" && pending.body === "uncertain");
  check("no fake message was persisted on failure", controller.getState().messages.length === 0);
  const firstKey = pending.clientMessageId;
  await controller.retrySend();
  const sendCalls = calls.filter((c) => c.body.operation === "send");
  check("retry reuses the SAME idempotency key",
    sendCalls.length === 2 && sendCalls[0].body.clientMessageId === sendCalls[1].body.clientMessageId
    && sendCalls[1].body.clientMessageId === firstKey);
  check("retry reuses the same body", sendCalls[1].body.body === "uncertain");
  check("the reconciled message is canonical", controller.getState().messages[0].messageRef === msgRef(9));
  await controller.send("second logical message");
  const all = calls.filter((c) => c.body.operation === "send");
  check("a NEW logical message allocates a NEW key",
    all[2].body.clientMessageId !== firstKey);
}
{
  // Double tap while one logical send is unresolved must not produce a second key.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { calls, repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.operation === "list_messages") return { data: okList([]) };
    return { data: okSend(message(9, true, body.body)) };
  });
  const slow = {
    source: "supabase-live",
    open: (r) => repository.open(r),
    listMessages: (c, b, l) => repository.listMessages(c, b, l),
    send: async (c, k, b) => { await gate; return repository.send(c, k, b); }
  };
  const controller = new MealBuddyChatController(slow, uuidSeq());
  await controller.setContext("A", 1, REL);
  const first = controller.send("double");
  const second = controller.send("double");
  release();
  await Promise.all([first, second]);
  const sendCalls = calls.filter((c) => c.body.operation === "send");
  check("a double tap produces exactly one transport call and one key",
    sendCalls.length === 1 && new Set(sendCalls.map((c) => c.body.clientMessageId)).size === 1);
}
{
  // Abandoning an uncertain send discards its key; the next attempt is a NEW logical message.
  const { calls, repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (body.operation === "list_messages") return { data: okList([]) };
    if (body.body === "typo") return { throws: true };
    return { data: okSend(message(9, true, body.body)) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  await controller.send("typo");
  const abandonedKey = controller.getState().pendingSend.clientMessageId;
  controller.discardPendingSend();
  check("discarding an uncertain send clears the pending state", controller.getState().pendingSend === null);
  await controller.send("corrected");
  const sendCalls = calls.filter((c) => c.body.operation === "send");
  check("an edited body is a NEW logical send with a NEW key",
    sendCalls[1].body.body === "corrected" && sendCalls[1].body.clientMessageId !== abandonedKey);
}

// ---------------- AUTHORIZATION FAILURE (privacy gate) ----------------
{
  let authorized = true;
  const { repository } = transport((body) => {
    if (body.operation === "open") return { data: okOpen() };
    if (!authorized) return { error: { context: { json: async () => ({ error: { code: "invalid_request" } }) } } };
    return { data: okList([message(1), message(2)]) };
  });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("history is loaded before the safety change", controller.getState().messages.length === 2);
  authorized = false;
  await controller.refresh();
  const state = controller.getState();
  check("an authorization failure moves the screen to unavailable", state.phase === "unavailable");
  check("previously loaded history is cleared, not retained", state.messages === undefined);
  check("the unavailable state carries no counterpart identity", state.counterpart === undefined);
  const blocked = await controller.send("after revocation");
  check("sending is impossible once unavailable", blocked === false);
  const older = await controller.loadOlder();
  check("loading older is impossible once unavailable", older === false);
}
{
  // A late in-flight page must not repopulate a screen that already failed closed.
  let releaseList;
  const listGate = new Promise((resolve) => { releaseList = resolve; });
  let first = true;
  const repository = {
    source: "supabase-live",
    open: async () => ({ ok: true, value: { conversation: { conversationRef: CONV, counterpart } } }),
    listMessages: async () => {
      if (first) { first = false; return { ok: true, value: { conversation: { conversationRef: CONV, counterpart }, messages: [message(1)], nextCursor: msgRef(1) } }; }
      await listGate;
      return { ok: true, value: { conversation: { conversationRef: CONV, counterpart }, messages: [message(0)], nextCursor: null } };
    },
    send: async () => ({ ok: false, errorCode: "invalid_request" })
  };
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  const older = controller.loadOlder();
  await controller.send("revoked");
  check("a decisive send rejection fails the screen closed", controller.getState().phase === "unavailable");
  releaseList();
  await older;
  await settle();
  check("a late older-page completion cannot repopulate the failed screen",
    controller.getState().phase === "unavailable" && controller.getState().messages === undefined);
}

// ---------------- ACTOR / SESSION SAFETY ----------------
{
  let releaseA;
  const gateA = new Promise((resolve) => { releaseA = resolve; });
  let actor = "A";
  const repository = {
    source: "supabase-live",
    open: async () => ({ ok: true, value: { conversation: { conversationRef: CONV, counterpart: actor === "A" ? counterpart : { displayName: "Momo", mascotAvatarKey: "TE" } } } }),
    listMessages: async () => {
      const who = actor;
      if (who === "A") { await gateA; return { ok: true, value: { conversation: { conversationRef: CONV, counterpart }, messages: [message(1, false, "A-only")], nextCursor: null } }; }
      return { ok: true, value: { conversation: { conversationRef: CONV2, counterpart: { displayName: "Momo", mascotAvatarKey: "TE" } }, messages: [message(2, false, "B-only")], nextCursor: null } };
    },
    send: async () => ({ ok: false, errorCode: "network_error" })
  };
  const controller = new MealBuddyChatController(repository, uuidSeq());
  const firstLoad = controller.setContext("A", 1, REL);
  actor = "B";
  const secondLoad = controller.setContext("B", 2, REL);
  releaseA();
  await Promise.all([firstLoad, secondLoad]);
  await settle();
  const state = controller.getState();
  check("a late previous-actor page cannot render for the new actor",
    state.phase === "ready" && state.messages.every((m) => m.body !== "A-only"));
  check("the new actor sees only its own counterpart identity", state.counterpart.displayName === "Momo");
}
{
  const { repository } = transport((body) => body.operation === "open" ? { data: okOpen() } : { data: okList([message(1)]) });
  const controller = new MealBuddyChatController(repository, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("chat state exists before sign-out", controller.getState().phase === "ready");
  await controller.setContext(null, 2, REL);
  const state = controller.getState();
  check("sign-out clears chat ref, messages, counterpart and pending send",
    state.phase === "signed_out" && state.messages === undefined && state.counterpart === undefined);
  const sent = await controller.send("after sign out");
  check("sending after sign-out is impossible", sent === false);
}
{
  const disabled = new DisabledMealBuddyChatRepository();
  const controller = new MealBuddyChatController(disabled, uuidSeq());
  await controller.setContext("A", 1, REL);
  check("a disabled runtime fails closed without transport",
    controller.getState().phase === "open_failed" && controller.getState().errorCode === "operation_not_enabled");
}

console.log(JSON.stringify({
  suite: "meal-buddy-chat-sr2j-b-smoke",
  proofKind: "real Mobile chat repository and controller with deterministic in-process transport",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
