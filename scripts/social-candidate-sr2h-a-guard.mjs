#!/usr/bin/env node
// SR-2H-A lifecycle-aware, read-only authority guard.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  classifySr2haLifecycle, createSr2haCanonicalManifest,
  SR2HA_BASELINE, SR2HA_BASELINE_SUBJECT, SR2HA_SUCCESSOR_PATHS
} from "./social-candidate-sr2h-a-successor-manifest.mjs";
import { SR2HB_BASELINE, SR2HB_SUCCESSOR_PATHS } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
import { SR2IB_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";
import { auditSr2ibSources, SR2IB_SOURCE_PATHS } from "./meal-buddy-relationship-sr2i-b-contract.mjs";

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
const statusPaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
const head = git(["rev-parse", "HEAD"]).trim();
const originHead = git(["rev-parse", "origin/main"]).trim();
const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
const delta = head === SR2HA_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"]));
const state = Object.freeze({
  head, originHead, ahead, behind,
  headParent: head === SR2HA_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
  worktreePaths: statusPaths(), stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
  headDeltaPaths: delta.map((entry) => entry.split("\t")[1]),
  headDeleted: delta.some((entry) => entry.startsWith("D\t"))
});
const lifecycle = classifySr2haLifecycle(state);
const frozenHaDelta = lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", SR2HB_BASELINE]));
const frozenHaAuthority = git(["rev-parse", `${SR2HB_BASELINE}^`]).trim() === SR2HA_BASELINE
  && frozenHaDelta.length === SR2HA_SUCCESSOR_PATHS.length
  && frozenHaDelta.every((entry, index) => entry === [...SR2HA_SUCCESSOR_PATHS].sort()[index]);
const serverCompose = read("supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts");
const serverRequest = read("supabase/functions/_shared/meal-buddy-candidate-profile-api/request.ts");
const serverTypes = read("supabase/functions/_shared/meal-buddy-candidate-profile-api/types.ts");
const handler = read("supabase/functions/meal-buddy-candidate-profile/handler.ts");
const errors = read("supabase/functions/meal-buddy-candidate-profile/errors.ts");
const sharedTypes = read("packages/shared/src/domain/meal-buddy-candidate/types.ts");
const sharedValidate = read("packages/shared/src/domain/meal-buddy-candidate/validate.ts");
const mobileAdapter = read("apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateProfileRepository.ts");
const mobileHook = read("apps/mobile/features/meal-buddy-candidates/useMealBuddyCandidateProfile.ts");
const screen = read("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx");
const home = read("apps/mobile/app/meal-buddies.tsx");
const compact = read("apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx");
const catalog = read("apps/mobile/features/meal-buddy-candidates/interestCatalog.ts");
const config = read("supabase/config.toml");
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(git(["show", `${SR2HA_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
for (const name of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[name];
for (const name of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithout.scripts[name];
for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithout.scripts[key];
// SR-2K-A adds three validation-only command keys. Stripping them keeps this guard measuring
// what it has always measured: that no OTHER package byte moved.
for (const key of ["test:meal-buddy-closure-sr2k-a", "test:meal-buddy-closure-sr2k-a-smoke", "test:meal-buddy-closure-sr2k-a-mutations"]) delete packageWithout.scripts[key];

check("01 lifecycle is exact candidate, frozen or exact SR-2H-B successor", lifecycle.valid, { phase: lifecycle.phase, head, originHead, ahead, behind });
const expectedSuccessorPaths = lifecycle.phase.startsWith("successor_successor_successor_")
  ? SR2IB_SUCCESSOR_PATHS
  : lifecycle.phase.startsWith("successor_successor_") ? SR2IA_SUCCESSOR_PATHS : SR2HB_SUCCESSOR_PATHS;
check("02 frozen SR-2H-A authority and any successor manifest remain exact", frozenHaAuthority && (lifecycle.phase.startsWith("successor_")
  ? lifecycle.manifest.length === expectedSuccessorPaths.length && lifecycle.manifest.every((entry, index) => [...expectedSuccessorPaths].sort()[index] === [...lifecycle.manifest].sort()[index])
  : lifecycle.manifest.length === SR2HA_SUCCESSOR_PATHS.length && lifecycle.manifest.every((entry, index) => [...SR2HA_SUCCESSOR_PATHS].sort()[index] === [...lifecycle.manifest].sort()[index])));
check("03 pushed SR-2G-G baseline and subject are pinned", git(["cat-file", "-t", SR2HA_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2HA_BASELINE]).trim() === SR2HA_BASELINE_SUBJECT);
check("04 staged bytes are prohibited", state.stagedPaths.length === 0);
check("05 every successor path exists and none is deleted", SR2HA_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))) && !state.headDeleted);
check("06 package differs only by the exact SR-2H-A and SR-2H-B local commands", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
check("07 no dependency or lockfile change exists", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && !SR2HA_SUCCESSOR_PATHS.some((file) => /lock/.test(file)));
check("08 frozen SR-2H-A creates no migration", !SR2HA_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/migrations/")) && frozenHaDelta.every((file) => !file.startsWith("supabase/migrations/")));

check("09 request accepts only candidateRef", /Object\.keys\(record\)\.length !== 1/.test(serverRequest) && serverRequest.includes('"candidateRef" in record'));
check("10 candidateRef remains opaque and actor-bound", handler.includes("createSocialCandidateRefCipher") && handler.includes("authentication.value.userId, parsed.value.candidateRef") && !/atob|base64|candidateRef\.slice/.test(mobileAdapter + mobileHook + screen + home));
check("11 forged, expired, wrong-actor and unavailable targets collapse to one error", handler.includes('buildMealBuddyCandidateProfileError("invalid_request")') && errors.includes("candidate profile is unavailable") && !/candidate_not_found|profile_not_found/.test(errors));
check("12 viewer authentication is the sole actor source", handler.includes("authenticateCaller") && !/actorUserId|viewerUserId/.test(serverRequest));
check("13 current canonical candidate pool is rechecked by both frozen projections", serverCompose.includes("readExposedSocialProfileFacts") && serverCompose.includes("readExposedCandidateInterests"));
check("14 no direct Mobile table/profile read exists", !/\.from\(|consumer_profiles|social_profile_interest_selection/.test(mobileAdapter + mobileHook + screen));
check("15 endpoint uses least-privilege executor transport, not service role", handler.includes("createDenoSocialRuntimeExecutorTransport") && !/service[_-]?role/i.test(handler + serverCompose));
check("16 authenticated Supabase function config is explicit", config.includes("[functions.meal-buddy-candidate-profile]") && /\[functions\.meal-buddy-candidate-profile\][\s\S]*?verify_jwt = true/.test(config));

const exactPublicFields = ["displayName", "mascotAvatarKey", "publicBio", "willingToChat", "publicInterestTags", "foodInterestTags"];
check("17 profile response allow-list is exact", exactPublicFields.every((field) => sharedTypes.includes(`\"${field}\"`)) && /does not carry exactly the public profile fields/.test(sharedValidate));
check("18 private identity/contact/profile fields are absent", !/userId|profileId|email|phone|realAvatar|authId/.test(serverTypes));
check("19 health/nutrition/private Settings fields are absent", !/health|nutrition|dietary|restriction|target|timezone|locale/.test(serverTypes));
check("20 Taste/ranking/context/exposure internals are absent from DTO", !/taste|score|ranking|contextState|contextScore|food_context_tag_key|entitlement|premium/i.test(serverTypes));
check("21 Free and Premium cannot select different profile fields", !/resolveSocialEntitlement|applySocialExposure|subscription_entitlements/.test(serverCompose) && !/free|premium|tier|entitlement/i.test(serverTypes));
check("22 full fine-grained general interests are not compact-truncated", serverCompose.includes("publicInterestTags") && !/publicInterestTags[\s\S]{0,100}slice\(0,\s*3\)/.test(serverCompose));
check("23 full fine-grained food interests are not compact-truncated", serverCompose.includes("foodInterestTags") && !/foodInterestTags[\s\S]{0,100}slice\(0,\s*3\)/.test(serverCompose));
check("24 frozen selection maxima remain enforced", sharedValidate.includes('validateFullInterestTags(profile.publicInterestTags, "general", 8)') && sharedValidate.includes('validateFullInterestTags(profile.foodInterestTags, "food", 5)'));
check("25 current profile settings remain the only interest source", serverCompose.includes("readExposedCandidateInterests") && !/meal_buddy_cards|snapshot|cardByOwner/.test(serverCompose));
check("26 catalog labels are mandatory before full-profile rendering", mobileHook.includes("resolveFullInterestLabels") && catalog.includes('reason: "missing_catalog_label"') && !/publicInterestTags\.map|foodInterestTags\.map/.test(screen));
check("27 namespaces render as two separate sections", screen.includes('title="興趣"') && screen.includes('title="愛吃"'));

check("28 real candidate card still passes person ref only", compact.includes("onPress(candidate.candidateRef)") && !compact.includes("onPress(candidate.candidateCardRef)"));
check("29 real candidate screen routes that ref to the dedicated profile", home.includes("openRealCandidateProfile") && home.includes('pathname: "/meal-buddy-candidate-profile/[candidateRef]"'));
check("30 profile route has loading/error/retry/back states", ["ActivityIndicator", 'phase === "failed"', "controller.retry()", "router.back()"].every((marker) => screen.includes(marker)));
check("31 profile route contains no mock/demo data authority", !/getCommunityProfile|resolveCommunityProfileDisplay|mealBuddyCardMock|mockMatched|demoProfile/i.test(screen + mobileHook + mobileAdapter));
const successorRelationshipContract = lifecycle.phase.startsWith("successor_successor_successor_")
  ? auditSr2ibSources(new Map(SR2IB_SOURCE_PATHS.map((file) => [file, read(file)]))).length === 0
  : !/createInvite|acceptInvite|friendship|sendMessage|editProfile|editInterest/i.test(screen + mobileHook);
check("32 frozen public profile disclosure remains read-only while sanctioned successor relationship controls stay separately contract-bound", !/editProfile|editInterest|targetUserId|email|phone|rankingScore/i.test(screen + mobileHook) && successorRelationshipContract);
check("33 candidate server order and compact card bytes remain frozen", git(["diff", "--name-only", SR2HA_BASELINE, "--", "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx", "apps/mobile/features/meal-buddy-candidates/MealBuddyRealCandidateSection.tsx"]).trim() === "");
check("34 ranking, exposure, context and recommendation authority bytes remain frozen", git(["diff", "--name-only", SR2HA_BASELINE, "--", "supabase/functions/_shared/social-ranking", "supabase/functions/_shared/social-exposure", "supabase/functions/_shared/meal-buddy-context", "supabase/functions/_shared/meal-buddy-card-api"]).trim() === "");
check("35 no legacy demo community-profile surface is modified", git(["diff", "--name-only", SR2HA_BASELINE, "--", "apps/mobile/app/community-profile", "apps/mobile/features/display-resolvers"]).trim() === "");
check("36 shared response validator rejects unexpected fields", sharedValidate.includes("exactKeys(value.profile, MEAL_BUDDY_CANDIDATE_PROFILE_FIELDS)"));
check("37 Mobile validates success before rendering", mobileAdapter.includes("validateMealBuddyCandidateProfileApiResponseV1") && mobileAdapter.includes("invalid_server_response"));
check("38 no raw server error reaches UI", !/error\.message|invokeResult\.error\.message|response\.text/.test(screen + mobileHook + mobileAdapter));
check("39 dedicated commands are exact", packageJson.scripts["test:social-candidate-sr2h-a"] === "node scripts/social-candidate-sr2h-a-guard.mjs" && packageJson.scripts["test:social-candidate-sr2h-a-smoke"] === "node scripts/social-candidate-sr2h-a-smoke.mjs" && packageJson.scripts["test:social-candidate-sr2h-a-mutations"] === "node scripts/social-candidate-sr2h-a-mutations.mjs");
check("40 no deployment, Production or remote operator tooling is introduced", !SR2HA_SUCCESSOR_PATHS.some((file) => /deploy|production/i.test(file)) && !/supabase\s+(db push|functions deploy)|--project-ref/.test(SR2HA_SUCCESSOR_PATHS.filter((file) => !file.startsWith("scripts/")).map(read).join("\n")));

const manifest = createSr2haCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
check("41 canonical raw-byte manifest covers every exact path", manifest.entries.length === SR2HA_SUCCESSOR_PATHS.length && manifest.entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)));
console.log(JSON.stringify({ suite: "social-candidate-sr2h-a-guard", lifecycle: lifecycle.phase, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, canonicalManifestSha256: manifest.aggregateSha256, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
