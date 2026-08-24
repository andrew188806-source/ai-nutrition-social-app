#!/usr/bin/env node
// SR-2K-B mutation coverage: every closure invariant is proven to have teeth by mutating the
// authored source IN MEMORY and requiring the shared audit to reject it. Nothing is written to the
// repository, so an interrupted run can leave no mutant behind. Source text only; no network, no
// database, no Development.
import fs from "node:fs"; import path from "node:path"; import child from "node:child_process";
import {
  SR2KB_BASELINE, SR2KB_MIGRATIONS, SR2KB_PRODUCTION_PATHS, auditSr2kbAuthoredSources
} from "./social-final-sr2k-b-successor-manifest.mjs";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", SR2KB_BASELINE, "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
}

const REL = "apps/mobile/features/meal-buddy-relationships/";
const CHAT = "apps/mobile/features/meal-buddy-chat/";
const PUSH = "apps/mobile/features/meal-buddy-push/";
const EDGE = "supabase/functions/_shared/";
const NEW_PRODUCTION = SR2KB_PRODUCTION_PATHS.filter((f) =>
  f.startsWith("supabase/migrations/2026082") || f.startsWith(`${EDGE}meal-buddy-push-api/`)
  || f.startsWith("supabase/functions/meal-buddy-push-de") || f.startsWith("supabase/functions/meal-buddy-push-di")
  || f.startsWith(PUSH) || f === `${CHAT}supabaseRealtime.ts` || f === `${REL}MealBuddyUnfriendConfirm.tsx`);

const pristine = new Map([
  ["unfriendSql", read(SR2KB_MIGRATIONS[0])],
  ["realtimeSql", read(SR2KB_MIGRATIONS[1])],
  ["pushSql", read(SR2KB_MIGRATIONS[2])],
  ["relationshipApi", read(`${EDGE}meal-buddy-relationship-api/repository.ts`)],
  ["relationshipRequest", read(`${EDGE}meal-buddy-relationship-api/request.ts`)],
  ["relationshipTypes", read(`${EDGE}meal-buddy-relationship-api/types.ts`)],
  ["chatApiTypes", read(`${EDGE}meal-buddy-chat-api/types.ts`)],
  ["chatApiRepository", read(`${EDGE}meal-buddy-chat-api/repository.ts`)],
  ["pushApiService", read(`${EDGE}meal-buddy-push-api/service.ts`)],
  ["pushApiRequest", read(`${EDGE}meal-buddy-push-api/request.ts`)],
  ["pushDispatchConfig", read("supabase/functions/meal-buddy-push-dispatch/config.ts")],
  ["pushDispatchHandler", read("supabase/functions/meal-buddy-push-dispatch/handler.ts")],
  ["pushDeviceHandler", read("supabase/functions/meal-buddy-push-device/handler.ts")],
  ["mobileRelController", read(`${REL}controller.ts`)],
  ["mobileRelRepository", read(`${REL}repository.ts`)],
  ["inbox", read(`${REL}MealBuddyRelationshipInbox.tsx`)],
  ["panel", read(`${REL}MealBuddyRelationshipPanel.tsx`)],
  ["confirm", read(`${REL}MealBuddyUnfriendConfirm.tsx`)],
  ["chatController", read(`${CHAT}controller.ts`)],
  ["chatRepository", read(`${CHAT}repository.ts`)],
  ["chatRealtime", read(`${CHAT}supabaseRealtime.ts`)],
  ["pushController", read(`${PUSH}controller.ts`)],
  ["pushTypes", read(`${PUSH}types.ts`)],
  ["pushRouting", read(`${PUSH}useMealBuddyPushRouting.ts`)],
  ["pushInstallId", read(`${PUSH}installId.ts`)],
  ["pushHook", read(`${PUSH}useMealBuddyPush.ts`)],
  ["config", read("supabase/config.toml")],
  ["authoredDelta", [
    ...NEW_PRODUCTION.map(read),
    ...SR2KB_PRODUCTION_PATHS.filter((f) => !NEW_PRODUCTION.includes(f)).map(addedLines)
  ].join("\n")]
]);

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

const baseline = auditSr2kbAuthoredSources(pristine);
check("pristine SR-2K-B source satisfies every closure invariant", baseline.length === 0);
if (baseline.length) for (const violation of baseline) console.log(`     violated: ${violation}`);

const mutations = [
  // --- PART A: unfriend -------------------------------------------------------------------------
  ["overloading declined as unfriend is killed", "unfriendSql",
    (s) => s.replace("state in ('pending', 'accepted', 'declined', 'cancelled', 'ended')", "state in ('pending', 'accepted', 'declined', 'cancelled')")],
  ["reaching ended from a pending invite is killed", "unfriendSql",
    (s) => s.replace("if v_relation.state <> 'accepted' then return; end if;", "if false then return; end if;")],
  ["dropping the end instant is killed", "unfriendSql",
    (s) => s.replace("add column ended_at timestamptz", "add column ended_marker boolean")],
  ["losing idempotency on a repeated unfriend is killed", "unfriendSql",
    (s) => s.replace("if v_relation.state = 'ended' then", "if false then")],
  ["unfriending outside the canonical pair lock is killed", "unfriendSql",
    (s) => s.split("perform social_internal.lock_meal_buddy_relationship_pair").join("-- perform lock")],
  ["making unfriend create a block is killed", "unfriendSql",
    (s) => `${s}\ninsert into public.social_blocks (blocker_user_id, blocked_user_id) values (p_actor_user_id, v_counterpart);`],
  ["deleting chat history on unfriend is killed", "unfriendSql",
    (s) => `${s}\ndelete from public.meal_buddy_messages where conversation_id is not null;`],
  ["blocking a later re-invite is killed", "unfriendSql",
    (s) => s.replace("state in ('declined', 'cancelled', 'ended')", "state in ('declined', 'cancelled')")],
  ["accepting a candidate ref for unfriend is killed", "relationshipTypes",
    (s) => s.replace(`"accept" | "decline" | "cancel" | "unfriend"; relationshipRef: string`, `"accept" | "decline" | "cancel"; relationshipRef: string`)],
  ["unfriending a pending relationship from Mobile is killed", "mobileRelController",
    (s) => s.replace(`this.mutate("unfriend", "accepted")`, `this.mutate("unfriend", "outgoing_pending")`)],
  ["accepting a still-accepted unfriend response is killed", "mobileRelRepository",
    (s) => s.replace(`operation === "unfriend" ? "none"`, `operation === "unfriend" ? "accepted"`)],
  // Both accepted-row shapes (with and without a chat entry) route through the confirmation, so the
  // mutation has to remove every one of them.
  ["removing the unfriend confirmation is killed", "inbox",
    (s) => s.split("onRequestEnd(relationship.relationshipRef)").join("controller.unfriend(relationship.relationshipRef)")],

  // --- PART B: realtime -------------------------------------------------------------------------
  ["switching realtime to postgres_changes is killed", "chatRealtime",
    (s) => s.replace(`config: { private: true }`, `config: { postgres_changes: true }`)],
  ["granting a client role select on the message table is killed", "realtimeSql",
    (s) => `${s}\ngrant select on table public.meal_buddy_messages to authenticated;`],
  ["deriving the channel topic from the conversation id is killed", "realtimeSql",
    (s) => s.replace("topic like 'mbrt1.%'", "topic like '%'")],
  ["turning the subscribe gate into an oracle is killed", "realtimeSql",
    (s) => s.replace("create function public.meal_buddy_chat_realtime_authorized(p_topic text)",
      "create function public.meal_buddy_chat_realtime_authorized(p_topic text, p_actor uuid)")],
  ["letting an ended pair keep receiving is killed", "realtimeSql",
    (s) => s.replace("relation.state = 'accepted'", "relation.state is not null")],
  ["dropping the block and participation recheck is killed", "realtimeSql",
    (s) => s.split("social_internal.may_evaluate_candidate").join("true or coalesce")],
  ["removing the realtime subscribe policy is killed", "realtimeSql",
    (s) => s.replace("create policy meal_buddy_chat_realtime_subscribe on realtime.messages", "-- policy removed on realtime.messages")],
  ["publishing on an idempotent retry is killed", "pushSql",
    (s) => s.split("if v_inserted then").join("if true then")],
  ["putting the message body in the realtime payload is killed", "pushSql",
    (s) => s.replace(`jsonb_build_object('kind', 'meal_buddy_chat_activity')`, `jsonb_build_object('kind', 'meal_buddy_chat_activity', 'body', p_body)`)],
  ["trusting the realtime frame as history is killed", "chatController",
    (s) => s.replace("async reconcile(): Promise<boolean> {", "async neverReconcile(): Promise<boolean> {")],
  ["subscribing to a topic the server did not issue is killed", "chatController",
    (s) => s.replace("this.attachRealtime(opened.value.realtimeTopic);", "this.attachRealtime('mbrt1.guessed');")],
  ["leaking a subscription across actors is killed", "chatController",
    (s) => s.replace("this.detachRealtime();\n    this.conversationRef = null;", "this.conversationRef = null;")],
  ["accepting a malformed realtime topic is killed", "chatRepository",
    (s) => s.split("isMealBuddyChatRealtimeTopic").join("Boolean")],
  ["adding interval polling as a realtime fallback is killed", "chatController",
    (s) => `${s}\nsetInterval(() => undefined, 5000);`],

  // --- PART C: push -----------------------------------------------------------------------------
  ["allowing one token to address several devices is killed", "pushSql",
    (s) => s.replace("constraint meal_buddy_push_devices_token_unique unique (push_token)", "constraint meal_buddy_push_devices_token_check check (push_token is not null)")],
  ["leaving a rotated token on its previous holder is killed", "pushSql",
    (s) => s.replace("  where device.push_token = p_push_token\n    and not (device.user_id = p_user_id and device.install_id = p_install_id);",
      "  where device.push_token = p_push_token and false;")],
  ["exposing the device table to a client role is killed", "pushSql",
    (s) => s.replace("revoke all on table public.meal_buddy_push_devices from public, anon, authenticated, authenticator, service_role;", "grant select on table public.meal_buddy_push_devices to authenticated;")],
  ["letting a sender receive their own notification is killed", "pushSql",
    (s) => s.replace("constraint meal_buddy_notification_outbox_recipient_not_actor check (recipient_user_id <> actor_user_id)", "constraint meal_buddy_notification_outbox_recipient_not_actor check (recipient_user_id is not null)")],
  ["duplicating an event on an idempotent replay is killed", "pushSql",
    (s) => s.replace("dedupe_key text not null unique", "dedupe_key text not null")],
  ["widening the authorized event kinds is killed", "pushSql",
    (s) => s.replace("event_kind in ('meal_buddy_invite_received', 'meal_buddy_invite_accepted', 'meal_buddy_message_received')", "event_kind is not null")],
  ["notifying on a decline is killed", "pushSql",
    (s) => s.replace(`  if p_action = 'decline' and p_actor_user_id = v_recipient then`,
      `  if p_action = 'decline' and p_actor_user_id = v_recipient then\n    perform social_internal.enqueue_meal_buddy_notification(v_counterpart, p_actor_user_id, 'meal_buddy_invite_received', 'decline:' || v_relation.id::text, v_relation.id, null);`)],
  ["opening the dispatcher without its secret is killed", "pushDispatchHandler",
    (s) => s.replace("if (!secretMatches(config.value.dispatchSecret, request.headers.get(\"x-meal-buddy-push-dispatch\"))) {", "if (false) {")],
  ["comparing the dispatch secret in variable time is killed", "pushDispatchConfig",
    (s) => s.replace("difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);", "if (expected[index] !== presented[index]) return false;")],
  ["letting a caller name the device owner is killed", "pushDeviceHandler",
    (s) => s.replace("authentication.value.userId", "(parsed.value as { ownerUserId?: string }).ownerUserId ?? authentication.value.userId")],
  ["putting the message body in the notification is killed", "pushApiService",
    (s) => s.replace("`${name} 傳了一則訊息給你`", "`${name}: ${message.body}`")],
  ["putting an identifier in the push payload is killed", "pushApiService",
    (s) => s.replace(`data: Object.freeze({ kind: claim.event_kind, route: "meal-buddies" as const, section: "friends" as const })`,
      `data: Object.freeze({ kind: claim.event_kind, relationshipId: claim.recipient_user_id })`)],
  ["letting one dead device suppress a healthy one is killed", "pushApiService",
    (s) => s.replace("current.delivered = true;", "current.delivered = false;")],
  ["prompting for notifications more than once is killed", "pushController",
    (s) => s.split("this.promptedThisSession").join("false")],
  ["treating a denied permission as a failure is killed", "pushController",
    (s) => s.replace("      this.update(Object.freeze({ phase: \"denied\" }));\n      return false;",
      "      throw new Error(\"permission refused\");")],
  ["storing a push token on the device is killed", "pushHook",
    (s) => `${s}\nstorage.setItem("token", pushToken);`],
  ["routing a notification by a smuggled identifier is killed", "pushTypes",
    (s) => s.replace(`if (record.route !== "meal-buddies" || record.section !== "friends") return null;`, `if (false) return null;`)],
  ["acting on an unrecognised notification payload is killed", "pushRouting",
    (s) => s.replace("if (!route) return;", "")],
  ["making the dispatcher a JWT user endpoint is killed", "config",
    (s) => s.replace(`[functions.meal-buddy-push-dispatch]`, `[functions.meal-buddy-push-dispatch-renamed]`)],

  // --- deferred product surface (§2, §48) --------------------------------------------------------
  ["adding a typing indicator is killed", "authoredDelta", (s) => `${s}\nconst isTyping = true;`],
  ["adding presence is killed", "authoredDelta", (s) => `${s}\nconst onlineStatus = true;`],
  ["adding read receipts is killed", "authoredDelta", (s) => `${s}\nconst seenAt = new Date();`],
  ["adding media messages is killed", "authoredDelta", (s) => `${s}\ntype MediaMessage = { attachmentUrl: string };`],
  ["adding voice or video calls is killed", "authoredDelta", (s) => `${s}\nasync function startCall() { return null; }`],
  ["adding reactions is killed", "authoredDelta", (s) => `${s}\nfunction addReaction() { return null; }`],
  ["adding message edit or delete is killed", "authoredDelta", (s) => `${s}\nasync function editMessage() { return false; }`],
  ["adding group chat is killed", "authoredDelta", (s) => `${s}\ntype Group = { conversationParticipants: string[] };`],
  ["adding an unread badge is killed", "authoredDelta", (s) => `${s}\nconst unreadCount = 0;`],
  ["adding a notification centre is killed", "authoredDelta", (s) => `${s}\nconst notificationCenter = [];`],
  ["adding geo or nearby authority is killed", "authoredDelta", (s) => `${s}\nconst latitude = 25.03;`],
  ["embedding a deployment operator command is killed", "authoredDelta", (s) => `${s}\n// supabase functions deploy meal-buddy-push-dispatch`]
];

for (const [name, key, mutate] of mutations) {
  const original = pristine.get(key);
  const mutated = mutate(original);
  const sources = new Map(pristine);
  sources.set(key, mutated);
  const violations = auditSr2kbAuthoredSources(sources);
  // A mutation that changed nothing would silently "pass" forever, so the edit itself is verified.
  check(name, mutated !== original && violations.length > 0);
}

console.log(JSON.stringify({
  suite: "social-final-sr2k-b-mutations",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
