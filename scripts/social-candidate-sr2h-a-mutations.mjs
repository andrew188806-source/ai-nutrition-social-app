#!/usr/bin/env node
// SR-2H-A in-memory mutations only. Repository bytes are never written.
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const original = Object.freeze({
  request: read("supabase/functions/_shared/meal-buddy-candidate-profile-api/request.ts"),
  compose: read("supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts"),
  types: read("supabase/functions/_shared/meal-buddy-candidate-profile-api/types.ts"),
  handler: read("supabase/functions/meal-buddy-candidate-profile/handler.ts"),
  config: read("supabase/config.toml"),
  mobile: read("apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateProfileRepository.ts"),
  hook: read("apps/mobile/features/meal-buddy-candidates/useMealBuddyCandidateProfile.ts"),
  screen: read("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx"),
  home: read("apps/mobile/app/meal-buddies.tsx"),
  compact: read("apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx"),
  catalog: read("apps/mobile/features/meal-buddy-candidates/interestCatalog.ts"),
  validator: read("packages/shared/src/domain/meal-buddy-candidate/validate.ts")
});

function violations(source) {
  const failed = []; const require = (name, condition) => { if (!condition) failed.push(name); };
  require("request is exactly candidateRef", source.request.includes("Object.keys(record).length !== 1") && source.request.includes('"candidateRef" in record'));
  require("candidate ref is opened for authenticated actor", source.handler.includes("authentication.value.userId, parsed.value.candidateRef"));
  require("forged/unavailable is opaque", source.handler.includes('buildMealBuddyCandidateProfileError("invalid_request")'));
  require("viewer is authenticated", source.handler.includes("authenticateCaller"));
  require("public profile projection is reused", source.compose.includes("readExposedSocialProfileFacts"));
  require("current interest projection is reused", source.compose.includes("readExposedCandidateInterests"));
  require("no card snapshot supplies interests", !/meal_buddy_cards|cardByOwner|interestSnapshot/.test(source.compose));
  require("full general interests are not sliced", !/publicInterestTags[\s\S]{0,100}slice\(0,\s*3\)/.test(source.compose));
  require("full food interests are not sliced", !/foodInterestTags[\s\S]{0,100}slice\(0,\s*3\)/.test(source.compose));
  require("response excludes private identity", !/userId|profileId|email|phone|realAvatar/i.test(source.types));
  require("response excludes ranking/context authority", !/taste|score|ranking|contextState|contextScore|food_context_tag_key|entitlement/i.test(source.types));
  require("endpoint verifies JWT", /\[functions\.meal-buddy-candidate-profile\][\s\S]*verify_jwt = true/.test(source.config));
  require("Mobile validates exact response", source.mobile.includes("validateMealBuddyCandidateProfileApiResponseV1"));
  require("Mobile does not decode person ref", !/atob|base64|candidateRef\.slice/.test(source.mobile + source.hook + source.screen + source.home));
  require("catalog gap cannot expose raw tag key", source.catalog.includes('reason: "missing_catalog_label"') && source.hook.includes("resolveFullInterestLabels") && !source.catalog.includes("resolved.push(tagKey)"));
  require("profile has separate interest namespaces", source.screen.includes('title="興趣"') && source.screen.includes('title="愛吃"'));
  require("profile has safe states", ["ActivityIndicator", 'phase === "failed"', "controller.retry()", "router.back()"].every((marker) => source.screen.includes(marker)));
  require("profile has no demo authority", !/getCommunityProfile|resolveCommunityProfileDisplay|mealBuddyCardMock|mockMatched|demoProfile/i.test(source.screen + source.hook + source.mobile));
  require("card tap uses person ref", source.compact.includes("onPress(candidate.candidateRef)") && !source.compact.includes("onPress(candidate.candidateCardRef)"));
  require("home routes canonical ref", source.home.includes("onOpenRealCandidateProfile={openRealCandidateProfile}"));
  require("validator is closed", source.validator.includes("exactKeys(value.profile, MEAL_BUDDY_CANDIDATE_PROFILE_FIELDS)"));
  return failed;
}

const mutants = [
  ["accept extra lookup key", (s) => ({ ...s, request: s.request.replace("Object.keys(record).length !== 1", "false") })],
  ["open ref without actor binding", (s) => ({ ...s, handler: s.handler.replace("authentication.value.userId, parsed.value.candidateRef", "candidateUserId, parsed.value.candidateRef") })],
  ["return distinct unavailable oracle", (s) => ({ ...s, handler: s.handler.replaceAll('buildMealBuddyCandidateProfileError("invalid_request")', 'buildMealBuddyCandidateProfileError("candidate_not_found")') })],
  ["skip authentication", (s) => ({ ...s, handler: s.handler.replaceAll("authenticateCaller", "trustCaller") })],
  ["bypass public profile projection", (s) => ({ ...s, compose: s.compose.replaceAll("readExposedSocialProfileFacts", "readConsumerProfilesDirectly") })],
  ["bypass current interest projection", (s) => ({ ...s, compose: s.compose.replaceAll("readExposedCandidateInterests", "readCardInterestSnapshot") })],
  ["read interests from cards", (s) => ({ ...s, compose: `${s.compose}\nconst interestSnapshot = meal_buddy_cards;` })],
  ["truncate full general interests", (s) => ({ ...s, compose: s.compose.replace("interests.publicInterestTags.map", "interests.publicInterestTags.slice(0, 3).map") })],
  ["truncate full food interests", (s) => ({ ...s, compose: s.compose.replace("interests.foodInterestTags.map", "interests.foodInterestTags.slice(0, 3).map") })],
  ["expose user id", (s) => ({ ...s, types: s.types.replace("displayName: string;", "displayName: string;\n  userId: string;") })],
  ["expose health details", (s) => ({ ...s, types: s.types.replace("displayName: string;", "displayName: string;\n  healthScore: number;") })],
  ["expose context score", (s) => ({ ...s, types: s.types.replace("displayName: string;", "displayName: string;\n  contextScore: number;") })],
  ["disable endpoint JWT", (s) => ({ ...s, config: s.config.replace(/(\[functions\.meal-buddy-candidate-profile\][\s\S]*?)verify_jwt = true/, "$1verify_jwt = false") })],
  ["trust unvalidated Mobile response", (s) => ({ ...s, mobile: s.mobile.replaceAll("validateMealBuddyCandidateProfileApiResponseV1", "trustCandidateProfileResponse") })],
  ["decode candidate ref on Mobile", (s) => ({ ...s, mobile: `${s.mobile}\nconst id = atob(candidateRef.slice(5));` })],
  ["fallback to raw tag keys", (s) => ({ ...s, catalog: s.catalog.replace('return { ok: false, reason: "missing_catalog_label" };', "resolved.push(tagKey); continue;") })],
  ["merge interest namespaces", (s) => ({ ...s, screen: s.screen.replace('title="愛吃"', 'title="興趣"') })],
  ["remove retry state", (s) => ({ ...s, screen: s.screen.replace("controller.retry()", "undefined") })],
  ["use demo profile authority", (s) => ({ ...s, screen: `${s.screen}\nconst profile = getCommunityProfile(candidateRef);` })],
  ["tap candidate card ref", (s) => ({ ...s, compact: s.compact.replace("onPress(candidate.candidateRef)", "onPress(candidate.candidateCardRef)") })],
  ["drop real navigation", (s) => ({ ...s, home: s.home.replaceAll("onOpenRealCandidateProfile={openRealCandidateProfile}", "") })],
  ["permit extra response fields", (s) => ({ ...s, validator: s.validator.replace("exactKeys(value.profile, MEAL_BUDDY_CANDIDATE_PROFILE_FIELDS)", "true") })]
];

const baselineFailures = violations(original); const survivors = [];
for (const [name, mutate] of mutants) {
  const killedBy = violations(mutate(original)); const killed = killedBy.length > 0;
  console.log(`${killed ? "KILLED" : "SURVIVED"} ${name}${killed ? ` -> ${killedBy.join(", ")}` : ""}`);
  if (!killed) survivors.push(name);
}
console.log(JSON.stringify({ suite: "social-candidate-sr2h-a-mutations", mutants: mutants.length, killed: mutants.length - survivors.length, survivors, baselineFailures, repositoryBytesModified: false, networkUsed: false, databaseUsed: false }, null, 2));
if (baselineFailures.length || survivors.length) process.exitCode = 1;
