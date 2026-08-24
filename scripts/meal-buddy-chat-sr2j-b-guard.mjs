#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import child from "node:child_process";
import {
  SR2JB_BASELINE, SR2JB_BASELINE_SUBJECT, SR2JB_FROZEN_MIGRATION, SR2JB_FROZEN_MIGRATION_SHA256,
  SR2JB_PATHS, SR2JB_PRODUCTION_PATHS, classifySr2jbLifecycle, createSr2jbManifest
} from "./meal-buddy-chat-sr2j-b-successor-manifest.mjs";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const run = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return (result.stdout ?? "").trim();
};
const lines = (v) => (v ? v.split(/\r?\n/).filter(Boolean) : []);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const unstaged = lines(run(["diff", "--name-only", "--", ...SR2JB_PATHS]));
const untracked = lines(run(["ls-files", "--others", "--exclude-standard", "--", ...SR2JB_PATHS]));
const worktree = [...new Set([...unstaged, ...untracked])].sort();
const staged = lines(run(["diff", "--cached", "--name-only"]));
const head = run(["rev-parse", "HEAD"]);
const originHead = run(["rev-parse", "origin/main"]);
const counts = run(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const delta = head === SR2JB_BASELINE ? [] : lines(run(["diff", "--name-only", `${SR2JB_BASELINE}..HEAD`]));
const lifecycle = classifySr2jbLifecycle({
  head, parent: head === SR2JB_BASELINE ? null : run(["rev-parse", "HEAD^"]),
  originHead, behind: counts[0], ahead: counts[1],
  worktreePaths: worktree, stagedPaths: staged, deltaPaths: delta,
  deleted: lines(run(["diff", "--name-only", "--diff-filter=D", "--", ...SR2JB_PATHS])).length > 0
});

// SR-2J-B's own frozen commit. Every "did SR-2J-B introduce this?" question is answered against
// THESE bytes, never the worktree: once a successor round lands, the worktree also contains the
// successor's features, and attributing those to SR-2J-B would be simply wrong.
const SR2JB_FROZEN_COMMIT = "8a1da28732dcd88efb87f0c5543fc76fb66bb708";
const frozenExists = child.spawnSync("git", ["cat-file", "-e", `${SR2JB_FROZEN_COMMIT}^{commit}`], { cwd: root }).status === 0;
const readSelf = (f) => {
  if (!frozenExists) return read(f);
  const shown = child.spawnSync("git", ["-c", "core.safecrlf=false", "show", `${SR2JB_FROZEN_COMMIT}:${f}`],
    { cwd: root, encoding: "utf8" });
  return shown.status === 0 ? (shown.stdout ?? "") : read(f);
};
const types = readSelf("apps/mobile/features/meal-buddy-chat/types.ts");
const contracts = readSelf("apps/mobile/features/meal-buddy-chat/supabaseContracts.ts");
const repository = readSelf("apps/mobile/features/meal-buddy-chat/repository.ts");
const controller = readSelf("apps/mobile/features/meal-buddy-chat/controller.ts");
const screen = readSelf("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx");
const route = readSelf("apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx");
const inbox = readSelf("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx");
const panel = readSelf("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx");
const hook = readSelf("apps/mobile/features/meal-buddy-chat/useMealBuddyChat.ts");
// Forbidden-feature scanning is scoped to what SR-2J-B itself authored: new files in full, and for
// pre-existing shared files only the lines this round ADDED. Legacy/demo strings that already lived
// in meal-buddies.tsx, the i18n bundle or the runtime composition must not raise false positives.
const NEW_PRODUCTION_PATHS = SR2JB_PRODUCTION_PATHS.filter((f) =>
  f.startsWith("apps/mobile/features/meal-buddy-chat/") || f === "apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx");
const TOUCHED_PRODUCTION_PATHS = SR2JB_PRODUCTION_PATHS.filter((f) => !NEW_PRODUCTION_PATHS.includes(f));
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", SR2JB_BASELINE,
    ...(frozenExists ? [SR2JB_FROZEN_COMMIT] : []), "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}
const candidateProduction = [
  ...NEW_PRODUCTION_PATHS.map(readSelf),
  ...TOUCHED_PRODUCTION_PATHS.map(addedLines)
].join("\n");

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

check("lifecycle is exact candidate or frozen-unpushed", lifecycle.valid);
check("baseline is the pushed SR-2J-A authority",
  run(["show", "-s", "--format=%s", SR2JB_BASELINE]) === SR2JB_BASELINE_SUBJECT
  && run(["merge-base", "--is-ancestor", SR2JB_BASELINE, "HEAD"]) === "");
// The expected count is derived from the canonical manifest itself, so the inventory check can
// never drift from the path set. Wildcards, duplicates and unknown paths all still fail.
// Under a successor phase the lifecycle manifest is SR-2J-B's own path set, so this inventory
// keeps measuring SR-2J-B rather than the accumulated delta.
check("exact wildcard-free path inventory",
  SR2JB_PATHS.length > 0
  && new Set(SR2JB_PATHS).size === SR2JB_PATHS.length
  // Only glob metacharacters are forbidden. Square brackets are NOT wildcards here: Expo Router
  // dynamic route files legitimately carry them (app/meal-buddy-chat/[relationshipRef].tsx).
  && SR2JB_PATHS.every((f) => typeof f === "string" && !/[*?]/.test(f) && !f.endsWith("/"))
  && lifecycle.manifest.every((f) => SR2JB_PATHS.includes(f)));

// ---- backend absence: SR-2J-B consumes the frozen SR-2J-A authority and adds no server byte ----
check("zero migrations in the candidate", lifecycle.manifest.every((f) => !f.startsWith("supabase/migrations/")));
check("zero supabase backend paths in the candidate", lifecycle.manifest.every((f) => !f.startsWith("supabase/")));
check("frozen SR-2J-A migration is byte-unchanged",
  sha(fs.readFileSync(path.join(root, SR2JB_FROZEN_MIGRATION))) === SR2JB_FROZEN_MIGRATION_SHA256);
check("no supabase path changed by SR-2J-B",
  lines(run(["diff", "--name-only", SR2JB_BASELINE,
    ...(frozenExists ? [SR2JB_FROZEN_COMMIT] : []), "--", "supabase"])).length === 0);
check("candidate touches only Mobile, shared i18n, scripts and package.json",
  lifecycle.manifest.every((f) => f.startsWith("apps/mobile/") || f === "lib/i18n/zh-TW.ts"
    || f.startsWith("scripts/") || f === "package.json"));

// ---- consumption of the exact frozen public contract ----
check("only the three frozen operations are used",
  /operation: "open"/.test(contracts) && /operation: "list_messages"/.test(contracts)
  && /operation: "send"/.test(contracts)
  && !/operation: "(?!open|list_messages|send)/.test(contracts));
check("function name is the frozen meal-buddy-chat endpoint",
  contracts.includes('"meal-buddy-chat" as const') && !/meal-buddy-chat-v2|chat-v2/.test(candidateProduction));
check("frozen policy version is pinned", types.includes('"meal-buddy-chat-v1"') && repository.includes("MEAL_BUDDY_CHAT_POLICY_VERSION"));
check("frozen 2000 body bound is mirrored, never widened",
  types.includes("MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 2000") && !/MAX_BODY_LENGTH = (?!2000)/.test(candidateProduction));
check("closed response validation uses exact key sets",
  (repository.match(/exactKeys\(/g) || []).length >= 4 && repository.includes("function exactKeys"));
check("unexpected server fields are rejected rather than ignored",
  repository.includes("invalid_server_response") && repository.includes("parseConversation")
  && repository.includes("parseMessage"));

// ---- opaque reference discipline ----
check("all four opaque identities are branded distinctly",
  /relationshipRefBrand/.test(types) && /conversationRefBrand/.test(types)
  && /messageRefBrand/.test(types) && /cursorBrand/.test(types));
check("refs are validated by frozen prefixes",
  types.includes('"mbr1." as const') && types.includes('"mbchat1." as const') && types.includes('"mbmsg1." as const'));
check("no client-side ref decoding, decryption or parsing",
  !/atob|Buffer\.from\([^)]*base64|decodeRef|JSON\.parse\(\s*ref/i.test(candidateProduction));
check("no raw uuid or database identifier is ever sent",
  !/senderUserId|targetUserId|conversationId:|relationshipId:|pairKey|userLowId|userHighId/.test(candidateProduction));
check("route identity is the opaque relationship ref, never a uuid or display name",
  route.includes("MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX") && !/displayName/.test(route));

// ---- lazy creation: the decisive product gate ----
check("only the chat controller may call open",
  (candidateProduction.match(/\.open\(/g) || []).length === (controller.match(/\.open\(/g) || []).length);
check("neither relationship surface performs a chat transport call",
  !/repository\.|invoke\(|useMealBuddyChat\(/.test(inbox) && !/repository\.|invoke\(|useMealBuddyChat\(/.test(panel));
check("chat entry is offered only for an accepted relationship",
  /state === "accepted"/.test(inbox) && /state === "accepted"/.test(panel)
  && !/"incoming_pending"[^)]*onOpenChat|onOpenChat[^)]*"incoming_pending"/.test(inbox));
check("chat entry is a navigation callback, not an open call",
  /onOpenChat\?: \(relationshipRef: string\) => void/.test(inbox)
  && /onOpenChat\?: \(relationshipRef: string\) => void/.test(panel));
check("open is reached only through explicit route context",
  controller.includes("setContext") && controller.includes("this.repository.open"));

// ---- absence of out-of-scope messaging product authority ----
const forbidden = [
  ["realtime subscription", /\.channel\(|realtime|subscribeToChannel|postgres_changes/i],
  ["interval polling", /setInterval|setTimeout\([^)]*\b(poll|refresh)\b/i],
  ["unread state", /unread/i],
  ["read receipt", /readReceipt|read_receipt|seenAt|deliveredAt/i],
  ["typing indicator", /typing/i],
  ["presence", /presenceChannel|usePresence|presenceState|onlineStatus|isOnline|lastSeen/i],
  ["notification", /notification|expo-notifications|pushToken/i],
  ["attachment or media message", /attachment|imageMessage|voiceMessage|mediaMessage/i],
  ["message edit or delete authority", /editMessage|deleteMessage|removeMessage/i],
  ["reaction", /reaction/i],
  ["group chat", /groupChat|participants\b/i]
];
for (const [label, pattern] of forbidden) {
  check(`no ${label} in the SR-2J-B candidate`, !pattern.test(candidateProduction));
}

// ---- idempotency and send safety ----
check("a secure uuid authority supplies idempotency keys",
  hook.includes("generateSecureUuidV4") && !/Math\.random|Date\.now\(\)\s*\+|counter\+\+/.test(controller));
check("the idempotency key is allocated once per logical send",
  (controller.match(/this\.uuidFactory\(\)/g) || []).length === 1);
check("retry reuses the pending key instead of allocating a new one",
  /retrySend/.test(controller) && /\.\.\.pending, phase: "sending"/.test(controller));
check("an uncertain send preserves both body and key",
  /phase: "retryable"/.test(controller) && /\.\.\.pending, phase: "retryable"/.test(controller));
check("a second send is gated while one logical send is unresolved",
  /this\.state\.pendingSend\)? *return false|state\.pendingSend\) return false/.test(controller)
  || /this\.state\.phase !== "ready" \|\| this\.state\.pendingSend/.test(controller));
check("no optimistic message is written into canonical history",
  controller.includes("result.value.message") && !/messages: \[\.\.\.this\.messages, \{ body/.test(controller));

// ---- authorization failure clears history ----
check("authorization failure clears session state and history",
  /failClosed/.test(controller) && /resetSessionState\(\);\s*\n\s*this\.update\(Object\.freeze\(\{ phase: "unavailable"/.test(controller));
check("the unavailable screen renders no message list and no composer",
  /phase === "unavailable"/.test(screen)
  && screen.indexOf("unavailableHint") < screen.indexOf("composerRow"));

// ---- actor isolation ----
check("actor key, generation and request sequence gate every completion",
  /actorKey/.test(controller) && /actorGeneration/.test(controller)
  && /requestSequence/.test(controller) && /isCurrent\(request\)/.test(controller));
check("actor change resets chat ref, messages, cursor and pending send",
  /resetSessionState\(\)/.test(controller) && /this\.conversationRef = null/.test(controller)
  && /this\.cursor = null/.test(controller) && /this\.messages = \[\]/.test(controller)
  && /this\.pendingSend = null/.test(controller));

// ---- no durable local authority ----
check("no local persistence of chat or message authority",
  !/AsyncStorage|SecureStore|localStorage|persistChat|saveMessages/.test(candidateProduction));

// ---- disclosure ----
check("only the frozen counterpart identity fields are consumed",
  /displayName/.test(types) && /mascotAvatarKey/.test(types)
  && !/publicBio|willingToChat|taste|rankingScore|entitlement/i.test(candidateProduction));
check("no internal error code reaches the UI",
  !/CHAT_IDEMPOTENCY_KEY_CONFLICT|advisory|pg_|search_path/.test(candidateProduction));

// ---- integrity ----
check("no deployment operator or credential material",
  !/(supabase\s+(db push|functions deploy)|--project-ref|SUPABASE_SERVICE_ROLE|DATABASE_URL)/.test(candidateProduction));
check("all candidate bytes are UTF-8 text without NUL",
  SR2JB_PATHS.every((f) => {
    const bytes = fs.readFileSync(path.join(root, f));
    return !bytes.includes(0) && !read(f).includes(String.fromCharCode(0xFFFD));
  }));
const manifest = createSr2jbManifest((f) => fs.readFileSync(path.join(root, f)));
check("canonical raw-byte manifest covers the exact sorted path set",
  manifest.entries.length === SR2JB_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === SR2JB_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log(JSON.stringify({
  suite: "meal-buddy-chat-sr2j-b-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  canonicalManifestSha256: manifest.aggregateSha256,
  frozenMigrationSha256: sha(fs.readFileSync(path.join(root, SR2JB_FROZEN_MIGRATION))),
  backendDelta: lifecycle.manifest.filter((f) => f.startsWith("supabase/")).length,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
