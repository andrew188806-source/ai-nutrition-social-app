#!/usr/bin/env node
// SR-2J-B mutation coverage: every invariant is proven to have teeth by mutating the authored
// source and requiring the shared audit to reject it. Source text only; no network, no database.
import fs from "node:fs"; import path from "node:path"; import child from "node:child_process";
import { SR2JB_BASELINE, auditSr2jbAuthoredSources } from "./meal-buddy-chat-sr2j-b-successor-manifest.mjs";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", SR2JB_BASELINE, "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
}

const FEATURE = "apps/mobile/features/meal-buddy-chat";
const pristine = new Map([
  ["types", read(`${FEATURE}/types.ts`)],
  ["contracts", read(`${FEATURE}/supabaseContracts.ts`)],
  ["repository", read(`${FEATURE}/repository.ts`)],
  ["controller", read(`${FEATURE}/controller.ts`)],
  ["screen", read(`${FEATURE}/MealBuddyChatScreen.tsx`)],
  ["hook", read(`${FEATURE}/useMealBuddyChat.ts`)],
  ["route", read("apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx")],
  ["inbox", addedLines("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx")],
  ["panel", addedLines("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx")],
  ["composition", addedLines("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts")],
  ["i18n", addedLines("lib/i18n/zh-TW.ts")]
]);

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

const baseline = auditSr2jbAuthoredSources(pristine);
check("pristine SR-2J-B source satisfies every invariant", baseline.length === 0);

// Each mutation names the invariant it attacks; the audit must report at least one violation.
const mutations = [
  ["endpoint drift is killed", "contracts", (s) => s.replace('"meal-buddy-chat" as const', '"meal-buddy-chat-v2" as const')],
  ["policy-version drift is killed", "types", (s) => s.replace('"meal-buddy-chat-v1"', '"meal-buddy-chat-v9"')],
  ["widened body bound is killed", "types", (s) => s.replace("MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 2000", "MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 8000")],
  ["open response acceptance is killed", "repository", (s) => s.split("exactKeys").join("looseKeys")],
  ["removing invalid-response rejection is killed", "repository", (s) => s.split("invalid_server_response").join("server_unavailable")],
  ["collapsing branded refs is killed", "types", (s) => s.split("conversationRefBrand").join("relationshipRefBrand")],
  ["sending a raw sender identifier is killed", "controller", (s) => s.replace("this.conversationRef, pending.clientMessageId", "this.conversationRef, pending.clientMessageId, senderUserId")],
  ["offering chat for a pending relationship is killed", "inbox", (s) => s.replace('state === "accepted"', 'state === "incoming_pending"')],
  ["auto-opening chat from the inbox is killed", "inbox", (s) => `${s}\nuseMealBuddyChat(actorKey, generation, ref);`],
  ["auto-opening chat from the profile panel is killed", "panel", (s) => `${s}\nuseMealBuddyChat(actorKey, generation, ref);`],
  ["allocating a second idempotency key is killed", "controller", (s) => s.replace('return this.dispatchSend(Object.freeze({ ...pending, phase: "sending" as const }));', 'return this.dispatchSend(Object.freeze({ ...pending, clientMessageId: this.uuidFactory(), phase: "sending" as const }));')],
  ["losing the retryable pending state is killed", "controller", (s) => s.replace('{ ...pending, phase: "retryable" as const }', '{ ...pending, phase: "sending" as const }')],
  ["removing fail-closed authorization handling is killed", "controller", (s) => s.split("failClosed").join("softFail")],
  ["removing actor-generation gating is killed", "controller", (s) => s.split("isCurrent(request)").join("true")],
  ["persisting chat state locally is killed", "controller", (s) => `${s}\nAsyncStorage.setItem("chat", JSON.stringify(this.messages));`],
  ["leaking the internal idempotency conflict code is killed", "screen", (s) => `${s}\n// CHAT_IDEMPOTENCY_KEY_CONFLICT`],
  ["adding a realtime subscription is killed", "controller", (s) => `${s}\nclient.channel("chat").subscribe();`],
  ["adding interval polling is killed", "controller", (s) => `${s}\nsetInterval(() => this.refresh(), 5000);`],
  ["adding an unread counter is killed", "types", (s) => `${s}\nexport type Unread = { unreadCount: number };`],
  ["adding read receipts is killed", "types", (s) => `${s}\nexport type Receipt = { seenAt: string };`],
  ["adding a typing indicator is killed", "controller", (s) => `${s}\n// typing indicator broadcast`],
  ["adding presence is killed", "controller", (s) => `${s}\nconst onlineStatus = true;`],
  ["adding notifications is killed", "controller", (s) => `${s}\nimport * as Notification from "expo-notifications";`],
  ["adding media messages is killed", "types", (s) => `${s}\nexport type Attachment = { url: string };`],
  ["adding message edit authority is killed", "controller", (s) => `${s}\nasync editMessage() { return false; }`],
  ["adding reactions is killed", "types", (s) => `${s}\nexport type Reaction = { emoji: string };`],
  ["adding group chat is killed", "types", (s) => `${s}\nexport type Group = { participants: string[] };`]
];

for (const [name, key, mutate] of mutations) {
  const mutated = new Map(pristine);
  mutated.set(key, mutate(pristine.get(key)));
  const violations = auditSr2jbAuthoredSources(mutated);
  check(name, violations.length > 0);
}

console.log(JSON.stringify({
  suite: "meal-buddy-chat-sr2j-b-mutations",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
