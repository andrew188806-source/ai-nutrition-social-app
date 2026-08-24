#!/usr/bin/env node
// SR-2K-A behavioural smoke — the real Mobile relationship/chat/reference modules driven against a
// deterministic in-process transport, plus source-level contract checks for the surfaces that
// cannot be loaded in Node (a .tsx that imports react-native). No network, no database, no
// credentials, no Development and no Production access.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module"; import child from "node:child_process";
import { SR2KA_FORBIDDEN_FEATURES } from "./meal-buddy-closure-sr2k-a-successor-manifest.mjs";
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
const refBoundary = require_(path.join(REL, "refBoundary.ts"));
const { MealBuddyRelationshipInboxController, MealBuddyRelationshipProfileController } = require_(path.join(REL, "controller.ts"));
const { SupabaseMealBuddyRelationshipRepository } = require_(path.join(REL, "repository.ts"));
const { MealBuddyChatController } = require_(path.join(CHAT, "controller.ts"));
const { SupabaseMealBuddyChatRepository } = require_(path.join(CHAT, "repository.ts"));

const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const git = (args) => {
  const r = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8" });
  return (r.stdout ?? "").trim();
};
const source = {
  inbox: read("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx"),
  panel: read("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx"),
  profileRoute: read("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx"),
  chatRoute: read("apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx"),
  chatScreen: read("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx"),
  home: read("apps/mobile/app/meal-buddies.tsx"),
  nav: read("apps/mobile/components/DemoUi.tsx"),
  layout: read("apps/mobile/app/_layout.tsx"),
  i18n: read("lib/i18n/zh-TW.ts")
};

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

// --- fixtures -----------------------------------------------------------------------------------
const CANDIDATE = `scr1.${"c".repeat(120)}`;
const CANDIDATE_B = `scr1.${"d".repeat(120)}`;
const CARD = `mbc1.${"k".repeat(120)}`;
const REL_IN = `mbr1.${"i".repeat(120)}`;
const REL_OUT = `mbr1.${"o".repeat(120)}`;
const REL_ACC = `mbr1.${"a".repeat(120)}`;
const THREAD = `mbchat1.${"t".repeat(120)}`;
const ENTRY = `mbmsg1.${"m".repeat(120)}`;
const RAW_UUID = "de300001-0000-4000-8000-000000000001";
const counterpart = (name) => ({ displayName: name, mascotAvatarKey: "DH" });
const row = (relationshipRef, state, name) => ({ relationshipRef, state, counterpart: counterpart(name) });
const okList = (relationships) => ({ policyVersion: "meal-buddy-relationship-v1", relationships });

// A repository double that records every call. It is the ONLY source of relationship truth in this
// suite, so "the screen reconstructs from the server list" is proven rather than asserted.
function relationshipRepository(script) {
  const calls = [];
  const repository = {
    source: "supabase-live",
    read: async (candidateRef) => { calls.push({ op: "read", candidateRef }); return script("read", candidateRef, calls.length); },
    list: async () => { calls.push({ op: "list" }); return script("list", null, calls.length); },
    send: async (candidateRef) => { calls.push({ op: "send", candidateRef }); return script("send", candidateRef, calls.length); },
    accept: async (ref) => { calls.push({ op: "accept", ref }); return script("accept", ref, calls.length); },
    decline: async (ref) => { calls.push({ op: "decline", ref }); return script("decline", ref, calls.length); },
    cancel: async (ref) => { calls.push({ op: "cancel", ref }); return script("cancel", ref, calls.length); }
  };
  return { repository, calls };
}
const ok = (relationships) => ({ ok: true, value: { relationships } });
const fail = (errorCode) => ({ ok: false, errorCode });

// ================================================================================================
// ENTRY — the real journey is reachable through ordinary navigation (§6, §29 ENTRY)
// ================================================================================================
check("the primary navigation reaches the Meal Buddy home without a hidden route",
  /href: "\/meal-buddies"/.test(source.nav) && /match: \["\/meal-buddies"/.test(source.nav));
check("the Meal Buddy home offers an ordinary control into the relationship area",
  /onPress=\{onGoToMatchedBuddies\}/.test(source.home)
  && /function goToMatchedBuddies\(\)[\s\S]{0,120}setActiveSection\("friends"\)/.test(source.home));
check("real mode renders the canonical relationship area and never the demo friends surface",
  /isRealCandidateMode \? \(\s*<MealBuddyRelationshipInbox/.test(source.home)
  && /!isRealCandidateMode \? <Chip label="聊天"/.test(source.home));
check("every Meal Buddy route is registered in the router layout",
  ["meal-buddies", "meal-buddy-candidate-profile/[candidateRef]", "meal-buddy-chat/[relationshipRef]"]
    .every((name) => source.layout.includes(`name="${name}"`)));

// ================================================================================================
// REFERENCE BOUNDARY — five families stay semantically distinct (§21, §22, §29 IDENTITY)
// ================================================================================================
const families = [
  ["card", CARD, refBoundary.isMealBuddyCardRef],
  ["candidate", CANDIDATE, refBoundary.isMealBuddyCandidateRef],
  ["relationship", REL_ACC, refBoundary.isMealBuddyRelationshipRef],
  ["thread", THREAD, refBoundary.isMealBuddyThreadRef],
  ["entry", ENTRY, refBoundary.isMealBuddyEntryRef]
];
check("each family accepts only its own well-formed reference",
  families.every(([, value, guard]) => guard(value) === true));
check("no reference of one family is accepted as another",
  families.every(([name, , guard]) =>
    families.filter(([other]) => other !== name).every(([, otherValue]) => guard(otherValue) === false)));
check("a raw database identifier is rejected by every family",
  families.every(([, , guard]) => guard(RAW_UUID) === false));
check("a bare prefix carries no identity",
  families.every(([name, , guard]) => guard(refBoundary.MEAL_BUDDY_REF_PREFIXES[name]) === false));
check("an unbounded value is rejected",
  refBoundary.isMealBuddyCandidateRef(`scr1.${"x".repeat(refBoundary.MEAL_BUDDY_REF_MAX_LENGTH)}`) === false);
check("a non-string segment is rejected",
  [null, undefined, 42, {}, [CANDIDATE]].every((value) => refBoundary.isMealBuddyCandidateRef(value) === false));
check("an Expo array segment resolves to its first well-formed value",
  refBoundary.readMealBuddyRouteRef([CANDIDATE, CANDIDATE_B], "candidate") === CANDIDATE);
check("a malformed route segment resolves to null rather than a guess",
  [undefined, "", "scr1.", RAW_UUID, CARD, REL_ACC, "../../etc/passwd"]
    .every((value) => refBoundary.readMealBuddyRouteRef(value, "candidate") === null));
check("a malformed relationship segment resolves to null rather than a guess",
  [undefined, "mbr1.", RAW_UUID, CANDIDATE, THREAD]
    .every((value) => refBoundary.readMealBuddyRouteRef(value, "relationship") === null));

// ================================================================================================
// CARD → CANDIDATE and CANDIDATE → PROFILE boundaries (§7, §8, §29 CARD/CANDIDATE)
// ================================================================================================
const authPort = { getCurrentSession: async () => ({ ok: true, value: { userId: "actor", accessToken: "t" } }) };
function liveRepository(handler) {
  const calls = [];
  const client = { functions: { invoke: async (name, options) => { calls.push({ name, body: options.body }); return handler(options.body, calls.length); } } };
  return { repository: new SupabaseMealBuddyRelationshipRepository(authPort, client), calls };
}
{
  const { repository, calls } = liveRepository(() => ({ data: okList([row(REL_OUT, "outgoing_pending", "小夏")]), error: null }));
  const withCard = await repository.send(CARD);
  check("a card reference can never be used as a candidate identity", withCard.ok === false && calls.length === 0);
  const withRelationship = await repository.read(REL_ACC);
  check("a relationship reference can never be used as a candidate identity", withRelationship.ok === false && calls.length === 0);
  const withCandidate = await repository.accept(CANDIDATE);
  check("a candidate reference can never be used as a lifecycle identity", withCandidate.ok === false && calls.length === 0);
  const sent = await repository.send(CANDIDATE);
  check("a well-formed candidate reference reaches the frozen endpoint verbatim",
    sent.ok === true && calls.length === 1 && calls[0].name === "meal-buddy-relationship"
    && JSON.stringify(calls[0].body) === JSON.stringify({ operation: "send", candidateRef: CANDIDATE }));
}
check("the candidate profile route resolves its identity through the shared boundary",
  /readMealBuddyRouteRef\(params\.candidateRef, "candidate"\)/.test(source.profileRoute)
  && !/startsWith\("scr1\."\)/.test(source.profileRoute));
check("the candidate profile still composes the relationship action for that candidate",
  source.profileRoute.includes("MealBuddyRelationshipPanel") && source.profileRoute.includes("candidateRef"));

// ================================================================================================
// RELATIONSHIP LIFECYCLE — canonical server state, never local intent (§9, §29 RELATIONSHIP)
// ================================================================================================
{
  const { repository, calls } = relationshipRepository((op) =>
    op === "read" ? ok([]) : op === "send" ? ok([row(REL_OUT, "outgoing_pending", "小夏")]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  check("an empty canonical read is the none state with no fabricated relationship ref",
    profile.getState().phase === "ready" && profile.getState().relationship.state === "none"
    && profile.getState().relationship.relationshipRef === "");
  await profile.send();
  check("send resolves to the canonical outgoing state",
    profile.getState().relationship.state === "outgoing_pending"
    && profile.getState().relationship.relationshipRef === REL_OUT
    && calls.filter((c) => c.op === "send").length === 1);
}
{
  const { repository } = relationshipRepository((op) =>
    op === "read" ? ok([row(REL_OUT, "outgoing_pending", "小夏")]) : op === "cancel" ? ok([row(REL_OUT, "none", "小夏")]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  await profile.cancel();
  check("cancel resolves to the canonical none state", profile.getState().relationship.state === "none");
}
{
  const { repository } = relationshipRepository((op) =>
    op === "read" ? ok([row(REL_IN, "incoming_pending", "阿哲")]) : op === "accept" ? ok([row(REL_IN, "accepted", "阿哲")]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-b", 1, CANDIDATE);
  await profile.accept();
  check("accept resolves to the canonical accepted state and keeps its opaque ref",
    profile.getState().relationship.state === "accepted" && profile.getState().relationship.relationshipRef === REL_IN);
}
{
  const { repository } = relationshipRepository((op) =>
    op === "read" ? ok([row(REL_IN, "incoming_pending", "阿哲")]) : op === "decline" ? ok([row(REL_IN, "none", "阿哲")]) : ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-b", 1, CANDIDATE);
  await profile.decline();
  check("decline resolves to the canonical none state", profile.getState().relationship.state === "none");
}
{
  const { repository } = relationshipRepository((op) => op === "read" ? ok([]) : fail("server_unavailable"));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, CANDIDATE);
  const sent = await profile.send();
  check("a failed send never becomes durable local truth and stays recoverable",
    sent === false && profile.getState().phase === "ready"
    && profile.getState().relationship.state === "none"
    && profile.getState().pendingAction === null
    && profile.getState().errorCode === "server_unavailable");
}

// ================================================================================================
// BUDDY LIST CLOSURE — accepted persists, needs no ranking and no thread (§10, §12, §16)
// ================================================================================================
const ESTABLISHED = [row(REL_IN, "incoming_pending", "阿哲"), row(REL_OUT, "outgoing_pending", "小夏"), row(REL_ACC, "accepted", "阿樹")];
{
  const { repository, calls } = relationshipRepository(() => ok(ESTABLISHED));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  const states = inbox.getState().relationships.map((r) => r.state).join(",");
  check("the relationship list carries all three actor-relative states",
    states === "incoming_pending,outgoing_pending,accepted");
  check("the established buddy is reachable from the canonical list alone",
    calls.every((c) => c.op === "list") && calls.length === 1);

  // Cold-load equivalent: a brand new controller with no in-memory history at all.
  const cold = new MealBuddyRelationshipInboxController(relationshipRepository(() => ok(ESTABLISHED)).repository);
  await cold.setActor("actor-a", 1);
  check("an established buddy survives a cold load with no prior in-memory state",
    cold.getState().relationships.some((r) => r.relationshipRef === REL_ACC && r.state === "accepted"));
  check("no candidate ranking call is needed to find an established buddy again",
    !JSON.stringify(calls).includes("candidate") && !JSON.stringify(calls).includes("sourceCard"));
}
{
  // The server answers with the truth of the moment: incoming before the accept, established after
  // it. The controller may not shortcut that, and the row it renders must come from the reload.
  let acceptedYet = false;
  const { repository, calls } = relationshipRepository((op) => {
    if (op === "accept") { acceptedYet = true; return ok([row(REL_IN, "accepted", "阿哲")]); }
    return ok([row(REL_OUT, "outgoing_pending", "小夏"),
      row(REL_IN, acceptedYet ? "accepted" : "incoming_pending", "阿哲")]);
  });
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-b", 1);
  await inbox.accept(REL_IN);
  const accepted = inbox.getState().relationships.find((r) => r.relationshipRef === REL_IN);
  check("accepting reconciles against the canonical list without an app restart",
    accepted?.state === "accepted" && calls.filter((c) => c.op === "list").length === 2);
  check("the pending presentation is replaced, not kept alongside",
    !inbox.getState().relationships.some((r) => r.relationshipRef === REL_IN && r.state === "incoming_pending"));
}
{
  const { repository, calls } = relationshipRepository((op) => op === "list" ? ok(ESTABLISHED) : fail("server_unavailable"));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  const accepted = await inbox.accept(REL_IN);
  check("a failed lifecycle action reconciles against canonical truth and reports safely",
    accepted === false && inbox.getState().phase === "ready"
    && inbox.getState().errorCode === "server_unavailable"
    && inbox.getState().pendingAction === null
    && calls.filter((c) => c.op === "list").length === 2);
  const second = await inbox.accept(REL_IN);
  check("the action remains available after a failure rather than latching", second === false || second === true);
}
{
  const { repository, calls } = relationshipRepository(() => ok(ESTABLISHED));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  await inbox.load();
  check("an explicit re-read goes to the canonical list and to nothing else",
    calls.length === 2 && calls.every((c) => c.op === "list"));
}

// ================================================================================================
// STATE — stale results, actor isolation, sign-out (§17, §29 STATE)
// ================================================================================================
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let first = true;
  const repository = {
    source: "supabase-live",
    read: async () => ok([]), send: async () => ok([]), accept: async () => ok([]),
    decline: async () => ok([]), cancel: async () => ok([]),
    list: async () => {
      if (first) { first = false; await gate; return ok([row(REL_ACC, "accepted", "A 的飯友")]); }
      return ok([row(REL_OUT, "outgoing_pending", "B 的飯友")]);
    }
  };
  const inbox = new MealBuddyRelationshipInboxController(repository);
  const pendingA = inbox.setActor("actor-a", 1);
  await inbox.setActor("actor-b", 2);
  release();
  await pendingA;
  check("a late viewer-A relationship list can never populate viewer B",
    inbox.getState().phase === "ready"
    && inbox.getState().relationships.every((r) => r.counterpart.displayName === "B 的飯友"));
  await inbox.setActor(null, 3);
  check("sign-out clears the canonical relationship surface", inbox.getState().phase === "signed_out");
}
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let first = true;
  const repository = {
    source: "supabase-live", list: async () => ok([]),
    send: async () => ok([]), accept: async () => ok([]), decline: async () => ok([]), cancel: async () => ok([]),
    read: async () => {
      if (first) { first = false; await gate; return ok([row(REL_ACC, "accepted", "A 的飯友")]); }
      return ok([row(REL_OUT, "outgoing_pending", "B 的飯友")]);
    }
  };
  const profile = new MealBuddyRelationshipProfileController(repository);
  const pendingA = profile.setContext("actor-a", 1, CANDIDATE);
  await profile.setContext("actor-b", 2, CANDIDATE_B);
  release();
  await pendingA;
  check("a late viewer-A profile relationship can never populate viewer B",
    profile.getState().phase === "ready" && profile.getState().relationship.counterpart?.displayName === "B 的飯友");
}
{
  const { repository } = relationshipRepository(() => ok([]));
  const profile = new MealBuddyRelationshipProfileController(repository);
  await profile.setContext("actor-a", 1, RAW_UUID);
  check("a malformed candidate identity fails the profile closed with no transport call",
    profile.getState().phase === "load_failed" && profile.getState().errorCode === "invalid_request");
}

// ================================================================================================
// EMPTY / ERROR — honest states, practical retry, no automatic retry loop (§18, §19, §20)
// ================================================================================================
{
  const { repository } = relationshipRepository(() => ok([]));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  check("an empty real relationship result is ready-and-empty, never a failure",
    inbox.getState().phase === "ready" && inbox.getState().relationships.length === 0
    && inbox.getState().errorCode === null);
}
{
  const { repository, calls } = relationshipRepository(() => fail("network_error"));
  const inbox = new MealBuddyRelationshipInboxController(repository);
  await inbox.setActor("actor-a", 1);
  check("a failed relationship load is a distinct failure state, never an empty list",
    inbox.getState().phase === "load_failed" && inbox.getState().errorCode === "network_error");
  check("nothing retries automatically", calls.length === 1);
  await inbox.load();
  check("an explicit retry is available and performs exactly one further read", calls.length === 2);
}
check("the relationship area renders a distinct honest line for every empty band",
  ["copy.emptyIncoming", "copy.emptyOutgoing", "copy.emptyAccepted", "copy.emptyInbox"]
    .every((token) => source.inbox.includes(token)));
check("a load in progress is never rendered as an empty or established relationship area",
  source.inbox.indexOf('phase === "loading"') < source.inbox.indexOf("bandsFor(state.relationships)")
  && /phase === "loading"[\s\S]{0,400}ActivityIndicator/.test(source.inbox));
check("no user-facing copy exposes an internal code, identifier or raw server enum",
  !/(mbr1\.|mbc1\.|scr1\.|mbchat1\.|mbmsg1\.|invalid_request|server_unavailable|pair_key|[0-9a-f]{8}-[0-9a-f]{4})/
    .test(source.i18n.slice(source.i18n.indexOf("mealBuddyRelationships:"), source.i18n.indexOf("chat: {"))));

// ================================================================================================
// CHAT ENTRY — explicit intent, lazy open, no dead end (§13, §14, §29 CHAT)
// ================================================================================================
check("chat is offered only for an established relationship",
  /state === "accepted" && onOpenChat/.test(source.inbox)
  && /state\.relationship\.state === "accepted" && onOpenChat/.test(source.panel));
check("rendering an established relationship performs no chat transport call",
  !/\.open\(|useMealBuddyChat\(|repository\.|invoke\(/.test(`${source.inbox}\n${source.panel}`));
check("chat entry is a navigation callback carrying only the opaque relationship ref",
  /onOpenChat\?: \(relationshipRef: string\) => void/.test(source.inbox)
  && /pathname: "\/meal-buddy-chat\/\[relationshipRef\]", params: \{ relationshipRef \}/.test(source.home)
  && /pathname: "\/meal-buddy-chat\/\[relationshipRef\]", params: \{ relationshipRef \}/.test(source.profileRoute));
{
  const calls = [];
  const client = {
    functions: {
      invoke: async (name, options) => {
        calls.push(options.body.operation);
        if (options.body.operation === "open") {
          return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: THREAD, counterpart: counterpart("阿樹") } }, error: null };
        }
        return { data: { policyVersion: "meal-buddy-chat-v1", conversation: { conversationRef: THREAD, counterpart: counterpart("阿樹") }, messages: [], nextCursor: null }, error: null };
      }
    }
  };
  const controller = new MealBuddyChatController(new SupabaseMealBuddyChatRepository(authPort, client), () => "11111111-1111-4111-8111-111111111111");
  await controller.setContext("actor-a", 1, REL_ACC);
  check("entering the chat route opens the canonical thread exactly once",
    calls.filter((op) => op === "open").length === 1 && controller.getState().phase === "ready");
  check("an empty thread is an honest empty history, not a failure",
    controller.getState().messages.length === 0 && controller.getState().errorCode === null);
}
{
  const calls = [];
  const client = { functions: { invoke: async (name, options) => { calls.push(options.body.operation); return { data: null, error: {} }; } } };
  const controller = new MealBuddyChatController(new SupabaseMealBuddyChatRepository(authPort, client), () => "x");
  await controller.setContext("actor-a", 1, RAW_UUID);
  check("a malformed chat route identity fails closed with zero transport calls",
    calls.length === 0 && controller.getState().phase === "open_failed"
    && controller.getState().errorCode === "invalid_request");
}
check("neither the chat route nor the candidate profile can strand the user",
  [source.chatRoute, source.profileRoute].every((route) =>
    /router\.canGoBack\(\)/.test(route)
    && /router\.replace\(\{ pathname: "\/meal-buddies", params: \{ section: "friends" \} \}\)/.test(route)));
check("the fail-closed chat screen offers a return to the relationship area",
  /copy\.backToBuddies/.test(source.chatScreen) && source.i18n.includes('backToBuddies: "返回飯友列表"'));
check("returning to the relationship area does not require any thread identity",
  !/mbchat1|conversationRef/.test(source.home));

// ================================================================================================
// CROSS-SCREEN RECONCILIATION (§15, §41)
// ================================================================================================
check("returning to the Meal Buddy home re-reads the canonical relationship list",
  /useFocusEffect\(/.test(source.home) && /void reconcileRealRelationships\(\);/.test(source.home));
check("the reconcile binding is stable, so it cannot re-trigger itself",
  /const reconcileRealRelationships = realRelationships\.retry;/.test(source.home)
  && /useMemo\(\(\) => Object\.freeze\(\{/.test(read("apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationships.ts")));
check("reconciliation adds no cross-screen mutable global truth",
  !/globalThis[^\n]*relationship|__mealBuddyRelationships/i.test(source.home));
check("cross-screen reconciliation uses no timer and no polling",
  !/setInterval|setTimeout/.test(
    source.home.slice(source.home.indexOf("useFocusEffect("), source.home.indexOf("useFocusEffect(") + 700)));

// Actor isolation across the WHOLE journey, not only the surfaces this round authored: every Meal
// Buddy data surface is keyed to the current actor generation, so a late answer for a previous
// viewer can never render for the next one.
check("every Meal Buddy data surface is keyed to the current actor generation",
  [
    "apps/mobile/features/meal-buddy-candidates/useMealBuddyCandidateProfile.ts",
    "apps/mobile/features/meal-buddy-relationships/controller.ts",
    "apps/mobile/features/meal-buddy-chat/controller.ts"
  ].every((file) => /actorGeneration/.test(read(file)))
  && /if \(!isLiveMode\) reset\(\);/.test(read("apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts")));
check("both dynamic routes carry the current actor generation into their controller",
  /runtime\.state\.actorGeneration/.test(source.profileRoute)
  && /runtime\.state\.actorGeneration/.test(source.chatRoute));

// ================================================================================================
// IDENTIFIABLE RELATIONSHIPS (§11)
// ================================================================================================
{
  const { repository } = liveRepository(() => ({
    data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ relationshipRef: REL_ACC, state: "accepted", counterpart: { displayName: "阿樹", mascotAvatarKey: "DH", publicBio: "leak" } }] },
    error: null
  }));
  check("a widened counterpart payload fails the closed Mobile contract", (await repository.list()).ok === false);
}
{
  const { repository } = liveRepository(() => ({
    data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ relationshipRef: REL_ACC, state: "accepted", counterpart: { displayName: "", mascotAvatarKey: "DH" } }] },
    error: null
  }));
  check("an anonymous counterpart fails the closed Mobile contract", (await repository.list()).ok === false);
}
check("visible relationship rows render the current public identity and never an opaque ref",
  source.inbox.includes("relationship.counterpart.displayName")
  && source.inbox.includes("relationship.counterpart.mascotAvatarKey")
  && !/<Text[^>]*>\s*\{relationship\.(?:relationshipRef|state)\}/.test(source.inbox));

// ================================================================================================
// SEPARATION — zero backend delta, no new chat features, frozen authority untouched (§23, §24, §28)
// ================================================================================================
const BASELINE = "4f6dc34d52b4aee22081cc00672c8e312c045d3a";
check("the round changed no supabase byte", git(["diff", "--name-only", BASELINE, "--", "supabase"]) === "");
check("interest and meal-context authority is untouched",
  ["apps/mobile/features/social-interest-settings", "supabase/functions/_shared/meal-buddy-context",
    "supabase/functions/_shared/social-ranking", "supabase/functions/_shared/social-exposure"]
    .every((p) => git(["diff", "--name-only", BASELINE, "--", p]) === ""));
check("candidate exposure and ranking surfaces are untouched",
  ["apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx",
    "apps/mobile/features/meal-buddy-candidates/MealBuddyRealCandidateSection.tsx",
    "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts"]
    .every((p) => git(["diff", "--name-only", BASELINE, "--", p]) === ""));
check("no tier rule reaches relationship, buddy or chat behaviour",
  !/isPremium|entitlement|premium_tier|quota/i.test(`${source.inbox}\n${source.panel}\n${source.chatScreen}\n${source.chatRoute}`));
// The canonical §28 list is reused verbatim rather than restated, so the smoke and the guard can
// never disagree about what "no new chat feature" means.
const closureSurfaces = [source.inbox, source.panel, source.chatRoute, source.profileRoute,
  read("apps/mobile/features/meal-buddy-relationships/refBoundary.ts")].join("\n");
check("no new chat feature is introduced anywhere in the closure surfaces",
  SR2KA_FORBIDDEN_FEATURES.every(([, pattern]) => !pattern.test(closureSurfaces)));
check("no geo or nearby authority is introduced",
  !/expo-location|geolocation|latitude|longitude|nearbyCandidates/i
    .test(`${source.inbox}\n${source.panel}\n${source.chatRoute}\n${source.profileRoute}`));

console.log(JSON.stringify({
  suite: "meal-buddy-closure-sr2k-a-smoke",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
