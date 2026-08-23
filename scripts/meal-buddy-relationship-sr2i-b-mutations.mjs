#!/usr/bin/env node
// In-memory negative controls for the dedicated SR-2I-B source contract. Repository bytes are not
// changed and no network/database/credential authority is used.
import fs from "node:fs";
import path from "node:path";
import { auditSr2ibSources, SR2IB_SOURCE_PATHS } from "./meal-buddy-relationship-sr2i-b-contract.mjs";

const root = process.cwd();
const pristine = new Map(SR2IB_SOURCE_PATHS.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const checks = []; const failures = [];
function check(name, condition) { checks.push(name); console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures.push(name); }
function mutation(name, file, from, to) {
  const sources = new Map(pristine);
  const value = sources.get(file);
  if (!value?.includes(from)) return check(name, false);
  sources.set(file, value.replace(from, to));
  check(name, auditSr2ibSources(sources).length > 0);
}

check("01 pristine source contract passes", auditSr2ibSources(pristine).length === 0);
mutation("02 endpoint drift is killed", "apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts", '"meal-buddy-relationship"', '"relationship-v2"');
mutation("03 mbc1 candidate identity substitution is killed", "apps/mobile/features/meal-buddy-relationships/repository.ts", '? "scr1." : "mbr1."', '? "mbc1." : "mbr1."');
mutation("04 open response acceptance is killed", "apps/mobile/features/meal-buddy-relationships/repository.ts", "exactKeys(raw, [\"counterpart\", \"relationshipRef\", \"state\"])", "true");
mutation("05 duplicate response refs are killed", "apps/mobile/features/meal-buddy-relationships/repository.ts", "|| refs.has(raw.relationshipRef)", "");
mutation("06 actor-generation gate removal is killed", "apps/mobile/features/meal-buddy-relationships/controller.ts", "&& request.actorGeneration === this.actorGeneration", "");
mutation("07 duplicate mutation gate removal is killed", "apps/mobile/features/meal-buddy-relationships/controller.ts", "|| this.state.pendingAction !== null", "");
mutation("08 uncertain read reconciliation removal is killed", "apps/mobile/features/meal-buddy-relationships/controller.ts", "await this.repository.read", "await this.repository.send");
mutation("09 runtime clear removal is killed", "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts", "clearMealBuddyRelationshipRuntimeDependencies();", "");
mutation("10 canonical write capability bypass is killed", "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts", "if (capabilityFlags.supabaseWritesEnabled) {", "if (true) {");
mutation("11 real-mode inbox removal is killed", "apps/mobile/app/meal-buddies.tsx", "<MealBuddyRelationshipInbox controller={realRelationships} />", "<MyFriendsSection />");
mutation("12 chat affordance insertion is killed", "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx", "<Text style={styles.title}", "<Text>聊天</Text><Text style={styles.title}");
mutation("13 raw target identity identifier is killed", "apps/mobile/features/meal-buddy-relationships/types.ts", "export type MealBuddyRelationshipItem", "const targetUserId = true;\nexport type MealBuddyRelationshipItem");
mutation("14 local relationship persistence is killed", "apps/mobile/features/meal-buddy-relationships/controller.ts", "export class MealBuddyRelationshipProfileController", "const AsyncStorage = true;\nexport class MealBuddyRelationshipProfileController");
mutation("15 missing counterpart contract is killed", "apps/mobile/features/meal-buddy-relationships/repository.ts", "[\"counterpart\", \"relationshipRef\", \"state\"]", "[\"relationshipRef\", \"state\"]");
mutation("16 private publicBio expansion is killed", "supabase/functions/_shared/meal-buddy-relationship-api/types.ts", "mascotAvatarKey: string;", "mascotAvatarKey: string;\n  publicBio: string;");
mutation("17 private projection column expansion is killed", "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts", "select exposure_ordinal, display_name, mascot_avatar_key", "select exposure_ordinal, display_name, mascot_avatar_key, public_bio");
mutation("18 anonymous inbox fallback is killed", "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx", "{relationship.counterpart.displayName}", "{copy.anonymousRelationship}");
mutation("19 display name lifecycle targeting is killed", "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx", "controller.accept(relationship.relationshipRef)", "controller.accept(relationship.counterpart.displayName)");
mutation("20 relationship exposure capping is killed", "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts", "offset < counterpartIds.length", "offset < Math.min(counterpartIds.length, 10)");

console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-b-mutations", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, repositoryBytesModified: false, networkUsed: false, databaseUsed: false, credentialsUsed: false }, null, 2));
if (failures.length) process.exitCode = 1;
