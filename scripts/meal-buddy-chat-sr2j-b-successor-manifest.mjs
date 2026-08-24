import crypto from "node:crypto";
import { SR2KA_BASELINE, SR2KA_PATHS } from "./meal-buddy-closure-sr2k-a-successor-manifest.mjs";
import { SR2KB_BASELINE, SR2KB_PATHS } from "./social-final-sr2k-b-successor-manifest.mjs";

export const SR2JB_BASELINE = "afbc4abd04204788f5b38392758627a6cd2ac2fd";
export const SR2JB_BASELINE_SUBJECT = "Add SR-2J-A relationship-gated chat authority";
// SR-2J-B consumes the already-frozen SR-2J-A backend authority. Its own delta must contain no
// migration, no Edge Function, and no shared server chat module.
export const SR2JB_FROZEN_MIGRATION = "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql";
export const SR2JB_FROZEN_MIGRATION_SHA256 = "b48c911c9239e545d713b69fc15faa2cc259c84d645214e18823b844991b43b8";

export const SR2JB_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx",
  "apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx",
  "apps/mobile/features/meal-buddy-chat/controller.ts",
  "apps/mobile/features/meal-buddy-chat/index.ts",
  "apps/mobile/features/meal-buddy-chat/repository.ts",
  "apps/mobile/features/meal-buddy-chat/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-chat/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-chat/types.ts",
  "apps/mobile/features/meal-buddy-chat/useMealBuddyChat.ts",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/meal-buddy-chat-sr2j-b-guard.mjs",
  "scripts/meal-buddy-chat-sr2j-b-mutations.mjs",
  "scripts/meal-buddy-chat-sr2j-b-smoke.mjs",
  "scripts/meal-buddy-chat-sr2j-b-successor-manifest.mjs",
  "scripts/meal-buddy-chat-sr2j-a-successor-manifest.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-successor-manifest.mjs",
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

// Only these SR-2J-B paths may carry production (non-validation) bytes.
export const SR2JB_PRODUCTION_PATHS = Object.freeze(
  SR2JB_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json")
);

// Product features SR-2J-B is explicitly forbidden from introducing. Matched against SR-2J-B
// AUTHORED bytes only (new files in full plus added lines of shared files), never whole legacy files.
export const SR2JB_FORBIDDEN_FEATURES = Object.freeze([
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
]);

// Invariants that must hold over SR-2J-B authored source. Returns the list of violated rule names,
// so both the guard (real tree) and the mutation suite (mutated text) can share one definition.
export function auditSr2jbAuthoredSources(sources) {
  const get = (key) => sources.get(key) ?? "";
  const authored = [...sources.values()].join("\n");
  const controller = get("controller");
  const repository = get("repository");
  const types = get("types");
  const contracts = get("contracts");
  const inbox = get("inbox");
  const panel = get("panel");
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };

  rule("frozen endpoint name", contracts.includes('"meal-buddy-chat" as const'));
  rule("frozen policy version", types.includes('"meal-buddy-chat-v1"'));
  rule("frozen 2000 body bound", types.includes("MEAL_BUDDY_CHAT_MAX_BODY_LENGTH = 2000"));
  rule("closed response validation", repository.includes("exactKeys") && repository.includes("invalid_server_response"));
  rule("branded opaque refs", /relationshipRefBrand/.test(types) && /conversationRefBrand/.test(types)
    && /messageRefBrand/.test(types) && /cursorBrand/.test(types));
  rule("no raw identifier is sent",
    !/senderUserId|targetUserId|conversationId:|relationshipId:|pairKey|userLowId|userHighId/.test(authored));
  rule("chat entry only for accepted", /state === "accepted"/.test(inbox) && /state === "accepted"/.test(panel));
  rule("relationship surfaces perform no chat transport",
    !/repository\.|invoke\(|useMealBuddyChat\(/.test(inbox) && !/repository\.|invoke\(|useMealBuddyChat\(/.test(panel));
  rule("single idempotency key allocation", (controller.match(/this\.uuidFactory\(\)/g) || []).length === 1);
  rule("retry reuses the pending key", /\.\.\.pending, phase: "sending"/.test(controller));
  rule("uncertain send stays retryable", /\.\.\.pending, phase: "retryable"/.test(controller));
  rule("authorization failure fails closed", /failClosed/.test(controller) && /resetSessionState\(\)/.test(controller));
  rule("actor generation gating", /actorGeneration/.test(controller) && /isCurrent\(request\)/.test(controller));
  rule("no durable local chat authority",
    !/AsyncStorage|SecureStore|localStorage|persistChat|saveMessages/.test(authored));
  rule("no internal error code surfaced", !/CHAT_IDEMPOTENCY_KEY_CONFLICT/.test(authored));
  for (const [label, pattern] of SR2JB_FORBIDDEN_FEATURES) {
    rule(`no ${label}`, !pattern.test(authored));
  }
  return Object.freeze(violations);
}

const exact = (a, b) => {
  const left = [...a].sort(); const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

// Shared canonical recognizer for "the frozen SR-2J-B commit sits directly on top of the pushed
// SR-2J-A authority". Predecessor guards build their lifecycle state with different field names
// (parent/headParent, deltaPaths/headDeltaPaths/headDeltaEntries), so every variant is normalized
// here rather than duplicating fragile conditions in each manifest. Recognition is by EXACT path
// set only: one extra, one missing, or one renamed path fails, as do deletions, a dirty worktree,
// staged bytes, a wrong parent, or any ahead/behind other than 1/0.
export function matchesCanonicalSr2jbSuccessor(state) {
  const parent = state.parent ?? state.headParent ?? null;
  const delta = state.deltaPaths ?? state.headDeltaPaths
    ?? (Array.isArray(state.headDeltaEntries) ? state.headDeltaEntries.map((entry) => entry.path) : null);
  const deleted = state.deleted === true || state.headDeleted === true
    || (Array.isArray(state.headDeltaEntries) && state.headDeltaEntries.some((entry) => entry.status === "D"));
  if (!Array.isArray(delta)) return false;
  return parent === SR2JB_BASELINE
    && state.originHead === SR2JB_BASELINE
    && state.ahead === 1 && state.behind === 0
    && !deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(delta, SR2JB_PATHS);
}

export function classifySr2jbLifecycle(state) {
  const candidate = state.head === SR2JB_BASELINE && state.originHead === SR2JB_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0 && exact(state.worktreePaths, SR2JB_PATHS);
  const frozen = state.head !== SR2JB_BASELINE && state.parent === SR2JB_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, SR2JB_PATHS);
  const frozenUnpushed = frozen && state.originHead === SR2JB_BASELINE && state.ahead === 1 && state.behind === 0;

  // SR-2K-A is the canonical successor: its frozen commit sits directly on the PUSHED SR-2J-B
  // authority, which is why the delta measured from SR-2J-B’s own baseline is the union of the two
  // path sets. Recognising it keeps this guard measuring SR-2J-B’s own invariants instead of
  // reporting the mere existence of a successor as a lifecycle defect — the same arrangement by
  // which SR-2J-A’s manifest already recognises SR-2J-B. Recognition stays EXACT: one extra, one
  // missing or one renamed path still fails, as do deletions, staged bytes, a dirty worktree, a
  // wrong parent, or any ahead/behind other than 1/0. Under a successor phase this manifest reports
  // SR-2J-B’s OWN path set, so every downstream check keeps measuring the round it belongs to.
  const successorUnion = [...new Set([...SR2JB_PATHS, ...SR2KA_PATHS])];
  const successorCandidate = state.head === SR2KA_BASELINE && state.originHead === SR2KA_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && (state.stagedPaths?.length ?? 0) === 0
    && (state.worktreePaths ?? []).every((file) => SR2KA_PATHS.includes(file));
  const successorFrozenUnpushed = state.head !== SR2KA_BASELINE
    && state.parent === SR2KA_BASELINE && state.originHead === SR2KA_BASELINE
    && state.ahead === 1 && state.behind === 0 && !state.deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(state.deltaPaths ?? [], successorUnion);

  // SR-2K-B is the next successor. Measured from SR-2J-B's own baseline the delta is now the
  // union of all three path sets, and the round that is dirty in the worktree is SR-2K-B's.
  const secondUnion = [...new Set([...SR2JB_PATHS, ...SR2KA_PATHS, ...SR2KB_PATHS])];
  const secondCandidate = state.head === SR2KB_BASELINE && state.originHead === SR2KB_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && (state.stagedPaths?.length ?? 0) === 0
    && (state.worktreePaths ?? []).every((file) => SR2KB_PATHS.includes(file));
  const secondFrozenUnpushed = state.head !== SR2KB_BASELINE
    && state.parent === SR2KB_BASELINE && state.originHead === SR2KB_BASELINE
    && state.ahead === 1 && state.behind === 0 && !state.deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(state.deltaPaths ?? [], secondUnion);

  const phase = candidate ? "candidate"
    : frozenUnpushed ? "frozen_unpushed"
    : successorCandidate ? "successor_candidate"
    : successorFrozenUnpushed ? "successor_frozen_unpushed"
    : secondCandidate ? "successor_candidate"
    : secondFrozenUnpushed ? "successor_frozen_unpushed"
    : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: phase.startsWith("successor_") ? SR2JB_PATHS
      : candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createSr2jbManifest(readBytes) {
  const entries = SR2JB_PATHS.map((path) => ({
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
