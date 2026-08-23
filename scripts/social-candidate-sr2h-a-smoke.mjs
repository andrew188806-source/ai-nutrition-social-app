#!/usr/bin/env node
// SR-2H-A deterministic local smoke. Real projection/aggregation/validator/crypto source executes
// against in-memory transport and catalog stubs. No network, database, credentials or repo writes.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { auditSr2ibSources, SR2IB_SOURCE_PATHS } from "./meal-buddy-relationship-sr2i-b-contract.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
const cache = new Map();
const resolveFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
  .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
  });
  const module = { exports: {} }; cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const fromRoot = (relative) => load(path.join(root, relative));
const request = fromRoot("supabase/functions/_shared/meal-buddy-candidate-profile-api/request.ts");
const cipherModule = fromRoot("supabase/functions/_shared/social-candidate-ref/crypto.ts");
const profileComposer = fromRoot("supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts");
const validator = fromRoot("packages/shared/src/domain/meal-buddy-candidate/validate.ts");
const catalog = fromRoot("apps/mobile/features/meal-buddy-candidates/interestCatalog.ts");
const aggregation = fromRoot("supabase/functions/_shared/social-interest/aggregate.ts");

const actor = "00000000-0000-4000-8000-000000000001";
const candidate = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-21T04:00:00.000Z");
const key = new Uint8Array(32).fill(17);
const sealingCipher = cipherModule.createSocialCandidateRefCipher(key, {
  randomIv: () => new Uint8Array(12).fill(23)
});
const openingCipher = cipherModule.createSocialCandidateRefCipher(key);
const candidateRef = await sealingCipher.seal(actor, candidate, now);

check("01 canonical candidate ref is an opaque scr1 person reference", candidateRef.startsWith("scr1.") && !candidateRef.includes(candidate));
check("02 same authenticated actor opens the canonical identity", (await openingCipher.open(actor, candidateRef, now)).candidateUserId === candidate);
let wrongActorRejected = false;
try { await openingCipher.open("00000000-0000-4000-8000-000000000003", candidateRef, now); } catch { wrongActorRejected = true; }
check("03 another actor cannot replay the reference", wrongActorRejected);
let forgedRejected = false;
try { await openingCipher.open(actor, `${candidateRef.slice(0, -1)}A`, now); } catch { forgedRejected = true; }
check("04 forged identity fails closed", forgedRejected);
let expiredRejected = false;
try { await openingCipher.open(actor, candidateRef, new Date(now.getTime() + 86_400_000)); } catch { expiredRejected = true; }
check("05 stale identity fails closed", expiredRejected);

const validRequest = new Request("https://local.invalid/profile", {
  method: "POST", body: JSON.stringify({ candidateRef })
});
check("06 exact one-key profile request is accepted", (await request.parseMealBuddyCandidateProfileRequest(validRequest)).ok);
check("07 display-name lookup is not expressible", !(await request.parseMealBuddyCandidateProfileRequest(new Request("https://local.invalid/profile", { method: "POST", body: JSON.stringify({ displayName: "Kai" }) }))).ok);
check("08 array-index lookup is not expressible", !(await request.parseMealBuddyCandidateProfileRequest(new Request("https://local.invalid/profile", { method: "POST", body: JSON.stringify({ candidateRef, index: 0 }) }))).ok);
check("09 authority query/header inputs are rejected", request.carriesCandidateProfileAuthorityInput(new Request("https://local.invalid/profile?tier=premium")) && request.carriesCandidateProfileAuthorityInput(new Request("https://local.invalid/profile", { headers: { "x-profile-id": candidate } })));

const general = ["hiking", "movies", "books", "music", "travel"].map((leaf, index) => ({
  exposure_ordinal: 0, namespace: "general", tag_key: `general.${leaf}.selected`,
  category_key: `general.${leaf}`, display_order: index + 1
}));
const food = ["sushi", "ramen", "hotpot", "dessert"].map((leaf, index) => ({
  exposure_ordinal: 0, namespace: "food", tag_key: `food.${leaf}.selected`,
  category_key: `food.${leaf}`, display_order: index + 1
}));
let currentInterestRows = [...general, ...food];
let profileAvailable = true;
const transport = {
  async withTransaction(operation) {
    return await operation({
      async query(statement, parameters) {
        check("10 protected reads receive only verified actor plus canonical candidate", parameters[0] === actor && parameters[1][0] === candidate && parameters[1].length === 1);
        if (statement.text.includes("project_exposed_social_profiles")) {
          return profileAvailable ? [{ exposure_ordinal: 0, display_name: "Kai", mascot_avatar_key: "PB", public_bio: "一起吃飯", willing_to_chat: true }] : [];
        }
        if (statement.text.includes("project_public_social_interests")) return currentInterestRows;
        throw new Error("unexpected statement");
      }
    });
  }
};

const composed = await profileComposer.composeMealBuddyCandidateProfile({ transport, actorUserId: actor, candidateUserId: candidate });
check("11 valid canonical identity loads the permitted public profile", composed?.profile.displayName === "Kai" && composed.profile.publicBio === "一起吃飯");
check("12 complete general interests are returned beyond compact three", composed?.profile.publicInterestTags.length === 5);
check("13 complete food interests are returned beyond compact three", composed?.profile.foodInterestTags.length === 4);
const serialized = JSON.stringify(composed);
check("14 private/auth/health/nutrition fields are absent", !/userId|profileId|email|phone|health|nutrition|dietary|auth/i.test(serialized));
check("15 Taste/ranking/context/entitlement internals are absent", !/taste|score|ranking|context|entitlement|premium|food_context_tag_key/i.test(serialized));
check("16 shared client validator admits the exact public response", validator.validateMealBuddyCandidateProfileApiResponseV1(composed).ok);
check("17 shared validator rejects an added private field", !validator.validateMealBuddyCandidateProfileApiResponseV1({ ...composed, profile: { ...composed.profile, email: "private@example.invalid" } }).ok);
check("18 shared validator rejects wrong-namespace fine tags", !validator.validateMealBuddyCandidateProfileApiResponseV1({ ...composed, profile: { ...composed.profile, foodInterestTags: ["general.life.books"] } }).ok);

const compact = aggregation.deriveCompactInterests(aggregation.aggregateInterestCategories(aggregation.collectProfileInterests(currentInterestRows)));
check("19 compact-card authority remains max three with overflow", compact.publicInterests.visibleCategories.length === 3 && compact.publicInterests.overflowCount === 2 && compact.foodInterests.visibleCategories.length === 3 && compact.foodInterests.overflowCount === 1);

const labelMap = new Map(currentInterestRows.map((row) => [row.tag_key, `label:${row.tag_key}`]));
const generalLabels = catalog.resolveFullInterestLabels(labelMap, composed.profile.publicInterestTags);
const foodLabels = catalog.resolveFullInterestLabels(labelMap, composed.profile.foodInterestTags);
check("20 full profile resolves all fine-grained tags through catalog labels", generalLabels.ok && generalLabels.value.length === 5 && foodLabels.ok && foodLabels.value.length === 4);
check("21 missing catalog label never renders a raw tag key", !catalog.resolveFullInterestLabels(new Map(), composed.profile.publicInterestTags).ok);

currentInterestRows = [...general.slice(0, 4), { exposure_ordinal: 0, namespace: "general", tag_key: "general.cycling.selected", category_key: "general.cycling", display_order: 9 }, ...food];
const refreshed = await profileComposer.composeMealBuddyCandidateProfile({ transport, actorUserId: actor, candidateUserId: candidate });
check("22 current Settings rows are read again rather than snapshotted", refreshed.profile.publicInterestTags.includes("general.cycling.selected") && !refreshed.profile.publicInterestTags.includes("general.travel.selected"));
profileAvailable = false;
check("23 deleted/blocked/unavailable profile yields no detail", await profileComposer.composeMealBuddyCandidateProfile({ transport, actorUserId: actor, candidateUserId: candidate }) === null);

const compactCard = fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
const screen = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx"), "utf8");
check("24 real card tap carries the candidateRef, never card ref/index/name", compactCard.includes("onPress(candidate.candidateRef)") && home.includes("onOpenRealCandidateProfile={openRealCandidateProfile}"));
check("25 destination has loading/error/retry/back states", ["ActivityIndicator", "phase === \"failed\"", "controller.retry()", "router.back()"].every((marker) => screen.includes(marker)));
const successorSources = new Map(SR2IB_SOURCE_PATHS.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
check("26 destination has no mock profile mapping and successor relationship controls remain separately contract-bound", !/getCommunityProfile|resolveCommunityProfileDisplay|mealBuddyCardMock|mockMatched|demoProfile|editProfile|editInterest/i.test(screen) && auditSr2ibSources(successorSources).length === 0);
check("27 full interests remain separated into general and food sections", screen.includes('title="興趣"') && screen.includes('title="愛吃"'));
check("28 no raw tag key is rendered by the full-profile screen", !/publicInterestTags\.map|foodInterestTags\.map|tagKey/.test(screen));

console.log(JSON.stringify({ suite: "social-candidate-sr2h-a-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
