import crypto from "node:crypto";

// SR-2K-B — Social MVP final closure: unfriend, realtime chat delivery and push notifications.
// SR-2K-B's OWN freeze commit. Its authored delta is measured against this fixed point rather
// than against the worktree, so a later round editing the same shared files can never be attributed
// to SR-2K-B. Pinned, never derived.
export const SR2KB_FREEZE_COMMIT = "5df2fd85a0d35abfd73d51e247374607c2eab0ca";

export const SR2KB_BASELINE = "8a1da28732dcd88efb87f0c5543fc76fb66bb708";
export const SR2KB_BASELINE_SUBJECT = "Close SR-2K-A mobile Meal Buddy journey";

export const SR2KB_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260824010000_meal_buddy_unfriend_authority.sql",
  "supabase/migrations/20260824020000_meal_buddy_chat_realtime_authority.sql",
  "supabase/migrations/20260824030000_meal_buddy_push_notification_authority.sql"
]);

// Frozen predecessor migrations that must remain byte-identical: this round adds new files and
// replaces functions through `create or replace`, never by editing a frozen migration.
export const SR2KB_FROZEN_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql",
  "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql"
]);

export const SR2KB_PATHS = Object.freeze([
  // --- migrations -------------------------------------------------------------------------------
  ...SR2KB_MIGRATIONS,
  // --- Edge authority ---------------------------------------------------------------------------
  "supabase/config.toml",
  "supabase/functions/_shared/meal-buddy-chat-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/service.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/types.ts",
  "supabase/functions/_shared/meal-buddy-push-api/index.ts",
  "supabase/functions/_shared/meal-buddy-push-api/provider.ts",
  "supabase/functions/_shared/meal-buddy-push-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-push-api/request.ts",
  "supabase/functions/_shared/meal-buddy-push-api/service.ts",
  "supabase/functions/_shared/meal-buddy-push-api/types.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/request.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts",
  "supabase/functions/meal-buddy-push-device/config.ts",
  "supabase/functions/meal-buddy-push-device/errors.ts",
  "supabase/functions/meal-buddy-push-device/handler.ts",
  "supabase/functions/meal-buddy-push-device/index.ts",
  "supabase/functions/meal-buddy-push-dispatch/config.ts",
  "supabase/functions/meal-buddy-push-dispatch/handler.ts",
  "supabase/functions/meal-buddy-push-dispatch/index.ts",
  // --- Mobile -----------------------------------------------------------------------------------
  "apps/mobile/app.json",
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx",
  "apps/mobile/features/meal-buddy-chat/controller.ts",
  "apps/mobile/features/meal-buddy-chat/index.ts",
  "apps/mobile/features/meal-buddy-chat/repository.ts",
  "apps/mobile/features/meal-buddy-chat/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-chat/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-chat/supabaseRealtime.ts",
  "apps/mobile/features/meal-buddy-chat/types.ts",
  "apps/mobile/features/meal-buddy-chat/useMealBuddyChat.ts",
  "apps/mobile/features/meal-buddy-push/MealBuddyPushPermissionCard.tsx",
  "apps/mobile/features/meal-buddy-push/controller.ts",
  "apps/mobile/features/meal-buddy-push/expoDevicePort.ts",
  "apps/mobile/features/meal-buddy-push/index.ts",
  "apps/mobile/features/meal-buddy-push/installId.ts",
  "apps/mobile/features/meal-buddy-push/repository.ts",
  "apps/mobile/features/meal-buddy-push/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-push/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-push/types.ts",
  "apps/mobile/features/meal-buddy-push/useMealBuddyPush.ts",
  "apps/mobile/features/meal-buddy-push/useMealBuddyPushRouting.ts",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyUnfriendConfirm.tsx",
  "apps/mobile/features/meal-buddy-relationships/controller.ts",
  "apps/mobile/features/meal-buddy-relationships/index.ts",
  "apps/mobile/features/meal-buddy-relationships/repository.ts",
  "apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-relationships/types.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationshipProfile.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationships.ts",
  "apps/mobile/package.json",
  "lib/i18n/zh-TW.ts",
  "package-lock.json",
  // --- validation -------------------------------------------------------------------------------
  "package.json",
  "scripts/social-final-sr2k-b-concurrency.mjs",
  "scripts/social-final-sr2k-b-guard.mjs",
  "scripts/social-final-sr2k-b-mutations.mjs",
  "scripts/social-final-sr2k-b-postgres-apply.mjs",
  "scripts/social-final-sr2k-b-smoke.mjs",
  "scripts/social-final-sr2k-b-successor-manifest.mjs",
  // --- predecessor successor-awareness ONLY -----------------------------------------------------
  // Validation-only amendments: each predecessor guard learns this round's npm command keys, and
  // SR-2K-A additionally learns to measure its OWN frozen bytes rather than the successor worktree.
  "scripts/meal-buddy-closure-sr2k-a-guard.mjs",
  "scripts/meal-buddy-closure-sr2k-a-successor-manifest.mjs",
  "scripts/meal-buddy-chat-sr2j-a-guard.mjs",
  "scripts/meal-buddy-chat-sr2j-b-guard.mjs",
  "scripts/meal-buddy-chat-sr2j-b-mutations.mjs",
  "scripts/meal-buddy-chat-sr2j-b-successor-manifest.mjs",
  "scripts/meal-buddy-closure-sr2k-a-mutations.mjs",
  "scripts/meal-buddy-closure-sr2k-a-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-contract.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs"
].sort());

export const SR2KB_PRODUCTION_PATHS = Object.freeze(
  SR2KB_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json"
    && file !== "package-lock.json")
);

export const SR2KB_NPM_COMMANDS = Object.freeze({
  "test:social-final-sr2k-b": "node scripts/social-final-sr2k-b-guard.mjs",
  "test:social-final-sr2k-b-smoke": "node scripts/social-final-sr2k-b-smoke.mjs",
  "test:social-final-sr2k-b-mutations": "node scripts/social-final-sr2k-b-mutations.mjs",
  "test:social-final-sr2k-b-concurrency": "node scripts/social-final-sr2k-b-concurrency.mjs",
  "test:social-final-sr2k-b-postgres": "node scripts/social-final-sr2k-b-postgres-apply.mjs"
});

// §2 and §48. Push and realtime do NOT authorize any of these, and none may appear in the round's
// authored bytes. `unfriend`, `realtime` and `notification` are deliberately absent: this is the
// round that legitimately introduces them.
export const SR2KB_FORBIDDEN_FEATURES = Object.freeze([
  ["typing indicator", /typingIndicator|isTyping|typing_status|broadcastTyping/i],
  ["presence or online status", /presenceChannel|usePresence|presenceState|onlineStatus|isOnline|lastSeen|track\(\s*\{/i],
  ["read receipt or delivered state", /readReceipt|read_receipt|seenAt|seen_at|deliveredAt|delivered_at|markAsRead/i],
  ["media or image message", /imageMessage|voiceMessage|mediaMessage|messageAttachment|attachmentUrl/i],
  ["voice or video call", /voiceCall|videoCall|startCall|callSession|webrtc/i],
  ["reaction", /messageReaction|addReaction|reactionEmoji/i],
  ["message edit or delete", /editMessage|deleteMessage|removeMessage|message_edited|retractMessage/i],
  ["group or multi-person chat", /groupChat|groupConversation|multiPersonChat|conversationParticipants/i],
  ["message search", /searchMessages|messageSearch/i],
  ["notification centre or unread state", /notificationCenter|notificationCentre|unreadCount|unread_count|badgeCount/i],
  ["geo or nearby authority", /geolocation|expo-location|latitude|longitude|nearbyCandidates|distanceKm/i]
]);

// Demo Meal Buddy authority that must stay unreachable from the real-mode surfaces.
export const SR2KB_DEMO_AUTHORITY = Object.freeze([
  "getMealBuddyChats", "getMealBuddyInvites", "createMealBuddyInvite", "acceptMealBuddyInvite",
  "declineMealBuddyInvite", "mockMatchedBuddies", "mockGatheringRecords", "addMealBuddyChatMessage"
]);

// Shared invariants over SR-2K-B authored source. The guard runs them against the real tree and the
// mutation suite against mutated text, so the two can never drift.
export function auditSr2kbAuthoredSources(sources) {
  const get = (key) => sources.get(key) ?? "";
  const unfriendSql = get("unfriendSql");
  const realtimeSql = get("realtimeSql");
  const pushSql = get("pushSql");
  const relationshipApi = get("relationshipApi");
  const relationshipRequest = get("relationshipRequest");
  const chatApiTypes = get("chatApiTypes");
  const chatApiRepository = get("chatApiRepository");
  const pushApiService = get("pushApiService");
  const pushApiRequest = get("pushApiRequest");
  const pushDispatchConfig = get("pushDispatchConfig");
  const pushDispatchHandler = get("pushDispatchHandler");
  const pushDeviceHandler = get("pushDeviceHandler");
  const mobileRelController = get("mobileRelController");
  const mobileRelRepository = get("mobileRelRepository");
  const inbox = get("inbox");
  const panel = get("panel");
  const confirm = get("confirm");
  const chatController = get("chatController");
  const chatRepository = get("chatRepository");
  const chatRealtime = get("chatRealtime");
  const pushController = get("pushController");
  const pushTypes = get("pushTypes");
  const pushRouting = get("pushRouting");
  const config = get("config");
  const authored = sources.get("authoredDelta") ?? [...sources.values()].join("\n");
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };
  // "This file must not mention X" rules are applied to CODE, never to prose. A comment that
  // explains why a mechanism was rejected, or that a counterpart is deliberately not blocked, is
  // exactly the documentation these rules exist to encourage.
  const code = (text) => text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("--") && !trimmed.startsWith("*");
  }).join("\n");

  // --- PART A: unfriend (§6-§14) ----------------------------------------------------------------
  rule("unfriend introduces its own canonical terminal state",
    /state in \('pending', 'accepted', 'declined', 'cancelled', 'ended'\)/.test(unfriendSql)
    && /add column ended_at timestamptz/.test(unfriendSql));
  rule("ended is reachable only from accepted and keeps its history",
    /\(state = 'ended' and accepted_at is not null and resolved_at is not null and ended_at is not null\)/.test(unfriendSql));
  rule("unfriend refuses anything that is not currently accepted",
    /if v_relation\.state <> 'accepted' then return; end if;/.test(unfriendSql));
  rule("a repeated unfriend is idempotent rather than an error",
    /if v_relation\.state = 'ended' then/.test(unfriendSql));
  rule("unfriend runs under the frozen canonical pair lock",
    /perform social_internal\.lock_meal_buddy_relationship_pair/.test(unfriendSql));
  rule("unfriend creates no block and touches no block authority",
    !/social_blocks/.test(unfriendSql));
  rule("unfriend deletes no conversation or message row",
    !/delete\s+from\s+public\.meal_buddy_(conversations|messages)/i.test(`${unfriendSql}\n${realtimeSql}\n${pushSql}`));
  rule("a re-invite reuses the one canonical row and clears the end instant",
    /state in \('declined', 'cancelled', 'ended'\)/.test(unfriendSql) && /ended_at = null/.test(unfriendSql));
  rule("the Edge exposes unfriend on the actor-bound relationship reference only",
    /operation === "unfriend"/.test(relationshipRequest)
    && /"accept" \| "decline" \| "cancel" \| "unfriend"; relationshipRef: string/.test(get("relationshipTypes"))
    && /end_meal_buddy_relationship/.test(relationshipApi));
  rule("Mobile can only unfriend an accepted relationship",
    /this\.mutate\("unfriend", "accepted"\)/.test(mobileRelController)
    && /this\.mutate\("unfriend", relationshipRef, "accepted"\)/.test(mobileRelController));
  rule("an unfriend must resolve to the canonical none state",
    /operation === "unfriend" \? "none"/.test(mobileRelRepository));
  rule("ending a relationship is confirmed before anything is sent",
    /copy\.unfriendConfirmTitle/.test(confirm) && /copy\.unfriendConfirm/.test(confirm)
    && /onRequestEnd\(relationship\.relationshipRef\)/.test(inbox)
    && /setConfirmingEnd\(true\)/.test(panel));
  rule("the confirmation states the consequence and does not imply a block",
    /copy\.unfriendConfirmBody/.test(confirm) && !/block|封鎖/i.test(code(confirm)));

  // --- PART B: realtime (§15-§25) ---------------------------------------------------------------
  rule("realtime uses private broadcast, never postgres_changes",
    !/postgres_changes/.test(code(`${realtimeSql}\n${chatRealtime}`))
    && /config: \{ private: true \}/.test(chatRealtime));
  rule("no client role is granted select on the chat message tables",
    !/grant\s+select[^;]*on\s+table\s+public\.meal_buddy_messages\s+to\s+(authenticated|anon|public)/i.test(
      `${realtimeSql}\n${pushSql}`));
  rule("the channel identity is a server-minted opaque topic, not a database id",
    /create table public\.meal_buddy_chat_channels/.test(realtimeSql)
    && /topic like 'mbrt1\.%'/.test(realtimeSql)
    && !/topic\s*:=\s*[^;]*conversation_id::text/.test(realtimeSql));
  rule("the subscribe gate takes only a topic, so it cannot be used as an oracle",
    /create function public\.meal_buddy_chat_realtime_authorized\(p_topic text\)/.test(realtimeSql)
    // The subject comes from the CONNECTION, never from an argument, so an authenticated caller can
    // only ever ask about itself. It is read straight from the request settings because the platform
    // will not let the migration runner confer `auth` USAGE on a project role.
    && /current_setting\('request\.jwt\.claim\.sub', true\)/.test(realtimeSql)
    && /subject\.user_id in \(relation\.user_low_id, relation\.user_high_id\)/.test(realtimeSql)
    && !/meal_buddy_chat_realtime_authorized\(p_topic text\s*,/.test(realtimeSql));
  rule("the subscribe gate re-checks accepted state and the frozen safety authority",
    /relation\.state = 'accepted'/.test(realtimeSql)
    && /social_internal\.may_evaluate_candidate/.test(realtimeSql));
  rule("subscribing is authorized by RLS on the realtime spool",
    /create policy meal_buddy_chat_realtime_subscribe on realtime\.messages/.test(realtimeSql));
  rule("only a genuinely new canonical message publishes",
    /if v_inserted then/.test(realtimeSql) && /if v_inserted then/.test(pushSql));
  rule("the realtime payload carries no identity, body or counterpart data",
    /jsonb_build_object\('kind', 'meal_buddy_chat_activity'\)/.test(realtimeSql)
    && /jsonb_build_object\('kind', 'meal_buddy_chat_activity'\)/.test(pushSql)
    && !/jsonb_build_object\('kind', 'meal_buddy_chat_activity',/.test(`${realtimeSql}\n${pushSql}`));
  rule("Mobile treats a frame as a signal and re-reads canonical history",
    /async reconcile\(\)/.test(chatController)
    && /this\.repository\.listMessages\(this\.conversationRef, null, MEAL_BUDDY_CHAT_PAGE_SIZE\)/.test(chatController));
  rule("Mobile subscribes only to a topic the server issued on an authorized open",
    // Both open paths — the initial open and an explicit refresh — must subscribe to the topic the
    // server just issued, and there must be no OTHER call site that could supply a made-up one.
    (chatController.match(/this\.attachRealtime\(opened\.value\.realtimeTopic\)/g) ?? []).length === 2
    && (chatController.match(/this\.attachRealtime\(/g) ?? []).length === 2);
  rule("every teardown path unsubscribes",
    /private detachRealtime\(\)/.test(chatController)
    && /this\.detachRealtime\(\);\s*\n\s*this\.conversationRef = null;/.test(chatController));
  rule("a malformed topic is refused rather than used",
    /isMealBuddyChatRealtimeTopic/.test(chatRepository));
  rule("realtime adds no interval polling anywhere",
    !/setInterval/.test(`${chatController}\n${chatRealtime}\n${chatRepository}`));

  // --- PART C: push (§26-§38) -------------------------------------------------------------------
  rule("push registration is per user and per installation",
    /unique \(user_id, install_id\)/.test(pushSql));
  rule("one provider token addresses exactly one device",
    /constraint meal_buddy_push_devices_token_unique unique \(push_token\)/.test(pushSql));
  rule("a rotated token releases every previous holder",
    /delete from public\.meal_buddy_push_devices as device\s*\n\s*where device\.push_token = p_push_token\s*\n\s*and not \(device\.user_id = p_user_id and device\.install_id = p_install_id\);/.test(pushSql));
  rule("device and outbox tables are sealed from every client role",
    /revoke all on table public\.meal_buddy_push_devices from public, anon, authenticated, authenticator, service_role/.test(pushSql)
    && /revoke all on table public\.meal_buddy_notification_outbox from public, anon, authenticated, authenticator, service_role/.test(pushSql));
  rule("a sender can never receive their own notification",
    /constraint meal_buddy_notification_outbox_recipient_not_actor check \(recipient_user_id <> actor_user_id\)/.test(pushSql));
  rule("one canonical event produces one durable row, deduplicated by the event itself",
    /dedupe_key text not null unique/.test(pushSql) && /on conflict \(dedupe_key\) do nothing/.test(pushSql));
  rule("only the three authorized event kinds are representable",
    /event_kind in \('meal_buddy_invite_received', 'meal_buddy_invite_accepted', 'meal_buddy_message_received'\)/.test(pushSql));
  rule("enqueue happens inside the canonical event transactions",
    /perform social_internal\.enqueue_meal_buddy_notification\([\s\S]{0,400}'meal_buddy_invite_received'/.test(pushSql)
    && /'meal_buddy_invite_accepted'/.test(pushSql) && /'meal_buddy_message_received'/.test(pushSql));
  rule("decline and cancel deliberately notify nobody",
    !/p_action = 'decline'[\s\S]{0,300}enqueue_meal_buddy_notification/.test(pushSql));
  rule("the dispatcher is secret-gated and never a user endpoint",
    /MEAL_BUDDY_PUSH_DISPATCH_SECRET/.test(pushDispatchConfig)
    && /secretMatches\(config\.value\.dispatchSecret/.test(pushDispatchHandler)
    && !/authenticateCaller/.test(pushDispatchHandler));
  rule("the dispatch secret is compared in constant time",
    /difference \|= expected\.charCodeAt\(index\) \^ presented\.charCodeAt\(index\)/.test(pushDispatchConfig));
  rule("the device endpoint binds the owner to the verified subject",
    /service\.execute\(authentication\.value\.userId, parsed\.value\)/.test(pushDeviceHandler)
    && /authenticateCaller/.test(pushDeviceHandler)
    && !/parsed\.value as \{/.test(pushDeviceHandler));
  rule("a device request may not name an actor through url or headers",
    /carriesMealBuddyPushAuthorityInput/.test(pushDeviceHandler)
    && /x-actor-user-id/.test(pushApiRequest));
  rule("notification copy is privacy safe and carries no body",
    /傳了一則訊息給你/.test(pushApiService) && !/\$\{body\}|message\.body/.test(pushApiService));
  rule("the push payload carries no identifier of any kind",
    /route: "meal-buddies" as const, section: "friends" as const/.test(pushApiService)
    && !/relationshipId|conversationId|messageId|userId|pairKey/.test(pushApiService));
  rule("one logical event fans out to devices without duplicating the event",
    /join public\.meal_buddy_push_devices as device on device\.user_id = claimed\.recipient_user_id/.test(pushSql));
  rule("a dead device is retired without suppressing a healthy one",
    /ticket\.unregistered/.test(pushApiService) && /current\.delivered = true/.test(pushApiService));
  rule("a provider failure never rolls back canonical Social state",
    /complete_meal_buddy_notification/.test(pushSql) && !/rollback/i.test(pushApiService));
  rule("Mobile prompts at most once per session and treats refusal as settled",
    /this\.promptedThisSession/.test(pushController)
    && (pushController.match(/phase: "denied"/g) ?? []).length === 2
    && /this\.update\(Object\.freeze\(\{ phase: "denied" \}\)\);\s*\n\s*return false;/.test(pushController)
    && !/throw new Error/.test(pushController));
  rule("Mobile never stores a push token on the device",
    !/setItem\([^)]*token/i.test(`${pushController}\n${get("pushInstallId")}\n${get("pushHook")}`));
  rule("a notification tap is navigation intent that resolves to a safe surface",
    /resolveMealBuddyPushRoute/.test(pushRouting)
    && /record\.route !== "meal-buddies" \|\| record\.section !== "friends"/.test(pushTypes));
  rule("an unrecognised or forged payload routes nowhere",
    /if \(!route\) return;/.test(pushRouting));
  rule("both push endpoints are declared with the correct jwt posture",
    /\[functions\.meal-buddy-push-device\][\s\S]{0,400}verify_jwt = true/.test(config)
    && /\[functions\.meal-buddy-push-dispatch\][\s\S]{0,500}verify_jwt = false/.test(config));

  // --- cross-cutting ----------------------------------------------------------------------------
  rule("no demo Meal Buddy authority reaches the real relationship or chat surfaces",
    SR2KB_DEMO_AUTHORITY.every((name) => !`${inbox}\n${panel}\n${confirm}\n${chatController}`.includes(name)));
  rule("no tier rule reaches unfriend, realtime or push",
    !/isPremium|entitlement|premium_tier|quota/i.test(
      `${mobileRelController}\n${chatController}\n${pushController}\n${unfriendSql}\n${realtimeSql}\n${pushSql}`));
  rule("the chat conversation type is unchanged for list and send",
    /conversation: MealBuddyChatConversation; messages: readonly MealBuddyChatMessage\[\]/.test(chatApiTypes)
    && /conversation: MealBuddyChatConversation; message: MealBuddyChatMessage/.test(chatApiTypes));
  rule("the topic is issued inside the same authorized transaction as the open",
    /authorize_meal_buddy_chat_channel/.test(chatApiRepository));

  for (const [label, pattern] of SR2KB_FORBIDDEN_FEATURES) {
    rule(`no ${label}`, !pattern.test(authored));
  }
  rule("no deployment operator or credential material is embedded",
    !/(supabase\s+(db push|functions deploy)|--project-ref|SUPABASE_SERVICE_ROLE|DATABASE_URL)/.test(authored));
  return Object.freeze(violations);
}

const exact = (a, b) => {
  const left = [...a].sort(); const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

// Shared recognizer for "the frozen SR-2K-B commit sits directly on the pushed SR-2K-A authority".
export function matchesCanonicalSr2kbSuccessor(state) {
  const parent = state.parent ?? state.headParent ?? null;
  const delta = state.deltaPaths ?? state.headDeltaPaths
    ?? (Array.isArray(state.headDeltaEntries) ? state.headDeltaEntries.map((entry) => entry.path) : null);
  const deleted = state.deleted === true || state.headDeleted === true
    || (Array.isArray(state.headDeltaEntries) && state.headDeltaEntries.some((entry) => entry.status === "D"));
  if (!Array.isArray(delta)) return false;
  return parent === SR2KB_BASELINE
    && state.originHead === SR2KB_BASELINE
    && state.ahead === 1 && state.behind === 0
    && !deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(delta, SR2KB_PATHS);
}

export function classifySr2kbLifecycle(state) {
  const candidate = state.head === SR2KB_BASELINE && state.originHead === SR2KB_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0 && exact(state.worktreePaths, SR2KB_PATHS);
  const frozen = state.head !== SR2KB_BASELINE && state.parent === SR2KB_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, SR2KB_PATHS);
  const frozenUnpushed = frozen && state.originHead === SR2KB_BASELINE && state.ahead === 1 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createSr2kbManifest(readBytes) {
  const entries = SR2KB_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    entries,
    text,
    aggregateSha256: crypto.createHash("sha256").update(text, "utf8").digest("hex")
  });
}
