#!/usr/bin/env node
// SR-2K-B behavioural smoke — the REAL Mobile relationship, chat and push modules driven against
// deterministic in-process doubles. No network, no database, no credentials, no Development.
//
// Everything that lives in a controller or repository is executed for real. The handful of rules
// that live only in JSX are asserted against the frozen component contract and are named as such.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module";
const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");

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

const REL = path.join(root, "apps/mobile/features/meal-buddy-relationships");
const CHAT = path.join(root, "apps/mobile/features/meal-buddy-chat");
const PUSH = path.join(root, "apps/mobile/features/meal-buddy-push");
const { MealBuddyRelationshipInboxController, MealBuddyRelationshipProfileController } = require_(path.join(REL, "controller.ts"));
const { SupabaseMealBuddyRelationshipRepository } = require_(path.join(REL, "repository.ts"));
const { MealBuddyChatController } = require_(path.join(CHAT, "controller.ts"));
const { SupabaseMealBuddyChatRepository } = require_(path.join(CHAT, "repository.ts"));
const { MealBuddyPushController } = require_(path.join(PUSH, "controller.ts"));
const { SupabaseMealBuddyPushRepository } = require_(path.join(PUSH, "repository.ts"));
const { resolveMealBuddyPushRoute } = require_(path.join(PUSH, "types.ts"));

const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const source = {
  inbox: read("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx"),
  panel: read("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx"),
  confirm: read("apps/mobile/features/meal-buddy-relationships/MealBuddyUnfriendConfirm.tsx"),
  chatScreen: read("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx"),
  pushCard: read("apps/mobile/features/meal-buddy-push/MealBuddyPushPermissionCard.tsx"),
  home: read("apps/mobile/app/meal-buddies.tsx"),
  i18n: read("lib/i18n/zh-TW.ts")
};

const checks = []; const failures = []; const contractOnly = [];
const check = (name, ok, detail) => {
  checks.push(name);
  if (!ok) failures.push({ name, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};
const contract = (name, ok, note) => { contractOnly.push({ name, note }); check(`${name} [CONTRACT: ${note}]`, ok); };

// --- fixtures ---------------------------------------------------------------------------------
const REL_ACC = `mbr1.${"a".repeat(120)}`;
const REL_NEW = `mbr1.${"b".repeat(120)}`;
const CANDIDATE = `scr1.${"c".repeat(120)}`;
const CONV = `mbchat1.${"v".repeat(120)}`;
const TOPIC = `mbrt1.${"t".repeat(60)}`;
const msgRef = (n) => `mbmsg1.${String(n).padStart(3, "0")}${"m".repeat(120)}`;
const counterpart = { displayName: "阿樹", mascotAvatarKey: "DH" };
const row = (ref, state) => ({ relationshipRef: ref, state, counterpart });
const ok = (relationships) => ({ ok: true, value: { relationships } });
const fail = (errorCode) => ({ ok: false, errorCode });
const authPort = { getCurrentSession: async () => ({ ok: true, value: { userId: "actor", accessToken: "t" } }) };

function relRepo(script) {
  const calls = [];
  return {
    calls,
    repository: {
      source: "supabase-live",
      read: async (candidateRef) => { calls.push({ op: "read", candidateRef }); return script("read", calls.length); },
      list: async () => { calls.push({ op: "list" }); return script("list", calls.length); },
      send: async (candidateRef) => { calls.push({ op: "send", candidateRef }); return script("send", calls.length); },
      accept: async (ref) => { calls.push({ op: "accept", ref }); return script("accept", calls.length); },
      decline: async (ref) => { calls.push({ op: "decline", ref }); return script("decline", calls.length); },
      cancel: async (ref) => { calls.push({ op: "cancel", ref }); return script("cancel", calls.length); },
      unfriend: async (ref) => { calls.push({ op: "unfriend", ref }); return script("unfriend", calls.length); }
    }
  };
}

// ================================================================================================
// PART A — UNFRIEND
// ================================================================================================
{
  let ended = false;
  const { repository, calls } = relRepo((op) => {
    if (op === "unfriend") { ended = true; return ok([row(REL_ACC, "none")]); }
    if (op === "read") return ok(ended ? [] : [row(REL_ACC, "accepted")]);
    return ok([]);
  });
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  check("an accepted profile can be unfriended and reconciles to none",
    (await profile.unfriend()) === true && profile.getState().relationship.state === "none"
    && calls.filter((c) => c.op === "unfriend").length === 1, profile.getState());
}
{
  const { repository, calls } = relRepo((op) => op === "read" ? ok([row(REL_ACC, "outgoing_pending")]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  check("a pending relationship cannot be unfriended and issues no request",
    (await profile.unfriend()) === false && calls.filter((c) => c.op === "unfriend").length === 0);
}
{
  const { repository, calls } = relRepo((op) => op === "read" ? ok([]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  check("a none relationship cannot be unfriended",
    (await profile.unfriend()) === false && calls.filter((c) => c.op === "unfriend").length === 0);
}
{
  let ended = false;
  const { repository, calls } = relRepo((op) => {
    if (op === "unfriend") { ended = true; return ok([row(REL_ACC, "none")]); }
    return ok(ended ? [] : [row(REL_ACC, "accepted")]);
  });
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  check("the established buddy is listed before the unfriend",
    inbox.getState().relationships.length === 1 && inbox.getState().relationships[0].state === "accepted");
  const done = await inbox.unfriend(REL_ACC);
  check("unfriending removes the buddy because the canonical list says so",
    done === true && inbox.getState().relationships.length === 0
    && calls.filter((c) => c.op === "list").length === 2, inbox.getState());
  const second = await inbox.unfriend(REL_ACC);
  check("a second unfriend on a vanished row issues no further request",
    second === false && calls.filter((c) => c.op === "unfriend").length === 1);
}
{
  const { repository } = relRepo((op) => op === "unfriend" ? fail("server_unavailable") : ok([row(REL_ACC, "accepted")]));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  const done = await inbox.unfriend(REL_ACC);
  check("a failed unfriend never fakes the ended state and stays recoverable",
    done === false && inbox.getState().relationships[0].state === "accepted"
    && inbox.getState().errorCode === "server_unavailable" && inbox.getState().pendingAction === null);
}
{
  const calls = [];
  const client = { functions: { invoke: async (name, options) => { calls.push(options.body); return { data: null, error: {} }; } } };
  const repository = new SupabaseMealBuddyRelationshipRepository(authPort, client);
  await repository.unfriend(CANDIDATE);
  await repository.unfriend("not-a-ref");
  check("unfriend refuses anything that is not an mbr1 reference before transport", calls.length === 0);
  const good = new SupabaseMealBuddyRelationshipRepository(authPort, {
    functions: { invoke: async (_n, o) => { calls.push(o.body); return { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [row(REL_ACC, "none")] }, error: null }; } }
  });
  const result = await good.unfriend(REL_ACC);
  check("a well-formed unfriend reaches the frozen endpoint with only the opaque ref",
    result.ok === true && JSON.stringify(calls.at(-1)) === JSON.stringify({ operation: "unfriend", relationshipRef: REL_ACC }));
  const wrong = new SupabaseMealBuddyRelationshipRepository(authPort, {
    functions: { invoke: async () => ({ data: { policyVersion: "meal-buddy-relationship-v1", relationships: [row(REL_ACC, "accepted")] }, error: null }) }
  });
  check("an unfriend that comes back still accepted fails the closed Mobile contract",
    (await wrong.unfriend(REL_ACC)).ok === false);
}
contract("ending a relationship is confirmed before anything is sent",
  /MealBuddyUnfriendConfirm/.test(source.inbox) && /MealBuddyUnfriendConfirm/.test(source.panel)
  && /onRequestEnd\(relationship\.relationshipRef\)/.test(source.inbox),
  "the confirmation sheet is JSX and cannot be mounted in Node");
contract("the confirmation explains the loss of chat without implying a block",
  source.i18n.includes("不能再用聊天聯絡") && source.i18n.includes("這不會封鎖對方"),
  "copy is asserted in the shared zh-TW bundle");

// ================================================================================================
// PART B — REALTIME
// ================================================================================================
function chatTransport({ topic = TOPIC, messages = [] } = {}) {
  const calls = [];
  let current = [...messages];
  const client = {
    functions: {
      invoke: async (_name, options) => {
        calls.push(options.body.operation);
        if (options.body.operation === "open") {
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, realtimeTopic: topic }, error: null };
        }
        if (options.body.operation === "send") {
          const message = { messageRef: msgRef(current.length + 1), mine: true, body: options.body.body, createdAt: new Date(1767225600000 + current.length * 1000).toISOString() };
          current.push(message);
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, message }, error: null };
        }
        return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, messages: [...current], nextCursor: null }, error: null };
      }
    }
  };
  return { calls, client, push: (message) => current.push(message), snapshot: () => [...current] };
}
function realtimePort() {
  const subscriptions = [];
  return {
    subscriptions,
    port: {
      subscribe(topic, onActivity) {
        const entry = { topic, onActivity, active: true };
        subscriptions.push(entry);
        return { unsubscribe() { entry.active = false; } };
      }
    }
  };
}
{
  const transport = chatTransport();
  const realtime = realtimePort();
  const controller = new MealBuddyChatController(
    new SupabaseMealBuddyChatRepository(authPort, transport.client), () => "11111111-1111-4111-8111-111111111111", realtime.port);
  await controller.setContext("actor-a", 1, REL_ACC);
  check("an authorized open subscribes to exactly the topic the server issued",
    realtime.subscriptions.length === 1 && realtime.subscriptions[0].topic === TOPIC
    && realtime.subscriptions[0].active === true && controller.getState().live === true);

  transport.push({ messageRef: msgRef(9), mine: false, body: "from the counterpart", createdAt: new Date(1767225700000).toISOString() });
  realtime.subscriptions[0].onActivity();
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("a realtime signal reconciles the new canonical message without a manual refresh",
    controller.getState().messages.some((m) => m.body === "from the counterpart"), controller.getState().messages);
  check("reconciliation re-reads canonical history rather than trusting the frame",
    transport.calls.filter((op) => op === "list_messages").length >= 2);

  const beforeCount = controller.getState().messages.length;
  await controller.send("mine");
  realtime.subscriptions[0].onActivity();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const bodies = controller.getState().messages.map((m) => m.body);
  check("a send response plus a realtime frame render one message, not two",
    bodies.filter((body) => body === "mine").length === 1 && controller.getState().messages.length === beforeCount + 1, bodies);
  // The server's list order is authoritative. The fixture deliberately hands back an order that is
  // NOT the order the frames arrived in, so rendering by arrival would be visible here.
  check("canonical server ordering is preserved, not arrival order",
    controller.getState().messages.map((m) => m.messageRef).join(",")
      === transport.snapshot().map((m) => m.messageRef).join(","),
    { rendered: controller.getState().messages.map((m) => m.messageRef), server: transport.snapshot().map((m) => m.messageRef) });

  await controller.setContext("actor-b", 2, REL_ACC);
  check("an actor switch unsubscribes the previous actor's channel",
    realtime.subscriptions[0].active === false);
  await controller.setContext(null, 3, REL_ACC);
  check("sign-out leaves no active subscription and clears chat state",
    realtime.subscriptions.every((entry) => entry.active === false) && controller.getState().phase === "signed_out");
}
{
  const transport = chatTransport({ topic: null });
  const realtime = realtimePort();
  const controller = new MealBuddyChatController(
    new SupabaseMealBuddyChatRepository(authPort, transport.client), () => "x", realtime.port);
  await controller.setContext("actor-a", 1, REL_ACC);
  check("a conversation with no topic is fully usable and simply not live",
    controller.getState().phase === "ready" && controller.getState().live === false && realtime.subscriptions.length === 0);
}
{
  const client = { functions: { invoke: async () => ({ data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: CONV, counterpart }, realtimeTopic: "not-a-topic" }, error: null }) } };
  const repository = new SupabaseMealBuddyChatRepository(authPort, client);
  check("a malformed realtime topic fails the closed Mobile contract", (await repository.open(REL_ACC)).ok === false);
}
{
  const realtime = realtimePort();
  const client = { functions: { invoke: async (_n, o) => o.body.operation === "open"
    ? { data: null, error: {} }
    : { data: null, error: {} } } };
  const controller = new MealBuddyChatController(new SupabaseMealBuddyChatRepository(authPort, client), () => "x", realtime.port);
  await controller.setContext("actor-a", 1, REL_ACC);
  check("a chat that never opened subscribes to nothing",
    realtime.subscriptions.length === 0 && controller.getState().phase === "open_failed");
}

// ================================================================================================
// PART C — PUSH
// ================================================================================================
function devicePort({ platform = "ios", permission = "undetermined", token = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]" } = {}) {
  const calls = [];
  let current = permission;
  return {
    calls,
    port: {
      platform,
      async getPermission() { calls.push("get"); return current; },
      async requestPermission() { calls.push("request"); current = permission === "undetermined" ? "granted" : permission; return current; },
      async getPushToken() { calls.push("token"); return token; }
    },
    deny() { current = "denied"; }
  };
}
function pushRepo(outcome = { ok: true, registered: true }) {
  const calls = [];
  return {
    calls,
    repository: {
      source: "supabase-live",
      register: async (installId, platform, pushToken) => { calls.push({ op: "register", installId, platform, pushToken }); return outcome; },
      disable: async (installId) => { calls.push({ op: "disable", installId }); return { ok: true, registered: false }; }
    }
  };
}
{
  const device = devicePort({ permission: "granted" });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("an already-granted permission registers without prompting",
    controller.getState().phase === "registered" && !device.calls.includes("request")
    && repo.calls[0]?.op === "register", { state: controller.getState(), calls: device.calls });
}
{
  const device = devicePort({ permission: "undetermined" });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("an undecided permission never prompts on sign-in", controller.getState().phase === "idle" && !device.calls.includes("request"));
  check("the explicit gesture prompts once and registers", (await controller.requestPermissionAndRegister()) === true
    && controller.getState().phase === "registered");
  check("a second gesture in the same session does not prompt again",
    (await controller.requestPermissionAndRegister()) === false
    && device.calls.filter((c) => c === "request").length === 1);
}
{
  const device = devicePort({ permission: "denied" });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("a denied permission is a settled state that registers nothing",
    controller.getState().phase === "denied" && repo.calls.length === 0);
  check("a denial never throws and never blocks Social", (await controller.requestPermissionAndRegister()) === false);
}
{
  const device = devicePort({ platform: null });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("an unsupported platform is a resting state, never an error",
    controller.getState().phase === "unsupported" && repo.calls.length === 0);
}
{
  const device = devicePort({ permission: "granted", token: null });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("a build that cannot mint a token reports unsupported and registers nothing",
    controller.getState().phase === "unsupported" && repo.calls.length === 0);
}
{
  const device = devicePort({ permission: "granted" });
  const repo = pushRepo({ ok: false, errorCode: "server_unavailable" });
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  check("a failed registration is reported without retrying in a loop",
    controller.getState().phase === "failed" && repo.calls.filter((c) => c.op === "register").length === 1);
}
{
  const device = devicePort({ permission: "granted" });
  const repo = pushRepo();
  const controller = new MealBuddyPushController(repo.repository, device.port, "install-aaaa-0001");
  await controller.setActor("actor-a", 1);
  await controller.setActor("actor-b", 2);
  check("a new actor re-registers this installation for itself and inherits no prompt history",
    repo.calls.filter((c) => c.op === "register").length === 2
    && repo.calls.every((c) => c.installId === "install-aaaa-0001"));
  await controller.setActor(null, 3);
  check("sign-out clears push state", controller.getState().phase === "signed_out");
}
{
  const calls = [];
  const client = { functions: { invoke: async (_n, o) => { calls.push(o.body); return { data: { policyVersion: "meal-buddy-push-v1", registered: true }, error: null }; } } };
  const repository = new SupabaseMealBuddyPushRepository(authPort, client);
  await repository.register("short", "ios", "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]");
  await repository.register("install-aaaa-0001", "web", "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]");
  check("a malformed registration never reaches transport", calls.length === 0);
  const result = await repository.register("install-aaaa-0001", "ios", "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]");
  check("a valid registration names only the install, platform and token — never a user",
    result.ok === true && Object.keys(calls[0]).sort().join(",") === "installId,operation,platform,pushToken"
    && !JSON.stringify(calls[0]).includes("actor") && !JSON.stringify(calls[0]).includes("userId"));
  const widened = new SupabaseMealBuddyPushRepository(authPort, {
    functions: { invoke: async () => ({ data: { policyVersion: "meal-buddy-push-v1", registered: true, pushToken: "leak" }, error: null }) }
  });
  check("a widened registration response fails the closed Mobile contract",
    (await widened.register("install-aaaa-0001", "ios", "ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]")).ok === false);
}
{
  const valid = { kind: "meal_buddy_message_received", route: "meal-buddies", section: "friends" };
  check("an authorized notification payload resolves to the safe relationship surface",
    JSON.stringify(resolveMealBuddyPushRoute(valid)) === JSON.stringify({ pathname: "/meal-buddies", section: "friends" }));
  check("every unauthorized or forged payload routes nowhere",
    [null, undefined, {}, { kind: "other", route: "meal-buddies", section: "friends" },
      { kind: "meal_buddy_message_received", route: "/meal-buddy-chat/[relationshipRef]", section: "friends" },
      { kind: "meal_buddy_message_received", route: "meal-buddies", section: "admin" },
      { kind: "meal_buddy_message_received", relationshipRef: "mbr1.x", route: "meal-buddies", section: "friends" }]
      .filter((payload) => payload && payload.relationshipRef === undefined)
      .every((payload) => resolveMealBuddyPushRoute(payload) === null)
    && resolveMealBuddyPushRoute({ kind: "meal_buddy_message_received", route: "meal-buddies" }) === null);
  check("no notification payload can carry a navigation identifier at all",
    !/relationshipRef|conversationRef|messageRef|userId/.test(read("apps/mobile/features/meal-buddy-push/types.ts").split("resolveMealBuddyPushRoute")[1] ?? ""));
}
contract("the permission surface appears in the real relationship area and gates nothing",
  /<MealBuddyPushPermissionCard controller={realPush} \/>/.test(source.home)
  && /isRealCandidateMode \? \(\s*<MealBuddyRelationshipInbox/.test(source.home),
  "the card is JSX; the frozen inbox shape is asserted unchanged beside it");
contract("a notification tap opens the canonical relationship area and re-resolves state",
  /useMealBuddyPushRouting\(openRelationshipAreaFromNotification\)/.test(source.home),
  "expo-notifications response listeners need a mounted app");

// ================================================================================================
// CROSS-CUTTING
// ================================================================================================
check("no deferred chat feature appears in any SR-2K-B Mobile surface",
  !/typingIndicator|isTyping|presenceState|onlineStatus|readReceipt|seenAt|deliveredAt|editMessage|deleteMessage|groupChat|unreadCount/i
    .test(`${source.inbox}\n${source.panel}\n${source.chatScreen}\n${source.pushCard}\n${source.confirm}`));
check("realtime introduces no polling anywhere in the chat feature",
  !/setInterval/.test(read("apps/mobile/features/meal-buddy-chat/controller.ts") + read("apps/mobile/features/meal-buddy-chat/supabaseRealtime.ts")));
check("no tier rule reaches unfriend, realtime or push",
  !/isPremium|entitlement|premium_tier|quota/i.test(
    read("apps/mobile/features/meal-buddy-relationships/controller.ts")
    + read("apps/mobile/features/meal-buddy-chat/controller.ts")
    + read("apps/mobile/features/meal-buddy-push/controller.ts")));

console.log(JSON.stringify({
  suite: "social-final-sr2k-b-smoke",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), contractOnly,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
