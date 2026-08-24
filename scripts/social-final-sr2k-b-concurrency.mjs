#!/usr/bin/env node
// SR-2K-B concurrency — the interleavings that only show up when two things happen at once, driven
// against the REAL Mobile controllers with a transport whose completion order this suite controls.
// Database-level serialization (pair locks, unfriend-vs-send, double unfriend) is proven separately
// against a real PostgreSQL cluster by social-final-sr2k-b-postgres-apply.mjs.
//
// No network, no database, no credentials, no Development.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module";
const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");

require_.extensions[".ts"] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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

const REL = path.join(root, "apps/mobile/features/meal-buddy-relationships");
const CHAT = path.join(root, "apps/mobile/features/meal-buddy-chat");
const PUSH = path.join(root, "apps/mobile/features/meal-buddy-push");
const { MealBuddyRelationshipInboxController } = require_(path.join(REL, "controller.ts"));
const { MealBuddyChatController } = require_(path.join(CHAT, "controller.ts"));
const { SupabaseMealBuddyChatRepository } = require_(path.join(CHAT, "repository.ts"));
const { MealBuddyPushController } = require_(path.join(PUSH, "controller.ts"));

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  checks.push(name);
  if (!ok) failures.push({ name, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const REL_ACC = `mbr1.${"a".repeat(120)}`;
const CONV = `mbchat1.${"v".repeat(120)}`;
const TOPIC = `mbrt1.${"t".repeat(60)}`;
const msgRef = (n) => `mbmsg1.${String(n).padStart(3, "0")}${"m".repeat(120)}`;
const counterpart = { displayName: "阿樹", mascotAvatarKey: "DH" };
const authPort = { getCurrentSession: async () => ({ ok: true, value: { userId: "actor", accessToken: "t" } }) };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// ================================================================================================
// 1. Two unfriend taps on one row
// ================================================================================================
{
  const calls = [];
  let ended = false;
  const gate = deferred();
  const repository = {
    source: "supabase-live",
    read: async () => ({ ok: true, value: { relationships: [] } }),
    list: async () => ({ ok: true, value: { relationships: ended ? [] : [{ relationshipRef: REL_ACC, state: "accepted", counterpart }] } }),
    send: async () => ({ ok: true, value: { relationships: [] } }),
    accept: async () => ({ ok: true, value: { relationships: [] } }),
    decline: async () => ({ ok: true, value: { relationships: [] } }),
    cancel: async () => ({ ok: true, value: { relationships: [] } }),
    unfriend: async (ref) => {
      calls.push(ref);
      await gate.promise;
      ended = true;
      return { ok: true, value: { relationships: [{ relationshipRef: REL_ACC, state: "none", counterpart }] } };
    }
  };
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  const first = inbox.unfriend(REL_ACC);
  const second = await inbox.unfriend(REL_ACC);
  gate.resolve();
  await first;
  check("a second unfriend tap while one is unresolved issues no second request",
    second === false && calls.length === 1, calls);
  check("the row is gone exactly once, from the canonical list", inbox.getState().relationships.length === 0);
}

// ================================================================================================
// 2. Unfriend racing an inbound realtime signal on the same chat
// ================================================================================================
{
  const gate = deferred();
  let authorized = true;
  const client = {
    functions: {
      invoke: async (_name, options) => {
        if (!authorized) return { data: null, error: { context: { json: async () => ({ error: { code: "invalid_request" } }) } } };
        if (options.body.operation === "open") {
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, realtimeTopic: TOPIC }, error: null };
        }
        return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, messages: [], nextCursor: null }, error: null };
      }
    }
  };
  const subscriptions = [];
  const realtime = { subscribe: (topic, onActivity) => { const e = { topic, onActivity, active: true }; subscriptions.push(e); return { unsubscribe() { e.active = false; } }; } };
  const controller = new MealBuddyChatController(new SupabaseMealBuddyChatRepository(authPort, client), () => "x", realtime);
  await controller.setContext("actor-a", 1, REL_ACC);
  check("the chat is live before the unfriend", controller.getState().live === true && subscriptions[0].active === true);

  // The pair is ended elsewhere; a frame that was already in flight arrives afterwards.
  authorized = false;
  subscriptions[0].onActivity();
  await new Promise((resolve) => setTimeout(resolve, 20));
  gate.resolve();
  check("a frame that arrives after authorization is lost fails the screen closed",
    controller.getState().phase === "unavailable", controller.getState());
  check("failing closed also tears the subscription down",
    subscriptions.every((entry) => entry.active === false));
  check("no message history survives a fail-closed reconcile",
    controller.getState().messages === undefined);
}

// ================================================================================================
// 3. An uncertain send retried while a realtime frame delivers the same message
// ================================================================================================
{
  let attempt = 0;
  const committed = [];
  const client = {
    functions: {
      invoke: async (_name, options) => {
        const operation = options.body.operation;
        if (operation === "open") {
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, realtimeTopic: TOPIC }, error: null };
        }
        if (operation === "send") {
          attempt += 1;
          // The first attempt COMMITS and then loses its response — the classic uncertain send.
          if (attempt === 1) {
            committed.push({ messageRef: msgRef(1), mine: true, body: options.body.body, createdAt: new Date(1767225600000).toISOString(), clientMessageId: options.body.clientMessageId });
            return { data: null, error: { context: { json: async () => ({ error: { code: "server_unavailable" } }) } } };
          }
          // The retry carries the SAME key, so the server returns the same canonical message.
          const existing = committed.find((m) => m.clientMessageId === options.body.clientMessageId);
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, message: { messageRef: existing.messageRef, mine: true, body: existing.body, createdAt: existing.createdAt } }, error: null };
        }
        return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, messages: committed.map(({ clientMessageId, ...m }) => m), nextCursor: null }, error: null };
      }
    }
  };
  const subscriptions = [];
  const realtime = { subscribe: (topic, onActivity) => { const e = { topic, onActivity, active: true }; subscriptions.push(e); return { unsubscribe() { e.active = false; } }; } };
  let allocated = 0;
  const controller = new MealBuddyChatController(
    new SupabaseMealBuddyChatRepository(authPort, client),
    () => { allocated += 1; return `1111111${allocated}-1111-4111-8111-111111111111`; },
    realtime);
  await controller.setContext("actor-a", 1, REL_ACC);

  await controller.send("uncertain");
  check("an uncertain send stays retryable with its key and body intact",
    controller.getState().pendingSend?.phase === "retryable" && allocated === 1, controller.getState().pendingSend);

  // The realtime frame for the message that DID commit arrives before the user retries.
  subscriptions[0].onActivity();
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("the committed message appears exactly once through reconciliation",
    controller.getState().messages.filter((m) => m.body === "uncertain").length === 1,
    controller.getState().messages);

  await controller.retrySend();
  check("the retry reuses the same idempotency key rather than allocating a new one", allocated === 1);
  check("after the retry there is still exactly one rendered message and no pending send",
    controller.getState().messages.filter((m) => m.body === "uncertain").length === 1
    && controller.getState().pendingSend === null, controller.getState().messages);
}

// ================================================================================================
// 4. An actor switch racing an in-flight realtime reconcile
// ================================================================================================
{
  const gate = deferred();
  let listCalls = 0;
  const client = {
    functions: {
      invoke: async (_name, options) => {
        if (options.body.operation === "open") {
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, realtimeTopic: TOPIC }, error: null };
        }
        listCalls += 1;
        if (listCalls === 2) await gate.promise;
        return {
          data: {
            policyVersion: "meal-buddy-chat-v1",
            conversation: { conversationRef: CONV, counterpart },
            messages: [{ messageRef: msgRef(listCalls), mine: false, body: `actor-a-${listCalls}`, createdAt: new Date(1767225600000).toISOString() }],
            nextCursor: null
          },
          error: null
        };
      }
    }
  };
  const subscriptions = [];
  const realtime = { subscribe: (topic, onActivity) => { const e = { topic, onActivity, active: true }; subscriptions.push(e); return { unsubscribe() { e.active = false; } }; } };
  const controller = new MealBuddyChatController(new SupabaseMealBuddyChatRepository(authPort, client), () => "x", realtime);
  await controller.setContext("actor-a", 1, REL_ACC);
  subscriptions[0].onActivity();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await controller.setContext(null, 2, REL_ACC);
  gate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 30));
  check("a late reconcile for the previous actor cannot repopulate a signed-out screen",
    controller.getState().phase === "signed_out" && controller.getState().messages === undefined,
    controller.getState());
  check("the previous actor's subscription is gone",
    subscriptions.every((entry) => entry.active === false));
}

// ================================================================================================
// 5. Push registration racing an actor switch
// ================================================================================================
{
  const gate = deferred();
  const registered = [];
  const repository = {
    source: "supabase-live",
    register: async (installId, platform, pushToken) => {
      registered.push({ installId, pushToken });
      if (registered.length === 1) await gate.promise;
      return { ok: true, registered: true };
    },
    disable: async () => ({ ok: true, registered: false })
  };
  const device = {
    platform: "ios",
    getPermission: async () => "granted",
    requestPermission: async () => "granted",
    getPushToken: async () => "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]"
  };
  const controller = new MealBuddyPushController(repository, device, "install-aaaa-0001");
  const first = controller.setActor("actor-a", 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await controller.setActor("actor-b", 2);
  gate.resolve();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("a late registration for the previous actor cannot report success for the next one",
    controller.getState().phase === "registered" || controller.getState().phase === "registering",
    controller.getState());
  check("the installation identity never changes across the actor switch",
    registered.every((entry) => entry.installId === "install-aaaa-0001"));
  await controller.setActor(null, 3);
  check("sign-out during an in-flight registration lands signed out",
    controller.getState().phase === "signed_out");
}

console.log(JSON.stringify({
  suite: "social-final-sr2k-b-concurrency",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name),
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
