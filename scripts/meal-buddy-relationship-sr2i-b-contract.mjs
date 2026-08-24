import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

export const SR2IB_SOURCE_PATHS = Object.freeze([
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx",
  "apps/mobile/features/meal-buddy-relationships/controller.ts",
  "apps/mobile/features/meal-buddy-relationships/index.ts",
  "apps/mobile/features/meal-buddy-relationships/repository.ts",
  "apps/mobile/features/meal-buddy-relationships/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-relationships/types.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationshipProfile.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationships.ts",
  "lib/i18n/zh-TW.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts"
]);

export function auditSr2ibSources(sources) {
  const violations = [];
  const repository = sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts") ?? "";
  const controller = sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts") ?? "";
  const contracts = sources.get("apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts") ?? "";
  const binding = sources.get("apps/mobile/features/meal-buddy-relationships/runtimeBinding.ts") ?? "";
  const composition = sources.get("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts") ?? "";
  const profileRoute = sources.get("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx") ?? "";
  const home = sources.get("apps/mobile/app/meal-buddies.tsx") ?? "";
  const profileUi = sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx") ?? "";
  const inboxUi = sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx") ?? "";
  const serverRepository = sources.get("supabase/functions/_shared/meal-buddy-relationship-api/repository.ts") ?? "";
  const serverService = sources.get("supabase/functions/_shared/meal-buddy-relationship-api/service.ts") ?? "";
  const serverTypes = sources.get("supabase/functions/_shared/meal-buddy-relationship-api/types.ts") ?? "";
  const featureSources = [...sources.entries()].filter(([file]) => file.includes("meal-buddy-relationships/")).map(([, source]) => source).join("\n");
  const mobileSources = new Map([...sources.entries()].filter(([file]) => file.startsWith("apps/mobile/")));
  const identifiers = collectIdentifiers(mobileSources);

  requireInvariant(violations, contracts.includes('"meal-buddy-relationship"'), "frozen relationship endpoint name is missing");
  requireInvariant(violations, contracts.includes('operation: "send" | "read"; candidateRef: string')
    && contracts.includes('operation: "list"')
    // SR-2K-B adds `unfriend` to the SAME relationship-ref arm. Either the frozen union or that
    // exact successor union is acceptable; anything else still fails.
    && (contracts.includes('operation: "accept" | "decline" | "cancel"; relationshipRef: string')
      || contracts.includes('operation: "accept" | "decline" | "cancel" | "unfriend"; relationshipRef: string')),
    "exact frozen request union is missing");
  requireInvariant(violations, repository.includes('? "scr1." : "mbr1."') && repository.includes("ref.startsWith(prefix)"), "opaque ref prefix gates are missing");
  requireInvariant(violations, repository.includes("exactKeys(value")
    && repository.includes('exactKeys(raw, ["counterpart", "relationshipRef", "state"])')
    && repository.includes("exactKeys(raw.counterpart"), "closed top-level/item response validation is missing");
  requireInvariant(violations, repository.includes('exactKeys(raw.counterpart, ["displayName", "mascotAvatarKey"])')
    && !/publicBio|willingToChat|email|phone|userId/.test(contracts), "counterpart response is not the exact minimal public identity contract");
  requireInvariant(violations, repository.includes("refs.has(raw.relationshipRef)"), "duplicate relationship refs are not rejected");
  requireInvariant(violations, repository.includes("getCurrentSession()") && repository.indexOf("getCurrentSession()") < repository.indexOf("functions.invoke"), "session authority is not checked before transport");
  requireInvariant(violations, !/\bfetch\s*\(/.test(featureSources), "raw fetch was introduced");
  requireInvariant(violations, !identifiers.has("targetUserId") && !identifiers.has("candidateUserId") && !identifiers.has("pairKey") && !identifiers.has("relationId"), "raw identity or pair authority identifier was introduced");
  requireInvariant(violations, !/(atob|decodeURIComponent|JSON\.parse)\s*\([^)]*(candidateRef|relationshipRef)/.test(featureSources), "opaque ref decode was introduced");

  requireInvariant(violations, serverRepository.includes("social_internal.project_exposed_social_profiles")
    && serverRepository.includes("select exposure_ordinal, display_name, mascot_avatar_key")
    && !/select[^`]*(?:public_bio|willing_to_chat|email|phone|user_id)/i.test(serverRepository.split("const PROJECT_COUNTERPARTS")[1]?.split("`;")[0] ?? ""), "trusted repository does not reuse only the minimal SR-2C projection fields");
  requireInvariant(violations, serverRepository.includes("PROFILE_BATCH_SIZE = 10")
    && serverRepository.includes("offset < counterpartIds.length")
    && serverRepository.includes("offset += PROFILE_BATCH_SIZE")
    && serverRepository.includes("counterpartIds.slice(offset, offset + PROFILE_BATCH_SIZE)"), "relationship identities are capped by exposure instead of safely batched");
  requireInvariant(violations, serverRepository.includes("[actorUserId, batch]")
    && serverService.includes("counterpart: row.counterpart"), "actor-scoped counterpart composition is not carried through the public service");
  requireInvariant(violations, /MealBuddyRelationshipCounterpart = Readonly<\{\s*displayName: string;\s*mascotAvatarKey: string;\s*\}>/.test(serverTypes)
    && !/publicBio|willingToChat|email|phone|pairKey/.test(serverTypes), "server counterpart DTO is not closed to the two frozen public fields");

  requireInvariant(violations, controller.includes("actorGeneration") && controller.includes("requestSequence")
    && (controller.match(/isCurrent\(request\)/g) ?? []).length >= 6
    && (controller.match(/request\.actorGeneration === this\.actorGeneration/g) ?? []).length === 2, "actor/session-generation stale-result gates are incomplete");
  requireInvariant(violations, (controller.match(/pendingAction !== null/g) ?? []).length >= 2, "duplicate mutation gates are incomplete");
  requireInvariant(violations, (controller.match(/await this\.repository\.read/g) ?? []).length === 2
    && (controller.match(/await this\.repository\.list/g) ?? []).length === 2, "uncertain mutation reconciliation is missing");
  requireInvariant(violations, controller.includes("result.value.relationships") && !/state:\s*action\s*===/.test(controller), "final relationship state is not sourced from canonical responses");
  requireInvariant(violations, !/(AsyncStorage|storage\.set|setItem)/.test(controller), "relationship truth is locally persisted");

  requireInvariant(violations, binding.includes("dependencies = null") && composition.includes("clearMealBuddyRelationshipRuntimeDependencies()"), "relationship runtime dependency clearing is missing");
  requireInvariant(violations, composition.includes("bindMealBuddyRelationshipRuntimeDependencies({")
    && composition.includes("authPort,") && composition.includes("client: client as unknown as SupabaseMealBuddyRelationshipClientLike"), "canonical singleton auth/client binding is missing");
  const writeBranch = composition.split("if (capabilityFlags.supabaseWritesEnabled) {")[1]?.split("return {")[0] ?? "";
  requireInvariant(violations, writeBranch.includes("bindMealBuddyRelationshipRuntimeDependencies"), "relationship mutations are not gated by canonical write capability");

  requireInvariant(violations, profileRoute.includes("MealBuddyRelationshipPanel") && profileRoute.includes("candidateRef"), "candidate profile relationship action placement is missing");
  requireInvariant(violations, home.includes("MealBuddyRelationshipInbox") && /isRealCandidateMode\s*\?\s*\(\s*<MealBuddyRelationshipInbox/.test(home), "real-mode relationship inbox is missing");
  requireInvariant(violations, home.includes('!isRealCandidateMode ? <Chip label="聊天"'), "pre-existing chat chip is not excluded from real relationship mode");
  // SR-2J-B adds exactly one sanctioned chat entry (navigation callback plus label) to the accepted
  // row and panel. Everything else about chat remains forbidden in these surfaces, and neither may
  // perform a chat transport call: entering the Chat route is what opens a conversation.
  const relationshipUiWithoutChatEntry = (profileUi + inboxUi)
    .split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n")
    .split("onOpenChat").join("")
    .split("copy.openChat").join("");
  requireInvariant(violations, !/(chat|message|conversation|unread|realtime|聊天|訊息)/i.test(relationshipUiWithoutChatEntry)
    && !/useMealBuddyChat|repository\.|invoke\(/.test(profileUi + inboxUi),
    "chat/message authority or affordance was introduced in relationship UI");
  requireInvariant(violations, !/<Text[^>]*>\s*(?:outgoing_pending|incoming_pending|accepted|\{relationship\.relationshipRef\})/i.test(profileUi + inboxUi), "raw state/ref is rendered");
  requireInvariant(violations, inboxUi.includes("relationship.counterpart.displayName")
    && inboxUi.includes("relationship.counterpart.mascotAvatarKey")
    && !inboxUi.includes("anonymousRelationship"), "relationship inbox is still anonymous or lacks the public mascot identity");
  requireInvariant(violations, profileUi.includes('state.relationship.state === "none"')
    && profileUi.includes('state.relationship.state === "outgoing_pending"')
    && profileUi.includes('state.relationship.state === "incoming_pending"'), "profile state/action mapping is incomplete");
  requireInvariant(violations, inboxUi.includes("controller.accept(relationship.relationshipRef)")
    && inboxUi.includes("controller.decline(relationship.relationshipRef)")
    && inboxUi.includes("controller.cancel(relationship.relationshipRef)")
    && inboxUi.includes("key={relationship.relationshipRef}")
    && !/controller\.(?:accept|decline|cancel)\([^)]*displayName/.test(inboxUi), "inbox actor-relative actions are incomplete or use display identity as authority");
  return Object.freeze(violations);
}

function collectIdentifiers(sources) {
  const values = new Set();
  for (const [file, source] of sources) {
    if (!/\.(?:ts|tsx)$/.test(file)) continue;
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isIdentifier(node)) values.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return values;
}

function requireInvariant(violations, condition, message) {
  if (!condition) violations.push(message);
}
