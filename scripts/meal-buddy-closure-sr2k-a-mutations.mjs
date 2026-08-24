#!/usr/bin/env node
// SR-2K-A mutation coverage: every closure invariant is proven to have teeth by mutating the
// authored source IN MEMORY and requiring the shared audit to reject it. Nothing is written to the
// repository, so a killed run leaves no mutant behind. Source text only; no network, no database.
import fs from "node:fs"; import path from "node:path"; import child from "node:child_process";
import {
  SR2KA_BASELINE, SR2KA_NEW_PRODUCTION_PATHS, SR2KA_PRODUCTION_PATHS, auditSr2kaAuthoredSources
} from "./meal-buddy-closure-sr2k-a-successor-manifest.mjs";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", SR2KA_BASELINE, "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
}

const REL = "apps/mobile/features/meal-buddy-relationships";
const pristine = new Map([
  ["refBoundary", read(`${REL}/refBoundary.ts`)],
  ["inbox", read(`${REL}/MealBuddyRelationshipInbox.tsx`)],
  ["panel", read(`${REL}/MealBuddyRelationshipPanel.tsx`)],
  ["hook", read(`${REL}/useMealBuddyRelationships.ts`)],
  ["profileRoute", read("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx")],
  ["chatRoute", read("apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx")],
  ["chatScreen", read("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx")],
  ["home", read("apps/mobile/app/meal-buddies.tsx")],
  ["i18n", read("lib/i18n/zh-TW.ts")],
  ["authoredDelta", [
    ...SR2KA_NEW_PRODUCTION_PATHS.map(read),
    ...SR2KA_PRODUCTION_PATHS.filter((f) => !SR2KA_NEW_PRODUCTION_PATHS.includes(f)).map(addedLines)
  ].join("\n")]
]);

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

const baseline = auditSr2kaAuthoredSources(pristine);
check("pristine SR-2K-A source satisfies every closure invariant", baseline.length === 0);
if (baseline.length) for (const violation of baseline) console.log(`     violated: ${violation}`);

// Each mutation names the invariant it attacks; the audit must report at least one violation.
const mutations = [
  // --- reference boundary -----------------------------------------------------------------------
  ["collapsing two reference families is killed", "refBoundary",
    (s) => s.replace('candidate: "scr1."', 'candidate: "mbc1."')],
  ["widening the reference length bound is killed", "refBoundary",
    (s) => s.replace("MEAL_BUDDY_REF_MAX_LENGTH = 512", "MEAL_BUDDY_REF_MAX_LENGTH = 65536")],
  ["accepting a bare prefix as identity is killed", "refBoundary",
    (s) => s.replace("value.length <= prefix.length ||", "false ||")],
  ["accepting an ambiguous reference family is killed", "refBoundary",
    (s) => s.replace("matched.length === 1 && matched[0] === family", "matched.length >= 1")],
  ["letting the route reader guess a family is killed", "refBoundary",
    (s) => s.replace('isMealBuddyRefOfFamily(raw, family) ? (raw as string) : null', '(raw as string) ?? null')],
  ["decoding an opaque reference is killed", "refBoundary",
    (s) => `${s}\nexport const peek = (ref: string) => JSON.parse(atob(ref));`],
  ["performing io inside the boundary is killed", "refBoundary",
    (s) => `${s}\nexport const resolveRef = (ref: string) => fetch(ref);`],

  // --- dynamic routes fail closed ----------------------------------------------------------------
  ["reintroducing an unbounded candidate prefix test is killed", "profileRoute",
    (s) => s.replace('readMealBuddyRouteRef(params.candidateRef, "candidate")',
      'typeof params.candidateRef === "string" && params.candidateRef.startsWith("scr1.") ? params.candidateRef : null')],
  ["dropping the frozen chat prefix pin is killed", "chatRoute",
    (s) => s.split("MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX").join("MEAL_BUDDY_REF_PREFIXES.relationship")],
  ["bypassing the boundary on the chat route is killed", "chatRoute",
    (s) => s.replace('readMealBuddyRouteRef(params.relationshipRef, "relationship")', "(params.relationshipRef as string)")],

  // --- no dead end -------------------------------------------------------------------------------
  ["stranding the user on the candidate profile is killed", "profileRoute",
    (s) => s.replace("if (router.canGoBack()) {", "if (true) {")],
  ["stranding the user in chat is killed", "chatRoute",
    (s) => s.split('router.replace({ pathname: "/meal-buddies", params: { section: "friends" } });').join("return;")],
  ["an unlabelled return from a fail-closed chat screen is killed", "chatScreen",
    (s) => s.replace("copy.backToBuddies", "copy.back")],

  // --- relationship area closure ------------------------------------------------------------------
  ["collapsing the established-buddy band back into history is killed", "inbox",
    (s) => s.replace('key: "accepted" as const', 'key: "incoming_pending" as const')],
  ["losing a band's honest empty line is killed", "inbox",
    (s) => s.replace("emptyLabel: copy.emptyAccepted", "emptyLabel: copy.emptyInbox")],
  ["dropping the standing-buddy framing is killed", "inbox",
    (s) => s.replace("subtitle: copy.acceptedGroupSubtitle", "subtitle: null")],
  ["reordering or capping the canonical server list is killed", "inbox",
    (s) => s.replace("relationships.filter((relationship) => relationship.state === state)",
      "relationships.filter((relationship) => relationship.state === state).slice(0, 3)")],
  ["rendering bands before canonical truth is known is killed", "inbox",
    (s) => s.replace('state.phase === "loading" ? (', 'state.phase === "settling" ? (')],
  ["rendering a raw canonical state is killed", "inbox",
    (s) => `${s}\nconst Leak = () => <Text style={styles.muted}>{relationship.state}</Text>;`],
  ["using a display name as lifecycle identity is killed", "inbox",
    (s) => s.replace("controller.accept(relationship.relationshipRef)", "controller.accept(relationship.counterpart.displayName)")],
  ["removing the canonical re-read control is killed", "inbox",
    (s) => s.replace("label={copy.reload}", "label={copy.inboxTitle}")],
  ["offering chat for a pending relationship is killed", "inbox",
    (s) => s.replace('relationship.state === "accepted" && onOpenChat', 'relationship.state === "incoming_pending" && onOpenChat')],
  ["opening a chat while rendering the relationship area is killed", "inbox",
    (s) => `${s}\nuseMealBuddyChat(actorKey, generation, ref);`],
  ["reaching demo Meal Buddy authority from the real area is killed", "inbox",
    (s) => `${s}\nconst legacy = getMealBuddyChats();`],

  // --- interaction and accessibility ------------------------------------------------------------------
  ["dropping the assistive label from a relationship control is killed", "panel",
    (s) => s.replace("accessibilityLabel={label}", "accessibilityLabel={undefined}")],
  ["hiding the disabled state from assistive technology is killed", "inbox",
    (s) => s.replace("accessibilityState={{ disabled }}", "accessibilityState={{}}")],
  ["removing double-tap protection from a lifecycle action is killed", "panel",
    (s) => s.split("disabled={state.pendingAction !== null}").join("disabled={false}")],

  // --- cross-screen reconciliation -----------------------------------------------------------------
  ["removing cross-screen reconciliation is killed", "home",
    (s) => s.split("useFocusEffect(").join("useNeverEffect(")],
  ["making the reconcile dependency unstable is killed", "home",
    (s) => s.replace("[isRealCandidateMode, reconcileRealRelationships]", "[isRealCandidateMode, realRelationships]")],
  ["adding a second transport path to the relationship hook is killed", "hook",
    (s) => `${s}\nvoid repository.list();`],
  ["persisting buddy truth on the device is killed", "hook",
    (s) => `${s}\nAsyncStorage.setItem("buddies", "[]");`],

  // --- product copy ----------------------------------------------------------------------------------
  ["losing the closure vocabulary is killed", "i18n",
    (s) => s.replace("emptyAccepted:", "emptyAcceptedRemoved:")],
  ["exposing a raw server enum as user copy is killed", "i18n",
    (s) => s.replace('reload: "重新載入最新狀態",', 'reload: "incoming_pending",')],

  // --- hard absence guards ------------------------------------------------------------------------------
  ["adding an unread counter is killed", "authoredDelta", (s) => `${s}\nconst unreadCount = 0;`],
  ["adding a typing indicator is killed", "authoredDelta", (s) => `${s}\nconst typingBroadcast = true;`],
  ["adding a realtime subscription is killed", "authoredDelta", (s) => `${s}\nclient.channel("buddies").subscribe();`],
  ["adding interval polling is killed", "authoredDelta", (s) => `${s}\nsetInterval(() => reload(), 5000);`],
  ["adding read receipts is killed", "authoredDelta", (s) => `${s}\nconst seenAt = new Date();`],
  ["adding presence is killed", "authoredDelta", (s) => `${s}\nconst onlineStatus = true;`],
  ["adding notifications is killed", "authoredDelta", (s) => `${s}\nimport * as Notifications from "expo-notifications";`],
  ["adding media messages is killed", "authoredDelta", (s) => `${s}\ntype Attachment = { url: string };`],
  ["adding message edit authority is killed", "authoredDelta", (s) => `${s}\nasync function editMessage() { return false; }`],
  ["adding reactions is killed", "authoredDelta", (s) => `${s}\ntype Reaction = { emoji: string };`],
  ["adding group chat is killed", "authoredDelta", (s) => `${s}\ntype Group = { groupChat: true };`],
  ["adding unfriend authority is killed", "authoredDelta", (s) => `${s}\nasync function unfriend() { return false; }`],
  ["adding geo or nearby authority is killed", "authoredDelta", (s) => `${s}\nconst latitude = 25.03;`],
  ["adding a deployment operator command is killed", "authoredDelta", (s) => `${s}\n// supabase functions deploy meal-buddy-relationship`]
];

for (const [name, key, mutate] of mutations) {
  const source = pristine.get(key);
  const mutatedSource = mutate(source);
  const mutated = new Map(pristine);
  mutated.set(key, mutatedSource);
  const violations = auditSr2kaAuthoredSources(mutated);
  // A mutation that changed nothing would silently "pass" forever, so the edit itself is verified.
  check(name, mutatedSource !== source && violations.length > 0);
}

console.log(JSON.stringify({
  suite: "meal-buddy-closure-sr2k-a-mutations",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
