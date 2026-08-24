#!/usr/bin/env node
// SR-2I-B lifecycle-aware local Mobile activation guard. Read-only and offline.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { auditSr2ibSources, SR2IB_SOURCE_PATHS } from "./meal-buddy-relationship-sr2i-b-contract.mjs";
import {
  classifySr2ibLifecycle,
  createSr2ibManifest,
  SR2IB_BASELINE,
  SR2IB_BASELINE_SUBJECT,
  SR2IB_MIGRATION,
  SR2IB_MIGRATION_SHA256,
  SR2IB_SUCCESSOR_PATHS
} from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";

const root = process.cwd(); const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
const statusPaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
const head = git(["rev-parse", "HEAD"]).trim();
const originHead = git(["rev-parse", "origin/main"]).trim();
const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
const delta = head === SR2IB_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"]));
const state = Object.freeze({
  head, originHead, ahead, behind,
  parent: head === SR2IB_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
  worktreePaths: statusPaths(), stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
  deltaPaths: delta.map((entry) => entry.split("\t")[1]), deleted: delta.some((entry) => entry.startsWith("D\t"))
});
const lifecycle = classifySr2ibLifecycle(state);
const sources = new Map(SR2IB_SOURCE_PATHS.map((file) => [file, read(file)]));
const sourceViolations = auditSr2ibSources(sources);
const productionSources = SR2IB_SOURCE_PATHS.map((file) => sources.get(file)).join("\n");
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(git(["show", `${SR2IB_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
const commands = [
  "test:meal-buddy-relationship-sr2i-b",
  "test:meal-buddy-relationship-sr2i-b-smoke",
  "test:meal-buddy-relationship-sr2i-b-mutations"
];
const successorCommands = Object.freeze({
  "test:meal-buddy-chat-sr2j-a": "node scripts/meal-buddy-chat-sr2j-a-guard.mjs",
  "test:meal-buddy-chat-sr2j-a-smoke": "node scripts/meal-buddy-chat-sr2j-a-smoke.mjs",
  "test:meal-buddy-chat-sr2j-a-mutations": "node scripts/meal-buddy-chat-sr2j-a-mutations.mjs",
  "test:meal-buddy-chat-sr2j-a-concurrency": "node scripts/meal-buddy-chat-sr2j-a-concurrency.mjs"
});
for (const name of [...commands, ...Object.keys(successorCommands)]) delete packageWithout.scripts[name];
for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithout.scripts[key];
// SR-2K-A adds three validation-only command keys. Stripping them keeps this guard measuring
// what it has always measured: that no OTHER package byte moved.
for (const key of ["test:meal-buddy-closure-sr2k-a", "test:meal-buddy-closure-sr2k-a-smoke", "test:meal-buddy-closure-sr2k-a-mutations"]) delete packageWithout.scripts[key];
// SR-2K-B adds five validation-only command keys. Stripping them keeps this guard measuring
// what it has always measured: that no OTHER package byte moved.
for (const key of ["test:social-final-sr2k-b", "test:social-final-sr2k-b-smoke", "test:social-final-sr2k-b-mutations", "test:social-final-sr2k-b-concurrency", "test:social-final-sr2k-b-postgres"]) delete packageWithout.scripts[key];
const migrationBytes = fs.readFileSync(path.join(root, SR2IB_MIGRATION));

check("01 lifecycle is exact I-B authority or exact SR-2J-A successor", lifecycle.valid, { phase: lifecycle.phase, head, originHead, ahead, behind });
check("02 lifecycle inventory is exact, explicit and wildcard-free", exact(lifecycle.manifest, SR2IB_SUCCESSOR_PATHS));
check("03 pushed SR-2I-A baseline and subject are pinned", git(["cat-file", "-t", SR2IB_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2IB_BASELINE]).trim() === SR2IB_BASELINE_SUBJECT);
check("04 branch is main and SR-2I-A remains ancestor authority", git(["branch", "--show-current"]).trim() === "main" && spawnSync("git", ["merge-base", "--is-ancestor", SR2IB_BASELINE, "HEAD"], { cwd: root }).status === 0);
check("05 staged bytes and deleted paths are prohibited", state.stagedPaths.length === 0 && !state.deleted);
check("06 every exact candidate path exists", SR2IB_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("07 package preserves exact I-B commands and admits only exact J-A successor commands", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage) && Object.entries(successorCommands).every(([name, command]) => packageJson.scripts[name] === command));
check("08 dependencies workspaces and lockfiles are unchanged", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && JSON.stringify(packageJson.workspaces) === JSON.stringify(baselinePackage.workspaces) && !SR2IB_SUCCESSOR_PATHS.some((file) => /lock(?:file)?/i.test(file)));
check("09 dedicated commands resolve to exact validation scripts", packageJson.scripts[commands[0]] === "node scripts/meal-buddy-relationship-sr2i-b-guard.mjs" && packageJson.scripts[commands[1]] === "node scripts/meal-buddy-relationship-sr2i-b-smoke.mjs" && packageJson.scripts[commands[2]] === "node scripts/meal-buddy-relationship-sr2i-b-mutations.mjs");

check("10 SR-2I-B production source contract has no violation", sourceViolations.length === 0, sourceViolations);
check("11 Mobile transport names only the frozen relationship endpoint", sources.get("apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts").includes('"meal-buddy-relationship"'));
check("12 target operations accept only scr1 candidate refs", sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes('? "scr1." : "mbr1."'));
check("13 lifecycle actions accept only mbr1 relationship refs", sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes("ref.startsWith(prefix)"));
check("14 list request carries no target scope", sources.get("apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts").includes('Readonly<{ operation: "list" }>'));
check("15 Mobile request types cannot express raw user pair or relation IDs", !/targetUserId|candidateUserId|counterpartUserId|pairKey|relationId/.test(sources.get("apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts") + sources.get("apps/mobile/features/meal-buddy-relationships/types.ts")));
check("16 response validation is closed at response and item levels", (sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").match(/exactKeys\(/g) ?? []).length >= 3);
check("17 malformed wrong-prefix and duplicate refs fail before trust", sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes("refs.has(raw.relationshipRef)"));
check("18 raw invoke/database/crypto errors never reach Mobile UI", !/error\.message|response\.text|JSON\.stringify\(error\)|error\.stack|database_detail|crypto_detail/i.test(sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts") + sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx") + sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx")));

check("19 profile exposes one sanctioned relationship panel after public profile", (() => {
  const profile = sources.get("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx");
  // Exactly one panel, still fed by the relationship controller. SR-2J-B additionally hands it the
  // chat-entry navigation callback, which carries no controller or transport of its own.
  return (profile.match(/<MealBuddyRelationshipPanel/g) || []).length === 1
    && profile.includes("controller={relationshipController}");
})());
check("20 compact candidate card authority is byte-unchanged", git(["diff", "--name-only", SR2IB_BASELINE, "--", "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx", "apps/mobile/features/meal-buddy-candidates/MealBuddyRealCandidateSection.tsx"]).trim() === "");
check("21 real inbox is reachable through the existing friends section", /activeSection === "friends"[\s\S]{0,160}isRealCandidateMode \? \([\s\S]{0,120}<MealBuddyRelationshipInbox/.test(sources.get("apps/mobile/app/meal-buddies.tsx")));
check("22 incoming outgoing and accepted copy is zh-TW authority", ["incomingInbox", "outgoingInbox", "acceptedInbox"].every((key) => read("lib/i18n/zh-TW.ts").includes(`${key}:`)));
check("23 none outgoing incoming accepted map to sanctioned actions only", ["controller.send()", "controller.cancel()", "controller.accept()", "controller.decline()"].every((marker) => sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx").includes(marker)));
check("24 accepted state has no relationship action branch", !/state\.relationship\.state === "accepted"[\s\S]{0,200}controller\.(?:send|accept|decline|cancel)/.test(sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx")));
check("25 raw internal state and opaque refs are not rendered", !/<Text[^>]*>\s*(?:outgoing_pending|incoming_pending|accepted|\{relationship\.relationshipRef\})/i.test(productionSources));
check("26 relationship identity remains mbr1 even when duplicate display names exist", sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx").includes("key={relationship.relationshipRef}") && !/controller\.(?:accept|decline|cancel)\([^)]*displayName|key=\{relationship\.counterpart\.displayName\}/.test(sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx")));

check("27 server responses remain the only final relationship state source", sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").includes("result.value.relationships") && !/state:\s*action\s*===/.test(sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts")));
check("28 uncertain mutations reconcile through frozen read or list", (sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").match(/await this\.repository\.(?:read|list)/g) ?? []).length === 4);
check("29 duplicate taps are gated while a mutation is unresolved", (sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").match(/pendingAction !== null/g) ?? []).length >= 2);
check("30 actor key generation request sequence guard every async completion", (sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").match(/isCurrent\(request\)/g) ?? []).length >= 6 && (sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").match(/request\.actorGeneration === this\.actorGeneration/g) ?? []).length === 2);
check("31 sign-out and context change clear stale state", sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").includes("PROFILE_SIGNED_OUT") && sources.get("apps/mobile/features/meal-buddy-relationships/controller.ts").includes("INBOX_SIGNED_OUT"));
check("32 no relationship truth is stored in AsyncStorage or demo stores", !/(AsyncStorage|storage\.set|setItem|createMealBuddyInvite|acceptMealBuddyInvite)/.test([...sources.entries()].filter(([file]) => file.includes("meal-buddy-relationships/")).map(([, source]) => source).join("\n")));

check("33 runtime reuses canonical auth port and singleton Supabase client", sources.get("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts").includes("bindMealBuddyRelationshipRuntimeDependencies({") && sources.get("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts").includes("client: client as unknown as SupabaseMealBuddyRelationshipClientLike"));
check("34 disabled/test composition cannot retain earlier live dependencies", sources.get("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts").includes("clearMealBuddyRelationshipRuntimeDependencies();"));
check("35 relationship mutation binding remains behind canonical writes capability", sources.get("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts").split("if (capabilityFlags.supabaseWritesEnabled) {")[1]?.includes("bindMealBuddyRelationshipRuntimeDependencies"));
check("36 willingToChat tier interests and contexts do not gate relationship action", !/willingToChat|isPremium|entitlement|publicInterestTags|foodInterestTags|food_context_tag_key/.test([...sources.entries()].filter(([file]) => file.includes("meal-buddy-relationships/")).map(([, source]) => source).join("\n")));

const relationshipUi = sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx") + sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx");
// SR-2J-B activates exactly one sanctioned chat ENTRY on the accepted row/panel: a navigation
// callback plus its label. Message, conversation, unread and realtime authority remain forbidden
// here, and the entry must still perform no chat transport call from these surfaces.
const relationshipUiWithoutChatEntry = relationshipUi
  .split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n")
  .split("onOpenChat").join("")
  .split("copy.openChat").join("");
check("37 accepted relationship does not activate chat message conversation unread or realtime",
  !/(chat|message|conversation|unread|realtime|聊天|訊息)/i.test(relationshipUiWithoutChatEntry)
  && !/useMealBuddyChat|repository\.|invoke\(/.test(relationshipUi));
check("38 ranking exposure context recommendation and interest authority bytes are unchanged", ["supabase/functions/_shared/social-ranking", "supabase/functions/_shared/social-exposure", "supabase/functions/_shared/meal-buddy-context", "apps/mobile/features/social-interest-settings"].every((file) => git(["diff", "--name-only", SR2IB_BASELINE, "--", file]).trim() === ""));
const allowedBackendDelta = [
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts",
  // SR-2K-B teaches the request parser one more lifecycle action. The frozen SQL, the ref crypto and
  // the Edge handler directory are still asserted untouched immediately below.
  "supabase/functions/_shared/meal-buddy-relationship-api/request.ts"
];
const actualBackendDelta = lines(git(["diff", "--name-only", SR2IB_BASELINE, "--", "supabase/functions/_shared/meal-buddy-relationship-api"]));
check("39 SR-2I-A lifecycle SQL RPC ref crypto and Edge handler remain frozen while successor authority stays separate", exact(actualBackendDelta, allowedBackendDelta) && git(["diff", "--name-only", SR2IB_BASELINE, "--", "supabase/functions/meal-buddy-relationship", "supabase/functions/_shared/meal-buddy-relationship-ref", SR2IB_MIGRATION]).trim() === "");
check("40 SR-2I-A migration SHA-256 remains exact", crypto.createHash("sha256").update(migrationBytes).digest("hex") === SR2IB_MIGRATION_SHA256);
check("41 no migration secret deploy or remote operator delta exists", exact(lifecycle.manifest.filter((file) => file.startsWith("supabase/")), allowedBackendDelta) && !lifecycle.manifest.some((file) => file.startsWith("supabase/migrations/") || file.startsWith("supabase/functions/meal-buddy-relationship/")) && !/MEAL_BUDDY_RELATIONSHIP_REF_KEY_V1|supabase\s+(db push|functions deploy)|--project-ref|SUPABASE_SERVICE_ROLE/.test(productionSources));
check("42 every candidate source is UTF-8 text without NUL", SR2IB_SUCCESSOR_PATHS.every((file) => { const bytes = fs.readFileSync(path.join(root, file)); return !bytes.includes(0) && !read(file).includes("\uFFFD"); }));
const manifest = createSr2ibManifest((file) => fs.readFileSync(path.join(root, file)));
check("43 canonical raw-byte manifest covers every exact sorted path", manifest.entries.length === SR2IB_SUCCESSOR_PATHS.length && manifest.entries.every((entry, index) => entry.path === SR2IB_SUCCESSOR_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));
check("44 visible relationships require an exact current counterpart name and mascot", sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes('exactKeys(raw.counterpart, ["displayName", "mascotAvatarKey"])') && sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes("raw.counterpart.displayName.length === 0") && sources.get("apps/mobile/features/meal-buddy-relationships/repository.ts").includes("raw.counterpart.mascotAvatarKey.length === 0"));
check("45 server composes current counterpart identity through the frozen SR-2C projection", sources.get("supabase/functions/_shared/meal-buddy-relationship-api/repository.ts").includes("social_internal.project_exposed_social_profiles") && sources.get("supabase/functions/_shared/meal-buddy-relationship-api/service.ts").includes("counterpart: row.counterpart"));
check("46 relationship list is not capped by candidate exposure", sources.get("supabase/functions/_shared/meal-buddy-relationship-api/repository.ts").includes("offset += PROFILE_BATCH_SIZE") && sources.get("supabase/functions/_shared/meal-buddy-relationship-api/repository.ts").includes("counterpartIds.slice(offset, offset + PROFILE_BATCH_SIZE)") && !/relationships\.slice\(0,\s*(?:3|10)\)/.test(productionSources));
check("47 inbox visibly renders current counterpart name and mascot without an anonymous fallback", sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx").includes("relationship.counterpart.displayName") && sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx").includes("relationship.counterpart.mascotAvatarKey") && !sources.get("apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx").includes("anonymousRelationship"));
check("48 counterpart contract does not broaden SR-2C disclosure", !/publicBio|willingToChat|email|phone|health|nutrition|ranking|entitlement/.test(sources.get("supabase/functions/_shared/meal-buddy-relationship-api/types.ts") + sources.get("apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts")));

console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-b-guard", lifecycle: lifecycle.phase, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, canonicalManifestSha256: manifest.aggregateSha256, migrationSha256: crypto.createHash("sha256").update(migrationBytes).digest("hex"), networkUsed: false, databaseUsed: false, credentialsUsed: false, developmentTouched: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
