import crypto from "node:crypto";
import { SR2KB_BASELINE, SR2KB_PATHS } from "./social-final-sr2k-b-successor-manifest.mjs";

// SR-2K-A — Mobile Meal Buddy closure.
//
// The round closes the EXISTING real-mode Meal Buddy journey. It introduces no backend authority of
// any kind: the frozen SR-2G/SR-2H/SR-2I/SR-2J server contracts are consumed exactly as they are.
export const SR2KA_BASELINE = "4f6dc34d52b4aee22081cc00672c8e312c045d3a";
export const SR2KA_BASELINE_SUBJECT = "Activate SR-2J-B mobile Meal Buddy chat";

// The newest frozen migration in the tree. SR-2K-A must leave it byte-identical, which is the
// positive half of the "zero backend delta" proof; the negative half is that no `supabase/` path
// appears in the candidate at all.
export const SR2KA_FROZEN_MIGRATION = "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql";
export const SR2KA_FROZEN_MIGRATION_SHA256 = "b48c911c9239e545d713b69fc15faa2cc259c84d645214e18823b844991b43b8";

export const SR2KA_PATHS = Object.freeze([
  // --- production: the closed real-mode journey -------------------------------------------------
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx",
  "apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx",
  "apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx",
  "apps/mobile/features/meal-buddy-relationships/refBoundary.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationships.ts",
  "lib/i18n/zh-TW.ts",
  // --- validation -------------------------------------------------------------------------------
  "package.json",
  "scripts/meal-buddy-closure-sr2k-a-guard.mjs",
  "scripts/meal-buddy-closure-sr2k-a-mutations.mjs",
  "scripts/meal-buddy-closure-sr2k-a-smoke.mjs",
  "scripts/meal-buddy-closure-sr2k-a-successor-manifest.mjs",
  // --- predecessor successor-awareness ONLY -----------------------------------------------------
  // Each of these carries a validation-only amendment: the round's three new npm command keys are
  // added to the guard's package.json strip list, and SR-2J-B's manifest additionally learns to
  // recognise this round as its canonical successor — exactly as SR-2J-A's manifest already
  // recognises SR-2J-B. No predecessor assertion is weakened or removed by any of them.
  "scripts/meal-buddy-chat-sr2j-b-successor-manifest.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
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

// Only these SR-2K-A paths may carry production (non-validation) bytes.
export const SR2KA_PRODUCTION_PATHS = Object.freeze(
  SR2KA_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json")
);

// Files this round AUTHORS outright. Everything else it touches is pre-existing and is scanned by
// its added lines only, so legacy/demo bytes cannot raise a false positive.
export const SR2KA_NEW_PRODUCTION_PATHS = Object.freeze([
  "apps/mobile/features/meal-buddy-relationships/refBoundary.ts"
]);

export const SR2KA_NPM_COMMANDS = Object.freeze({
  "test:meal-buddy-closure-sr2k-a": "node scripts/meal-buddy-closure-sr2k-a-guard.mjs",
  "test:meal-buddy-closure-sr2k-a-smoke": "node scripts/meal-buddy-closure-sr2k-a-smoke.mjs",
  "test:meal-buddy-closure-sr2k-a-mutations": "node scripts/meal-buddy-closure-sr2k-a-mutations.mjs"
});

// The five opaque reference families that cross the app's public boundary, and the prefix each one
// is minted with. SR-2K-A may not add, remove, rename or collapse any of them.
export const SR2KA_REF_FAMILIES = Object.freeze({
  card: "mbc1.",
  candidate: "scr1.",
  relationship: "mbr1.",
  thread: "mbchat1.",
  entry: "mbmsg1."
});

// §28 hard absence guard. SR-2K-A is closure, not Chat V2. Matched against AUTHORED bytes only.
export const SR2KA_FORBIDDEN_FEATURES = Object.freeze([
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
  ["group chat", /groupChat|multiPersonThread/i],
  ["unfriend authority", /unfriend|removeBuddy|deleteRelationship/i],
  ["geo or nearby authority", /geolocation|expo-location|latitude|longitude|nearbyCandidates|distanceKm/i]
]);

// Demo Meal Buddy authority that must remain unreachable from the real-mode relationship journey.
export const SR2KA_DEMO_AUTHORITY = Object.freeze([
  "getMealBuddyChats", "getMealBuddyInvites", "createMealBuddyInvite", "acceptMealBuddyInvite",
  "declineMealBuddyInvite", "mockMatchedBuddies", "mockGatheringRecords", "getMealBuddyCandidates",
  "rankMealBuddyRecommendations", "drawMatchedMealBuddyCandidates", "addMealBuddyChatMessage"
]);

// Invariants that must hold over SR-2K-A authored source. Returns the list of violated rule names so
// the guard (real tree) and the mutation suite (mutated text) share ONE definition and cannot drift.
export function auditSr2kaAuthoredSources(sources) {
  const get = (key) => sources.get(key) ?? "";
  const refBoundary = get("refBoundary");
  const inbox = get("inbox");
  const panel = get("panel");
  const profileRoute = get("profileRoute");
  const chatRoute = get("chatRoute");
  const chatScreen = get("chatScreen");
  const home = get("home");
  const hook = get("hook");
  const i18n = get("i18n");
  // Absence rules are scanned against the bytes THIS round authored: files it creates in full, plus
  // only the lines it added to a pre-existing file. Legacy demo bytes that already lived in
  // meal-buddies.tsx or the i18n bundle can therefore never raise a false positive.
  const authored = sources.get("authoredDelta") ?? [...sources.values()].join("\n");
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };

  // --- reference boundary (§21, §22) ------------------------------------------------------------
  rule("five distinct reference families",
    Object.entries(SR2KA_REF_FAMILIES).every(([family, prefix]) =>
      new RegExp(`${family}: "${prefix.replace(".", "\\.")}"`).test(refBoundary)));
  rule("reference length is bounded", /MEAL_BUDDY_REF_MAX_LENGTH = 512/.test(refBoundary)
    && /value\.length > MEAL_BUDDY_REF_MAX_LENGTH/.test(refBoundary));
  rule("a bare prefix carries no identity", /value\.length <= prefix\.length/.test(refBoundary));
  rule("a reference must resolve to exactly one family",
    /matched\.length === 1 && matched\[0\] === family/.test(refBoundary));
  rule("the route reader fails closed instead of guessing",
    /isMealBuddyRefOfFamily\(raw, family\) \? \(raw as string\) : null/.test(refBoundary));
  rule("no reference is decoded, parsed or converted",
    !/atob|Buffer\.from|decodeURIComponent|JSON\.parse|\.replace\(\s*MEAL_BUDDY_REF_PREFIXES/.test(refBoundary));
  rule("the boundary holds no state and performs no io",
    !/fetch\(|invoke\(|AsyncStorage|SecureStore|localStorage|useState|useEffect/.test(refBoundary));

  // --- dynamic routes fail closed (§22) ---------------------------------------------------------
  rule("candidate route identity goes through the boundary",
    /readMealBuddyRouteRef\(params\.candidateRef, "candidate"\)/.test(profileRoute)
    && !/startsWith\("scr1\."\)/.test(profileRoute));
  rule("chat route identity goes through the boundary and keeps the frozen prefix pin",
    /readMealBuddyRouteRef\(params\.relationshipRef, "relationship"\)/.test(chatRoute)
    && chatRoute.includes("MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX"));
  rule("no route falls back to a raw identifier",
    !/\?\?\s*params\.(candidateRef|relationshipRef)|as string\s*\)\s*\?\?/.test(`${profileRoute}\n${chatRoute}`));

  // --- no dead end (§14, §8) --------------------------------------------------------------------
  rule("the candidate profile can always return somewhere useful",
    /router\.canGoBack\(\)/.test(profileRoute)
    && /router\.replace\(\{ pathname: "\/meal-buddies", params: \{ section: "friends" \} \}\)/.test(profileRoute));
  rule("chat can always return somewhere useful",
    /router\.canGoBack\(\)/.test(chatRoute)
    && /router\.replace\(\{ pathname: "\/meal-buddies", params: \{ section: "friends" \} \}\)/.test(chatRoute));
  rule("the fail-closed chat screen names where it returns to", /copy\.backToBuddies/.test(chatScreen));

  // --- relationship area closure (§10, §11, §12, §19, §20) --------------------------------------
  rule("the three canonical states are distinct bands",
    /key: "incoming_pending"/.test(inbox) && /key: "outgoing_pending"/.test(inbox)
    && /key: "accepted"/.test(inbox));
  rule("every band owns an honest empty line",
    /emptyLabel: copy\.emptyIncoming/.test(inbox) && /emptyLabel: copy\.emptyOutgoing/.test(inbox)
    && /emptyLabel: copy\.emptyAccepted/.test(inbox)
    && /band\.items\.length === 0/.test(inbox));
  rule("an established buddy is a standing band, not resolved history",
    /title: copy\.acceptedGroupTitle/.test(inbox) && /subtitle: copy\.acceptedGroupSubtitle/.test(inbox));
  rule("server order is preserved and never capped",
    /relationships\.filter\(\(relationship\) => relationship\.state === state\)/.test(inbox)
    && !/\.sort\(|\.slice\(0,\s*\d+\)|\.reverse\(\)/.test(inbox));
  rule("a load in progress states only that",
    /phase === "loading"/.test(inbox)
    && inbox.indexOf('phase === "loading"') < inbox.indexOf("bandsFor(state.relationships)"));
  rule("relationship identity is the frozen minimal counterpart",
    inbox.includes("relationship.counterpart.displayName")
    && inbox.includes("relationship.counterpart.mascotAvatarKey"));
  rule("no raw state enum or opaque ref is rendered",
    !/<Text[^>]*>\s*\{?(?:outgoing_pending|incoming_pending|accepted|relationship\.relationshipRef|relationship\.state)\}?/.test(inbox));
  rule("lifecycle actions target the opaque relationship ref, never a display name",
    inbox.includes("controller.accept(relationship.relationshipRef)")
    && inbox.includes("controller.decline(relationship.relationshipRef)")
    && inbox.includes("controller.cancel(relationship.relationshipRef)")
    && !/controller\.(?:accept|decline|cancel)\([^)]*displayName/.test(inbox));
  rule("a canonical re-read is offered without a second data source",
    /label={copy\.reload}/.test(inbox) && /controller\.retry\(\)/.test(inbox));

  // --- interaction and accessibility (§26) ------------------------------------------------------
  rule("every relationship control announces its label and its disabled state",
    /accessibilityLabel=\{label\}/.test(inbox) && /accessibilityLabel=\{label\}/.test(panel)
    && /accessibilityState=\{\{ disabled \}\}/.test(inbox)
    && /accessibilityState=\{\{ disabled \}\}/.test(panel));
  rule("a control with an unresolved action cannot be tapped again",
    (inbox.match(/disabled=\{state\.pendingAction !== null\}/g) ?? []).length >= 4
    && (panel.match(/disabled=\{state\.pendingAction !== null\}/g) ?? []).length >= 4);

  // --- chat entry stays explicit (§13) ----------------------------------------------------------
  rule("chat entry is offered only for an established relationship",
    /state === "accepted"/.test(inbox) && /state === "accepted"/.test(panel));
  rule("chat entry is a navigation callback, never a transport call",
    /onOpenChat\?: \(relationshipRef: string\) => void/.test(inbox)
    && !/\.open\(|useMealBuddyChat\(|repository\.|invoke\(/.test(`${inbox}\n${panel}`));

  // --- cross-screen reconciliation (§15, §16) ---------------------------------------------------
  rule("returning to the relationship area re-reads canonical truth",
    /useFocusEffect\(/.test(home) && /reconcileRealRelationships\(\)/.test(home));
  rule("the reconcile callback cannot re-trigger itself",
    /\[isRealCandidateMode, reconcileRealRelationships\]/.test(home)
    && /useMemo\(\(\) => Object\.freeze\(\{[\s\S]{0,400}retry: \(\) => controller\.load\(\)/.test(hook));
  rule("reconciliation reuses the canonical controller entry point, adding no transport call",
    !/repository\.|invoke\(|functions\./.test(hook));

  // --- real/demo isolation (§5) -----------------------------------------------------------------
  rule("no demo authority reaches the real relationship surfaces",
    SR2KA_DEMO_AUTHORITY.every((name) => !`${inbox}\n${panel}\n${profileRoute}\n${chatRoute}`.includes(name)));
  rule("no relationship or buddy truth is persisted locally",
    !/AsyncStorage|SecureStore|localStorage|storage\.setItem|persistRelationship|persistBuddies/.test(
      `${inbox}\n${panel}\n${hook}\n${refBoundary}`));

  // --- copy (§25) -------------------------------------------------------------------------------
  rule("the closure vocabulary is zh-TW authority",
    ["incomingGroupTitle", "outgoingGroupTitle", "acceptedGroupTitle", "acceptedGroupSubtitle",
      "emptyIncoming", "emptyOutgoing", "emptyAccepted", "reload", "backToBuddies"]
      .every((key) => new RegExp(`${key}:`).test(i18n)));
  rule("no internal state name is exposed to the user",
    !/"(?:outgoing_pending|incoming_pending|accepted|none)"\s*[,}]/.test(i18n));

  // --- absence (§28, §3) ------------------------------------------------------------------------
  for (const [label, pattern] of SR2KA_FORBIDDEN_FEATURES) {
    rule(`no ${label}`, !pattern.test(authored));
  }
  rule("no deployment operator or credential material",
    !/(supabase\s+(db push|functions deploy)|--project-ref|SUPABASE_SERVICE_ROLE|DATABASE_URL)/.test(authored));
  return Object.freeze(violations);
}

const exact = (a, b) => {
  const left = [...a].sort(); const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

// Shared canonical recognizer for "the frozen SR-2K-A commit sits directly on top of the pushed
// SR-2J-B authority". Predecessor guards derive their delta two different ways — the HEAD commit's
// own path set, and the cumulative set from their OWN baseline — so a recognizer has to satisfy
// both. This one answers the first shape; predecessors that use the cumulative shape compare
// against their own union, which is why SR2KA_PATHS is exported.
export function matchesCanonicalSr2kaSuccessor(state) {
  const parent = state.parent ?? state.headParent ?? null;
  const delta = state.deltaPaths ?? state.headDeltaPaths
    ?? (Array.isArray(state.headDeltaEntries) ? state.headDeltaEntries.map((entry) => entry.path) : null);
  const deleted = state.deleted === true || state.headDeleted === true
    || (Array.isArray(state.headDeltaEntries) && state.headDeltaEntries.some((entry) => entry.status === "D"));
  if (!Array.isArray(delta)) return false;
  return parent === SR2KA_BASELINE
    && state.originHead === SR2KA_BASELINE
    && state.ahead === 1 && state.behind === 0
    && !deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(delta, SR2KA_PATHS);
}

export function classifySr2kaLifecycle(state) {
  const candidate = state.head === SR2KA_BASELINE && state.originHead === SR2KA_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0 && exact(state.worktreePaths, SR2KA_PATHS);
  const frozen = state.head !== SR2KA_BASELINE && state.parent === SR2KA_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, SR2KA_PATHS);
  const frozenUnpushed = frozen && state.originHead === SR2KA_BASELINE && state.ahead === 1 && state.behind === 0;
  // SR-2K-B is the canonical successor: its frozen commit sits directly on the PUSHED SR-2K-A
  // authority, so the delta measured from SR-2K-A's own baseline becomes the union of both path
  // sets. Recognising it keeps this guard measuring SR-2K-A's own invariants instead of reporting
  // the mere existence of a successor as a lifecycle defect. Under a successor phase the manifest
  // reports SR-2K-A's OWN path set, so every downstream check keeps measuring its own round.
  const successorUnion = [...new Set([...SR2KA_PATHS, ...SR2KB_PATHS])];
  const successorCandidate = state.head === SR2KB_BASELINE && state.originHead === SR2KB_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && (state.stagedPaths?.length ?? 0) === 0
    && (state.worktreePaths ?? []).every((file) => SR2KB_PATHS.includes(file));
  const successorFrozenUnpushed = state.head !== SR2KB_BASELINE
    && state.parent === SR2KB_BASELINE && state.originHead === SR2KB_BASELINE
    && state.ahead === 1 && state.behind === 0 && !state.deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(state.deltaPaths ?? [], successorUnion);

  const phase = candidate ? "candidate"
    : frozenUnpushed ? "frozen_unpushed"
    : successorCandidate ? "successor_candidate"
    : successorFrozenUnpushed ? "successor_frozen_unpushed"
    : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: phase.startsWith("successor_") ? SR2KA_PATHS
      : candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createSr2kaManifest(readBytes) {
  const entries = SR2KA_PATHS.map((path) => ({
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
