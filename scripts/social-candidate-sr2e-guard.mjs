#!/usr/bin/env node
// SR-2E local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2eCanonicalManifest,
  SR2E_BASELINE,
  SR2E_FORBIDDEN_IMPORT_MARKERS,
  SR2E_MOBILE_FEATURE_ROOT,
  SR2E_SCREEN,
  SR2E_SHARED_ROOT,
  SR2E_SUCCESSOR_MIGRATION,
  SR2E_SUCCESSOR_PATHS
} from "./social-candidate-sr2e-successor-manifest.mjs";
// Lifecycle classification always belongs to the newest round: SR-2E's own byte assertions stay
// anchored to SR2E_BASELINE, while "which commit are we sitting on" is now SR-2G-A's question.
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import {
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_BASELINE, SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_BASELINE, SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { proveContractEquivalence } from "./social-candidate-sr2e-contract-equivalence.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const featureFiles = [
  "SocialCandidateCard.tsx", "factories.ts", "featureFlags.ts", "index.ts", "mascotAdapter.ts",
  "ports.ts", "runtimeBinding.ts", "socialCandidateService.ts", "supabaseSocialCandidateContracts.ts", "types.ts"
].sort();
const adapterFiles = ["disabledSocialCandidateRepository.ts", "mockSocialCandidateRepository.ts", "supabaseSocialCandidateRepository.ts"].sort();
const sharedFiles = ["index.ts", "types.ts", "validate.ts"].sort();
const featurePaths = [
  ...featureFiles.map((f) => `${SR2E_MOBILE_FEATURE_ROOT}/${f}`),
  ...adapterFiles.map((f) => `${SR2E_MOBILE_FEATURE_ROOT}/adapters/${f}`)
];
const packageScripts = Object.freeze({
  "test:social-candidate-sr2e": "node scripts/social-candidate-sr2e-guard.mjs",
  "test:social-candidate-sr2e-smoke": "node scripts/social-candidate-sr2e-smoke.mjs",
  "test:social-candidate-sr2e-mutations": "node scripts/social-candidate-sr2e-mutations.mjs",
  "test:social-candidate-sr2e-development-mobile-smoke": "node scripts/social-candidate-sr2e-development-mobile-smoke.mjs"
});
// Frozen backend authority pinned against the SR-2D freeze commit's blob bytes.
const frozenBackendFiles = [
  "supabase/functions/social-candidate-list/handler.ts",
  "supabase/functions/social-candidate-list/index.ts",
  "supabase/functions/social-candidate-list/config.ts",
  "supabase/functions/social-candidate-list/errors.ts",
  "supabase/functions/_shared/social-candidate-api/composeCandidateList.ts",
  "supabase/functions/_shared/social-candidate-api/policy.ts",
  "supabase/functions/_shared/social-candidate-api/toCandidateDto.ts",
  "supabase/functions/_shared/social-candidate-api/types.ts",
  "supabase/functions/_shared/social-candidate-ref/crypto.ts",
  "supabase/functions/_shared/social-candidate-ref/policy.ts",
  "supabase/config.toml"
];
// Every value forbidden from the client surface by frozen SR-2A/SR-2B/SR-2C authority.
const forbiddenClientValues = [
  "userId", "user_id", "candidateUserId", "profileId", "profile_id", "exposureIndex", "exposure_ordinal",
  "rankingState", "ranking_state", "similarityScore", "matchPercent", "compatibilityLabel", "matchReasons",
  "needsAttention", "restrictionWarning", "truncated", "hasMore", "isPremium", "isVerified",
  "verification_status", "verificationStatus", "realAvatarUrl", "real_avatar_url", "anonymousDisplayName",
  "dietSummary", "diet_summary", "nutritionGoal", "nutrition_goal_summary", "recentMealStyle",
  "distanceKm", "latitude", "longitude", "ageRange", "birthdate", "age_years", "planCode", "plan_code",
  "entitlement", "activityScore", "rankScore"
];

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
function gitBytes(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const blobSha256 = (file, ref) => crypto.createHash("sha256").update(gitBytes(["cat-file", "blob", `${ref}:${file}`])).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
function statusPaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function deltaEntries(commit = "HEAD") {
  return lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit]))
    .map((entry) => { const [status, file] = entry.split("\t"); return Object.freeze({ status, path: file.replaceAll("\\", "/") }); });
}
function lifecycleState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const originHead = git(["rev-parse", "origin/main"]).trim();
  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
  return Object.freeze({
    head, originHead, ahead, behind,
    headParent: head === SR2GF_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GF_BASELINE ? [] : deltaEntries()
  });
}
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
function typeAlias(source, name) {
  return source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name);
}
function typeLiteral(alias) {
  if (!alias) return null;
  if (ts.isTypeLiteralNode(alias.type)) return alias.type;
  if (ts.isTypeReferenceNode(alias.type) && alias.type.typeName.getText(alias.getSourceFile()) === "Readonly"
    && alias.type.typeArguments?.length === 1 && ts.isTypeLiteralNode(alias.type.typeArguments[0])) {
    return alias.type.typeArguments[0];
  }
  return null;
}
function propertyNames(alias) {
  const literal = typeLiteral(alias);
  if (!literal) return [];
  return literal.members.filter(ts.isPropertySignature)
    .map((member) => member.name.getText(alias.getSourceFile()).replaceAll('"', "")).sort();
}
const moduleSpecifiers = (source) => source.statements
  .filter((node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
  .map((node) => node.moduleSpecifier.text).sort();

try {
  const state = lifecycleState();
  const lifecycle = classifySr2gfLifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2E_BASELINE}:package.json`]));
  const packageWithoutSr2e = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2f", "test:social-candidate-sr2f-smoke", "test:social-candidate-sr2f-mutations", "test:social-candidate-sr2f-development-composition-smoke", "test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2e.scripts[key];

  const featureSources = new Map(featurePaths.map((file) => [file, read(file)]));
  const screenSource = read(SR2E_SCREEN);
  const allClientExecutable = [...featureSources.values(), screenSource].map(executable).join("\n");
  const supabaseAdapter = executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/adapters/supabaseSocialCandidateRepository.ts`));
  const mockAdapter = executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/adapters/mockSocialCandidateRepository.ts`));
  const contracts = featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/supabaseSocialCandidateContracts.ts`);
  const mascotAdapter = executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/mascotAdapter.ts`));
  const card = executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/SocialCandidateCard.tsx`));
  const screen = executable(screenSource);
  const sharedTypes = parse(`${SR2E_SHARED_ROOT}/types.ts`);
  const sharedValidate = read(`${SR2E_SHARED_ROOT}/validate.ts`);
  const equivalence = proveContractEquivalence();

  const featureDir = fs.readdirSync(path.join(root, SR2E_MOBILE_FEATURE_ROOT), { withFileTypes: true })
    .filter((e) => e.isFile()).map(({ name }) => name).sort();
  const adapterDir = fs.readdirSync(path.join(root, SR2E_MOBILE_FEATURE_ROOT, "adapters"), { withFileTypes: true })
    .filter((e) => e.isFile()).map(({ name }) => name).sort();
  const sharedDir = fs.readdirSync(path.join(root, SR2E_SHARED_ROOT), { withFileTypes: true })
    .filter((e) => e.isFile()).map(({ name }) => name).sort();

  const filesystemManifest = createSr2eCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2E_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2eCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2eCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- baseline / lifecycle -------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. lifecycle manifest is the exact SR-2G-F successor path set", exact(lifecycle.lifecycleManifest, SR2GF_SUCCESSOR_PATHS), { expected: SR2GF_SUCCESSOR_PATHS, actual: lifecycle.lifecycleManifest });
  check("3. the SR-2E baseline is the frozen SR-2D freeze commit", git(["cat-file", "-t", SR2E_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2E_BASELINE]).trim() === "Complete SR-2D real Social candidate API");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2E path exists", SR2E_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2E_SUCCESSOR_PATHS).size === SR2E_SUCCESSOR_PATHS.length && SR2E_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical SR-2E commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2E scripts", JSON.stringify(packageWithoutSr2e) === JSON.stringify(baselinePackage));
  check("9. exact module boundaries contain only the declared files", exact(featureDir, featureFiles) && exact(adapterDir, adapterFiles) && exact(sharedDir, sharedFiles), { featureDir, adapterDir, sharedDir });

  // --- API contract ---------------------------------------------------------------------------
  check("10. only the frozen social-candidate-list function is named", /SOCIAL_CANDIDATE_LIST_FUNCTION_NAME = "social-candidate-list" as const/.test(contracts) && (allClientExecutable.match(/"social-candidate-list"/g) ?? []).length === 1);
  check("11. no other Edge function is invoked from the SR-2E surface", !/meal-photo-analysis|social-candidate-taste|social-candidate-provenance/.test(allClientExecutable));
  check("12. the invoke contract accepts no options parameter at all", /invoke<T = unknown>\(\s*functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME\s*\): Promise/.test(contracts));
  check("13. the live adapter invokes with no body and no request options", /functions\.invoke\(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME\)/.test(supabaseAdapter) && !/invoke\([^)]*,\s*\{/.test(supabaseAdapter));
  check("14. no actor, candidate, limit, tier, entitlement or clock is ever sent", !/actorUserId|candidateUserId|\blimit\b|\btier\b|entitlementClass|planCode|requestInstant|\bnow:\s/.test(allClientExecutable));
  check("15. the read port takes no argument, so no policy input can be expressed", /listSocialCandidates\(\): Promise<SocialCandidateOutcome>/.test(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/ports.ts`)));
  check("16. the existing authenticated client is reused and no second client is constructed", /authPort\.getCurrentSession\(\)/.test(supabaseAdapter) && !/createClient|service_role|SERVICE_ROLE|serviceRole/i.test(allClientExecutable));
  check("17. no Authorization header or JWT is handled by this feature", !/Authorization|Bearer|access_token|jwt/i.test(allClientExecutable));
  check("18. Mobile never imports Edge-only server modules", !/supabase\/functions/.test(allClientExecutable));

  // --- DTO authority --------------------------------------------------------------------------
  check("19. the shared candidate DTO carries exactly the five public fields", exact(propertyNames(typeAlias(sharedTypes, "SocialCandidateDto")), ["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"]));
  check("20. the shared envelope carries exactly policyVersion and candidates", exact(propertyNames(typeAlias(sharedTypes, "SocialCandidateApiResponse")), ["candidates", "policyVersion"]));
  check("21. the shared policy version is exactly social-candidate-api-v1", /SOCIAL_CANDIDATE_API_POLICY_VERSION = "social-candidate-api-v1" as const/.test(read(`${SR2E_SHARED_ROOT}/types.ts`)));
  check("22. a shared validator exists and rejects a foreign policy version", /export function validateSocialCandidateApiResponseV1/.test(sharedValidate) && /unexpected policyVersion/.test(sharedValidate));
  check("23. the validator enforces exact key sets rather than ignoring extra fields", /exactKeys\(value, SOCIAL_CANDIDATE_RESPONSE_FIELDS\)/.test(sharedValidate) && /exactKeys\(value, SOCIAL_CANDIDATE_FIELDS\)/.test(sharedValidate));
  check("24. the validator preserves a null public bio rather than coercing it", /value\.publicBio !== null && typeof value\.publicBio !== "string"/.test(sharedValidate));
  check("25. the shared contract is equivalent to the frozen SR-2D Edge response shape", equivalence.candidateEquivalent && equivalence.responseEquivalent && equivalence.policyVersionEquivalent && equivalence.allowListEquivalent, equivalence);
  check("26. no raw invoke response is ever cast without validation", /validateSocialCandidateApiResponseV1\(invokeResult\.data\)/.test(supabaseAdapter) && !/as SocialCandidateApiResponse|as unknown as/.test(supabaseAdapter));

  // --- privacy --------------------------------------------------------------------------------
  check("27. no forbidden identifier, ranking, entitlement or private value appears on the client surface",
    forbiddenClientValues.every((field) => !new RegExp(`\\b${field}\\b`).test(allClientExecutable)),
    { firstHit: forbiddenClientValues.find((field) => new RegExp(`\\b${field}\\b`).test(allClientExecutable)) });
  check("28. the card renders only the four public profile facts", /candidate\.displayName/.test(card) && /candidate\.publicBio/.test(card) && /candidate\.willingToChat/.test(card) && /candidate\.mascotAvatarKey/.test(card) && !/candidate\.[a-zA-Z]+/.test(card.replace(/candidate\.(displayName|publicBio|willingToChat|mascotAvatarKey|candidateRef)/g, "")));
  check("29. no badge, score, distance or compatibility presentation exists", !/PremiumBadge|premium|verified|verification|distance|matchPercent|score|相似度|配對原因|match reason/i.test(card));
  check("30. no mock candidate, ranking or action authority is imported by the real feature",
    SR2E_FORBIDDEN_IMPORT_MARKERS.every((marker) => !featurePaths.concat(SR2E_SCREEN).some((file) => moduleSpecifiers(parse(file)).some((spec) => spec.includes(marker)))),
    SR2E_FORBIDDEN_IMPORT_MARKERS.filter((marker) => featurePaths.concat(SR2E_SCREEN).some((file) => moduleSpecifiers(parse(file)).some((spec) => spec.includes(marker)))));
  check("31. the mock adapter fixture carries only the frozen five-field shape",
    !/userId|profileId|rankScore|matchReasons|isPremium|isVerified|distanceKm|tags|restaurant/i.test(mockAdapter));

  // --- ordering -------------------------------------------------------------------------------
  check("32. the client never sorts, reverses, shuffles or reranks", !/\.sort\(|\.reverse\(|localeCompare|Math\.random|shuffle/.test(allClientExecutable));
  // Two separate conditions: no pagination vocabulary anywhere, and no slice of the candidate
  // collection. A string slice for an avatar initial is legal and is not a candidate cap.
  check("33. the client never caps or paginates the candidate array",
    !/paginat|cursor|nextPage|hasMore|pageSize|\boffset\b/i.test(allClientExecutable)
    && !/candidates\s*\)?\s*\.\s*slice\(/.test(allClientExecutable));
  check("34. the client never filters the returned candidate array", !/candidates\.filter\(|\.filter\(\(candidate/.test(allClientExecutable));
  check("35. the service is a pass-through with no ordering or capping authority", !/sort|slice|filter|cap|limit/i.test(executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/socialCandidateService.ts`))));
  check("36. willingToChat is presentation only and never a filter or ranking input", /candidate\.willingToChat \?/.test(card) && !/willingToChat\s*(===|!==)\s*(true|false)/.test(allClientExecutable) && !/filter[^)]*willingToChat/.test(allClientExecutable));

  // --- candidateRef ---------------------------------------------------------------------------
  check("37. candidateRef is never decoded, parsed or split", !/atob|base64|Buffer\.from\([^)]*candidateRef|candidateRef\.split|decodeURIComponent\(candidateRef|JSON\.parse\([^)]*candidateRef/.test(allClientExecutable));
  check("38. candidateRef is never persisted", !/AsyncStorage|SecureStore|localStorage|setItem|persist/i.test(allClientExecutable));
  check("39. candidateRef is used only as a list key for the current response", /key=\{candidate\.candidateRef\}/.test(screenSource));
  check("40. candidateRef is never treated as a profile or user identifier", !/profileId:\s*candidate|userId:\s*candidate|params:\s*\{\s*profileId/.test(allClientExecutable));
  check("41. candidateRef is never passed into a demo action store", !/createMealBuddyInvite|createOrOpenMealBuddyChat|getPendingInviteForCandidate|acceptMealBuddyInvite/.test(allClientExecutable));

  // --- UI / action boundary --------------------------------------------------------------------
  check("42. the card exposes no press handler or navigation", !/onPress|Pressable|TouchableOpacity|router\.|useRouter|Link/.test(card));
  check("43. the screen performs no candidate navigation at all", !/community-profile|router\.push|useRouter/.test(screen));
  // The legal willing-to-chat presentation identifiers are stripped first; anything else mentioning
  // invite, match, friend or chat in the card would be an action affordance SR-2E must not have.
  check("44. no invite, match, friend or chat affordance exists",
    !/invite|match|friend|chat/i.test(card.replace(/willingToChat(Open|Closed)?|chatOpen|chatClosed/g, "")));
  check("45. a successful empty list is rendered as an empty state, never an error", /state\.candidates\.length === 0/.test(screen) && /phase: "ready"/.test(screen));
  check("46. an error state is distinct from an empty state", /phase: "failed"/.test(screen) && /outcome\.ok\s*\n?\s*\?/.test(screen.replace(/\s+/g, " ")) === false || /outcome\.ok/.test(screen));
  check("47. the screen fetches once on mount with explicit refresh and retry only", /useEffect\(\(\) => \{ void load\(\); \}, \[load\]\)/.test(screen) && /RefreshControl/.test(screenSource) && !/setInterval|setTimeout|useFocusEffect|poll/i.test(allClientExecutable));
  check("48. no durable candidate cache exists", !/queryClient|cacheTime|staleTime|MMKV|persistQuery/i.test(allClientExecutable));

  // --- mascot ---------------------------------------------------------------------------------
  check("49. the mascot adapter maps by frozen assetKey, never by mascot id", /mascot\.assetKey === mascotAvatarKey/.test(mascotAdapter) && !/mascot\.id === mascotAvatarKey/.test(mascotAdapter));
  check("50. an unknown mascot key falls back and never throws or hides the candidate", /\?\? UNKNOWN_MASCOT/.test(mascotAdapter) && !/throw/.test(mascotAdapter) && !/return null/.test(mascotAdapter));
  check("51. the mascot adapter never mutates or writes back the candidate", !/candidate\./.test(mascotAdapter) && !/invoke|fetch|update/.test(mascotAdapter));
  check("52. the DEMO_ONLY community profile resolver is not reused", !/resolveCommunityProfileDisplay|getCommunityProfileByProfileId/.test(allClientExecutable));

  // --- runtime discipline -----------------------------------------------------------------------
  check("53. no logging exists on the SR-2E surface", !/console\.|logger\./.test(allClientExecutable));
  check("54. no write, mutation or analytics capability exists", !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|analytics|impression|track\(/i.test(allClientExecutable));
  check("55. the disabled adapter fails closed rather than returning an empty list", /social_candidates_disabled/.test(executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/adapters/disabledSocialCandidateRepository.ts`))) && !/candidates: \[\]/.test(executable(featureSources.get(`${SR2E_MOBILE_FEATURE_ROOT}/adapters/disabledSocialCandidateRepository.ts`))));
  check("56. the closed client error vocabulary is exact", ["authentication_required", "invalid_request", "server_unavailable", "network_error", "invalid_server_response", "internal_error", "social_candidates_disabled"].every((code) => read(`${SR2E_MOBILE_FEATURE_ROOT}/types.ts`).includes(`"${code}"`)));
  check("57. no raw server body, SQL or role detail can surface", !/error\.message|context\.text\(\)|stack/.test(supabaseAdapter) && /internal_error/.test(supabaseAdapter));
  check("58. an unset feature source defaults to disabled", /if \(!value\) return "disabled"/.test(read(`${SR2E_MOBILE_FEATURE_ROOT}/featureFlags.ts`)));

  // --- backend delta ----------------------------------------------------------------------------
  check("59. SR-2E adds no migration", SR2E_SUCCESSOR_MIGRATION === null && !SR2E_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/migrations/")));
  check("60. SR-2E changes no backend path at all", !SR2E_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/")));
  const sr2eFrozenBackend = frozenBackendFiles.filter((file) => !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file));
  check("61. every frozen SR-2D backend blob outside an enumerated successor is byte-unchanged", sr2eFrozenBackend.every((file) => blobSha256(file, SR2E_BASELINE) === sha256(file)), sr2eFrozenBackend.filter((file) => blobSha256(file, SR2E_BASELINE) !== sha256(file)));
  check("62. the repository migration set is unchanged from the baseline apart from the enumerated SR-2G-A migration", exact(fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).filter((f) => !SR2GA_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GB_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GC_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GBR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GCR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2CR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE1_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GE2_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GF_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`)).sort(), lines(git(["ls-tree", "-r", "--name-only", SR2E_BASELINE, "--", "supabase/migrations"])).map((f) => path.basename(f))));
  check("63. no Meal Buddy or Nearby demo path is modified", !SR2E_SUCCESSOR_PATHS.some((file) => /meal-buddy|meal-buddies|community-profile|app\/social\.tsx/.test(file)));

  // --- hygiene ------------------------------------------------------------------------------------
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@)|(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})|(sbp_[A-Za-z0-9]{20,})/i;
  check("64. candidate files contain no credential-shaped secret", !SR2E_SUCCESSOR_PATHS.map((file) => read(file)).some((source) => secretPattern.test(source)));
  const guardSource = read("scripts/social-candidate-sr2e-guard.mjs");
  const guardAst = ts.createSourceFile("guard.mjs", guardSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  let literalPass = false;
  let skipCall = false;
  const inspectGuard = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(guardAst) === "check") {
      const condition = node.arguments[1];
      if (condition && condition.kind === ts.SyntaxKind.TrueKeyword) literalPass = true;
    }
    if (ts.isIdentifier(node) && /^(skip|todo|pending)$/i.test(node.text)) skipCall = true;
    ts.forEachChild(node, inspectGuard);
  };
  inspectGuard(guardAst);
  check("65. guard contains no literal-true pass or skip call", !literalPass && !skipCall);
  check("66. canonical manifest is sorted raw-byte SHA-256 serialized as lowercase hash, two spaces, POSIX path and LF", filesystemManifest.text === expectedManifestText && filesystemManifest.paths.every((file, index, files) => index === 0 || files[index - 1] < file) && filesystemManifest.entries.every(({ path: file, sha256: hash }) => /^[0-9a-f]{64}$/.test(hash) && !file.includes("\\")) && filesystemManifest.text.endsWith("\n") && !filesystemManifest.text.includes("\r"));
  check("67. canonical aggregate is SHA-256 over the exact UTF-8 manifest bytes", filesystemManifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedManifestText, "utf8")).digest("hex"));
  check("68. frozen index and committed tree reproduce filesystem manifest bytes", !lifecycle.frozenShape || (frozenIndexManifest.text === filesystemManifest.text && frozenTreeManifest.text === filesystemManifest.text));

  console.log(JSON.stringify({
    suite: "social-candidate-sr2e-guard",
    status: failures.length === 0 ? "passed" : "failed",
    lifecycle: lifecycle.phase,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({
    suite: "social-candidate-sr2e-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}
