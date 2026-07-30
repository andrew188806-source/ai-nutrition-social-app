#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

// Strips // line comments (TS) so "must not contain X" checks can't false-positive on prose that
// mentions X while explaining why it was removed/avoided.
function stripTsComments(source) {
  return source.replace(/\/\/.*$/gm, "");
}

// Strips -- line comments (SQL) for the same reason.
function stripSqlComments(source) {
  return source.replace(/--.*$/gm, "");
}

const checks = [];
function record(name, pass) {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const PROTECTED_MIGRATION = "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const PROTECTED_MIGRATION_SHA256 = "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";

const sharedContractTypes = read("packages/shared/src/domain/meal-photo-analysis/types.ts");
const sharedDomainIndex = read("packages/shared/src/domain/index.ts");
const sharedConsentTypes = read("packages/shared/src/domain/consumer-consent/types.ts");
const mealIdentificationTypes = read("apps/mobile/features/meal-identification/types.ts");
const analysisTypes = read("apps/mobile/features/analysis/types.ts");
const consumerAuthIndex = read("apps/mobile/features/consumer-auth/index.ts");
const analysesMigration = read("supabase/migrations/20260725010000_meal_photo_analysis_meal_analyses_additive_columns.sql");
const correctionsMigration = read("supabase/migrations/20260725020000_meal_photo_analysis_meal_corrections_verification_status.sql");
const storageMigration = read("supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql");
const grantMigration = read("supabase/migrations/20260726010000_meal_photo_analysis_service_role_table_grants.sql");
const gitStatus = git(["status", "--porcelain=v1"]);
const gitDiffNames = git(["diff", "--name-only"]) + git(["diff", "--cached", "--name-only"]);

// MI-E-C3-R1: the Mobile upload implementation this guard's contract eventually feeds. Read only
// if present — this guard must keep passing on a checkout from before MI-E-C3 existed, so these
// checks are skipped (not failed) when the feature folder doesn't exist yet.
const mealPhotoUploadRoot = "apps/mobile/features/meal-photo-upload";
const mealPhotoUploadExists = exists(mealPhotoUploadRoot);
const mealPhotoUploadFiles = mealPhotoUploadExists
  ? (function walk(dir) {
      return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(rel) : entry.isFile() && entry.name.endsWith(".ts") ? [rel] : [];
      });
    })(mealPhotoUploadRoot)
  : [];
const mealPhotoUploadSource = mealPhotoUploadFiles.map(read).join("\n\n");
const zhTW = read("lib/i18n/zh-TW.ts");

// ==== §八 items 1-6: consent authority moved to shared, with unambiguous hash evidence ====

record(
  "AI training consent authority (type, manifest, production-readiness assertion) lives in packages/shared/src/domain/consumer-consent",
  exists("packages/shared/src/domain/consumer-consent/types.ts") &&
    exists("packages/shared/src/domain/consumer-consent/index.ts") &&
    /export \* from ".\/consumer-consent"/.test(sharedDomainIndex)
);
record(
  "Mobile no longer holds a second consent constant, manifest, or type definition — the old consentPolicy.ts is gone",
  !exists("apps/mobile/features/consumer-auth/consentPolicy.ts")
);
record(
  "consumer-auth's barrel only re-exports the consent authority from @haocu/shared (no local re-definition)",
  /from "@haocu\/shared";/.test(consumerAuthIndex) &&
    /CONSUMER_AI_TRAINING_CONSENT_TYPE/.test(consumerAuthIndex) &&
    /CONSUMER_POLICY_BUNDLE_MANIFEST/.test(consumerAuthIndex) &&
    !/export const CONSUMER_AI_TRAINING_CONSENT_TYPE =/.test(consumerAuthIndex) &&
    !/export const CONSUMER_POLICY_BUNDLE_MANIFEST/.test(consumerAuthIndex)
);
const sharedConsentCode = stripTsComments(sharedConsentTypes);
record(
  "assertConsumerPolicyBundleIsProductionReady requires all three per-document content hashes for an active entry (no ambiguous single contentSha256 field defined)",
  !/\bcontentSha256\s*:/.test(sharedConsentCode) &&
    /membershipTermsContentSha256: string \| null;/.test(sharedConsentTypes) &&
    /privacyPolicyContentSha256: string \| null;/.test(sharedConsentTypes) &&
    /aiTrainingTermsContentSha256: string \| null;/.test(sharedConsentTypes) &&
    /if \(!entry\.membershipTermsContentSha256\) missing\.push/.test(sharedConsentTypes) &&
    /if \(!entry\.privacyPolicyContentSha256\) missing\.push/.test(sharedConsentTypes) &&
    /if \(!entry\.aiTrainingTermsContentSha256\) missing\.push/.test(sharedConsentTypes)
);
record(
  "the shipped development_placeholder manifest entry cannot pass assertConsumerPolicyBundleIsProductionReady (it is not status: \"active\", so the assertion is a no-op for it, and it carries no real hashes regardless)",
  /status: "development_placeholder"/.test(sharedConsentTypes) &&
    /membershipTermsContentSha256: null,/.test(sharedConsentTypes) &&
    /privacyPolicyContentSha256: null,/.test(sharedConsentTypes) &&
    /aiTrainingTermsContentSha256: null,/.test(sharedConsentTypes) &&
    !/status: "active"/.test(sharedConsentTypes)
);
record(
  "no ambiguous single contentSha256 field is defined anywhere in the consent authority (as a property, not counting explanatory comments)",
  !/\bcontentSha256\s*:/.test(sharedConsentCode)
);

// ==== §八 items 7-11: Storage path RLS second-segment enforcement ====

const storageCode = storageMigration; // policies are SQL statements, not comments — check directly
record(
  "Storage INSERT policy requires the second path segment (analysis_request_id folder) to exist and be non-empty",
  /create policy meal_analysis_photos_owner_insert[\s\S]{0,400}\(storage\.foldername\(name\)\)\[2\] is not null[\s\S]{0,100}\(storage\.foldername\(name\)\)\[2\] <> ''/.test(storageCode)
);
record(
  "Storage SELECT policy requires the second path segment to exist and be non-empty",
  /create policy meal_analysis_photos_owner_select[\s\S]{0,400}\(storage\.foldername\(name\)\)\[2\] is not null[\s\S]{0,100}\(storage\.foldername\(name\)\)\[2\] <> ''/.test(storageCode)
);
record(
  "Storage DELETE policy requires the second path segment to exist and be non-empty",
  /create policy meal_analysis_photos_owner_delete[\s\S]{0,400}\(storage\.foldername\(name\)\)\[2\] is not null[\s\S]{0,100}\(storage\.foldername\(name\)\)\[2\] <> ''/.test(storageCode)
);
record(
  "all three policies still require the first path segment to equal the authenticated caller's auth.uid()",
  (storageCode.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) ?? []).length === 3
);
record(
  "no UPDATE policy is created — UPDATE fails closed by the absence of any matching policy",
  !/create policy[\s\S]{0,120}for update/i.test(stripSqlComments(storageMigration))
);

// ==== §八 items 12-14: shared package export/import hygiene ====

record(
  "packages/shared's public API (package.json main/types) points at real, transpilable TS source, and the domain barrel re-exports both new domains",
  JSON.parse(read("packages/shared/package.json")).main === "src/index.ts" &&
    JSON.parse(read("packages/shared/package.json")).types === "src/index.ts" &&
    /export \* from ".\/meal-photo-analysis"/.test(sharedDomainIndex) &&
    /export \* from ".\/consumer-consent"/.test(sharedDomainIndex)
);
record(
  "Mobile never uses a @haocu/shared/src deep import — only the package's public root",
  !/@haocu\/shared\/src/.test(mealIdentificationTypes) &&
    !/@haocu\/shared\/src/.test(analysisTypes) &&
    !/@haocu\/shared\/src/.test(consumerAuthIndex)
);
record(
  "packages/shared never imports from apps/mobile (no reverse/circular dependency) — verified via a real bundle export, not just typecheck (see MI-E-C1-R2 report §Bundle)",
  !/from ["']\.\.\/\.\.\/\.\.\/apps\/mobile|from ["']apps\/mobile/.test(sharedContractTypes) &&
    !/from ["']\.\.\/\.\.\/\.\.\/apps\/mobile|from ["']apps\/mobile/.test(sharedConsentTypes)
);

// ==== §八 items 15-17: R1 corrections must not regress ====

const sharedContractCode = stripTsComments(sharedContractTypes);
record(
  "the analysis contract still contains no vendor name literal (no \"openai\") outside of comments, and providerCategory remains provider-neutral",
  !/"openai"/i.test(sharedContractCode) &&
    /export type MealPhotoAnalysisProviderCategory = "external_multimodal" \| "tastkind_model" \| "hybrid";/.test(sharedContractTypes) &&
    /analysisEngineVersion: string;/.test(sharedContractTypes) &&
    !/providerModel:/.test(sharedContractCode)
);
record(
  "no migration uses 'training_asset' as a lifecycle value, and meal_analyses still has no asset_lifecycle_stage column",
  ![analysesMigration, correctionsMigration, storageMigration].some((sql) => /'training_asset'/.test(sql)) &&
    !/add column\s+asset_lifecycle_stage/i.test(analysesMigration)
);
record(
  "no migration adds a permanent training_eligible boolean column",
  ![analysesMigration, correctionsMigration].some((sql) => /add column\s+training_eligible\s+boolean/i.test(sql))
);

// ==== §八 item 18: bucket conflict-safe configuration must not regress ====

record(
  "bucket insert still uses ON CONFLICT DO UPDATE (not DO NOTHING) and still forces public/size/MIME settings",
  !/on conflict \(id\) do nothing/i.test(stripSqlComments(storageMigration)) &&
    /on conflict \(id\) do update set[\s\S]{0,200}public = excluded\.public/.test(storageMigration) &&
    /file_size_limit = excluded\.file_size_limit/.test(storageMigration) &&
    /allowed_mime_types = excluded\.allowed_mime_types/.test(storageMigration)
);
record(
  "meal_corrections.verification_status DB check constraint still restricts it to the 5 legal values",
  /add constraint meal_corrections_verification_status_valid check \(\s*verification_status in \('unreviewed', 'user_confirmed', 'user_corrected', 'nutritionist_reviewed', 'rejected'\)\s*\)/.test(correctionsMigration)
);

// ==== §八 items 19-20: unchanged safety invariants ====

// MI-E-C2-R1: the deferred P2V-PERF migration was formally quarantined out of the active
// migrations queue this round (moved to an operator-controlled, machine-local location outside
// this repository — see the MI-E-C2 report §2). This guard's invariant is therefore inverted from
// its original form: it must NOT exist in the active queue, and must not be tracked, staged, or
// committed. PROTECTED_MIGRATION_SHA256 is retained purely as documentation metadata (the SHA-256
// the externally-quarantined copy is expected to have) — it is NOT checked against any filesystem
// path by this guard, so the guard has no machine-local filesystem dependency and behaves
// identically on every machine/CI environment, including ones where the external quarantine copy
// does not exist at all. The quarantine copy's actual path and SHA-256 are verified by
// operator/human validation each round that touches it, not by this automated guard.
record(
  "the deferred P2V-PERF migration is NOT present in the active supabase/migrations/ queue (quarantined out, per MI-E-C2 §2) and is not tracked/staged/committed",
  !exists(PROTECTED_MIGRATION) && !gitStatus.includes(PROTECTED_MIGRATION) && !gitDiffNames.includes(PROTECTED_MIGRATION)
);
// MI-E-C5-B1: this check was originally a one-time freeze gate ("no file in this feature was
// touched this round"), valid only until a round with explicit authority to extend the
// finalization RPC existed. MI-E-C5-B1 has exactly that authority (a backward-compatible v3
// branch on the same RPC). Replaced, per the same pattern as the MI-E-C4-R1 Edge Function
// invariants below, with the durable property that actually matters and holds for every future
// round regardless of whether it touches these files: the finalization feature still calls
// exactly one RPC (never a direct table write, never a second RPC name).
record(
  "apps/mobile/features/meal-identification-finalization/ still performs no direct Supabase table write — every write path is a single .rpc( call to finalize_current_user_meal_identification_v1",
  (() => {
    const dir = path.join(root, "apps/mobile/features/meal-identification-finalization");
    if (!exists("apps/mobile/features/meal-identification-finalization")) return true;
    function collectTsFiles(d) {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) return collectTsFiles(full);
        return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
      });
    }
    const src = collectTsFiles(dir)
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n\n");
    const hasDirectWrite =
      /\.from\(\s*["'](meal_records|meal_record_items|meal_analyses|meal_corrections|meal_identification_finalizations)["']\s*\)\s*\.(insert|update|delete|upsert)\(/.test(
        src
      );
    const finalizeNameLiterals = src.match(/"finalize_[a-zA-Z0-9_]*"/g) ?? [];
    const onlyExpectedRpc = finalizeNameLiterals.every((n) => n === '"finalize_current_user_meal_identification_v1"');
    return !hasDirectWrite && onlyExpectedRpc;
  })()
);
// ==== MI-E-C4-R1: durable meal-photo-analysis Edge Function invariants replacing the MI-E-C1
// freeze-only "supabase/functions/ remains empty" check. That check was MI-E-C1's own one-time
// freeze-gate assertion (valid only until the next round that legitimately created a Function) —
// not a standing regression invariant, exactly like the analysis.tsx/HEAD-pinned checks MI-E-C3-R1
// already replaced above. These checks instead state the actual properties this guard cares about
// (auth stays on, no public mode, frozen RPC untouched, AI-observation-only scope, no premature
// writes, no training/licensing pipeline) directly against the Function's own current source —
// they do not depend on the Function never existing, a fixed historical HEAD, "this round" framing,
// or any machine-local external file, so they hold for every future round the same way.
const mealPhotoAnalysisFnRoot = "supabase/functions/meal-photo-analysis";
const mealPhotoAnalysisFnExists = exists(mealPhotoAnalysisFnRoot) && exists(`${mealPhotoAnalysisFnRoot}/index.ts`);
const mealPhotoAnalysisFnFiles = mealPhotoAnalysisFnExists
  ? fs.readdirSync(path.join(root, mealPhotoAnalysisFnRoot)).filter((f) => f.endsWith(".ts"))
  : [];
const mealPhotoAnalysisFnSource = mealPhotoAnalysisFnFiles.map((f) => read(`${mealPhotoAnalysisFnRoot}/${f}`)).join("\n\n");
const mealPhotoAnalysisFnSourceNoComments = stripTsComments(mealPhotoAnalysisFnSource);
const configTomlSrc = exists("supabase/config.toml") ? read("supabase/config.toml") : "";

record("the meal-photo-analysis Edge Function exists (supabase/functions/meal-photo-analysis/index.ts)", mealPhotoAnalysisFnExists);

record(
  "config.toml keeps verify_jwt = true for meal-photo-analysis — never false, never absent",
  mealPhotoAnalysisFnExists &&
    /\[functions\.meal-photo-analysis\][\s\S]{0,400}verify_jwt\s*=\s*true/.test(configTomlSrc) &&
    !/\[functions\.meal-photo-analysis\][\s\S]{0,400}verify_jwt\s*=\s*false/.test(configTomlSrc)
);

record(
  "the Function contains no --no-verify-jwt flag reference and no public/anonymous mode marker",
  !mealPhotoAnalysisFnExists || !/no-verify-jwt|verify_jwt\s*=\s*false/i.test(mealPhotoAnalysisFnSourceNoComments)
);

record(
  "the Function source never references a Mobile-only EXPO_PUBLIC_* secret, and Mobile never references the service-role key or the Function's admin persistence key",
  (!mealPhotoAnalysisFnExists || !/EXPO_PUBLIC_[A-Z_]*(OPENAI|SERVICE_ROLE|ADMIN_KEY)/i.test(mealPhotoAnalysisFnSourceNoComments)) &&
    (() => {
      try {
        const grep = git(["grep", "--untracked", "-lE", "SUPABASE_SERVICE_ROLE_KEY|MEAL_PHOTO_ANALYSIS_ADMIN_KEY", "--", "apps/mobile"]);
        return grep.trim().length === 0;
      } catch {
        return true;
      }
    })()
);

record(
  "the Function never modifies or calls the frozen finalize_current_user_meal_identification_v1 RPC",
  !mealPhotoAnalysisFnExists || !/finalize_current_user_meal_identification_v1/.test(mealPhotoAnalysisFnSourceNoComments)
);

record(
  "the Function stays AI-visual-observation-only: no restaurant/menu catalog auto-resolution and no verified-nutrition claim",
  !mealPhotoAnalysisFnExists ||
    (!/resolveCatalogMealCandidates|restaurant_catalog|menu_items/i.test(mealPhotoAnalysisFnSourceNoComments) &&
      !/verified nutrition|verifiedNutrition|已驗證的營養/i.test(mealPhotoAnalysisFnSourceNoComments))
);

record(
  "the Function never writes a meal_records, meal_record_items, or meal_corrections row",
  !mealPhotoAnalysisFnExists ||
    !/from\(\s*["']meal_records["']\s*\)|from\(\s*["']meal_record_items["']\s*\)|from\(\s*["']meal_corrections["']\s*\)/.test(mealPhotoAnalysisFnSourceNoComments)
);

record(
  "the Function establishes no training pipeline (no trainingEligible/trainingConsent/allowTraining/canTrain field or training-dataset/model-artifact reference)",
  !mealPhotoAnalysisFnExists ||
    !/trainingEligible|trainingConsent|allowTraining|canTrain|training-dataset|model-artifact|dataset-export/i.test(mealPhotoAnalysisFnSourceNoComments)
);

record(
  "the Function establishes no restaurant commercial permission/grant",
  !mealPhotoAnalysisFnExists || !/restaurantCommercialPermission|restaurantCommercialGrant|commercialLicense/i.test(mealPhotoAnalysisFnSourceNoComments)
);

record(
  "Mobile makes no direct OpenAI call (no vendor SDK import, no api.openai.com reference, no OPENAI_API_KEY reference)",
  (() => {
    try {
      const grep = git(["grep", "--untracked", "-lE", "openai|api\\.openai\\.com|OPENAI_API_KEY", "--", "apps/mobile"]);
      return grep.trim().length === 0;
    } catch {
      return true;
    }
  })()
);
record(
  "no file in this contract's own surface imports an OpenAI SDK or calls an OpenAI API endpoint",
  ![sharedContractTypes, sharedConsentTypes, mealIdentificationTypes, analysisTypes, consumerAuthIndex, analysesMigration, correctionsMigration, storageMigration, grantMigration].some(
    (text) => /from\s+["']openai["']|new OpenAI\(|api\.openai\.com|require\(["']openai["']\)/i.test(text)
  )
);

// ==== MI-E-C3-R1: durable long-term invariants replacing MI-E-C1's own one-time freeze checks ====
//
// The two checks this replaces ("analysis.tsx/meal-photo.tsx must never be modified again" and
// "HEAD must equal the MI-E-C1/R2 freeze commit") were MI-E-C1's OWN freeze-gate assertions, valid
// only for that one round's commit — not a standing regression invariant for every future round.
// The very next legitimate round (MI-E-C3) needed to modify both files to wire real photo upload,
// which is exactly the kind of authorized evolution those two checks could never distinguish from
// a violation. They are replaced with checks that state the actual property this guard cares
// about — the frozen contract's constraints keep being honored by whatever implementation exists
// today — without pinning to a specific commit or forbidding named files from ever changing again.
record(
  "the frozen shared meal-photo-analysis contract module still exists with its canonical builder",
  exists("packages/shared/src/domain/meal-photo-analysis/types.ts") &&
    /export function buildMealPhotoAnalysisObjectPath/.test(sharedContractTypes)
);
record(
  "Mobile's meal photo upload implementation (if present) contains no trusted user-id field on its upload input type",
  !mealPhotoUploadExists || !/\buserId\s*:\s*string/.test(read(`${mealPhotoUploadRoot}/types.ts`))
);
record(
  "Mobile's meal photo upload implementation (if present) contains no per-photo training consent field",
  !mealPhotoUploadExists || !/trainingEligible|trainingConsent|allowTraining|canTrain/i.test(stripTsComments(mealPhotoUploadSource))
);
record(
  "Mobile's meal photo upload implementation (if present) contains no restaurant commercial permission/grant field",
  !mealPhotoUploadExists || !/restaurantCommercialPermission|restaurantCommercialGrant|commercialLicense/i.test(stripTsComments(mealPhotoUploadSource))
);
record(
  "Mobile's meal photo upload implementation (if present) contains no OpenAI call and no Edge Function invocation/definition",
  !mealPhotoUploadExists ||
    (!/openai|api\.openai\.com/i.test(stripTsComments(mealPhotoUploadSource)) &&
      !/functions\.invoke|supabase\/functions|Deno\.serve/i.test(stripTsComments(mealPhotoUploadSource)))
);
record(
  "the private Storage bucket migration still sets public = false for meal-analysis-photos (durable — not tied to any specific later diff)",
  /insert into storage\.buckets[\s\S]{0,300}false/.test(storageMigration) || /public\s*=\s*false/.test(storageMigration)
);
record(
  "the demo AI-analysis UI text explicitly discloses that real AI analysis is not yet connected, and contains none of the banned false-completion phrases",
  /AI 影像分析尚未接通|AI 分析尚未接通|尚未依這張照片進行 AI 計算|尚未依這張照片實際進行 AI 計算/.test(zhTW) &&
    !/AI\s*正在分析餐點中|已辨識成功/.test(stripTsComments(zhTW))
);

// ==== carried-forward canonical-vocabulary checks (must not regress from R1) ====

record(
  "MealSourceContext and MealPhotoCaptureMethod each still have exactly one canonical definition in @haocu/shared, re-exported (not redefined) by Mobile",
  /export type MealSourceContext =\s*\|\s*"dine_in"\s*\|\s*"takeout"\s*\|\s*"delivery"\s*\|\s*"self_cooked"\s*\|\s*"unknown";/.test(sharedContractTypes) &&
    /import type \{ MealSourceContext \} from "@haocu\/shared";/.test(mealIdentificationTypes) &&
    /export type MealPhotoCaptureMethod = "camera" \| "photo_library";/.test(sharedContractTypes) &&
    /import type \{ MealPhotoCaptureMethod \} from "@haocu\/shared";/.test(analysisTypes)
);
record(
  "shared request contract still has no userId field and still forbids training-eligibility/restaurant-commercial/public-URL fields",
  !/userId\s*:/.test(sharedContractTypes.split("MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS")[0]) &&
    ["userId", "trainingEligible", "trainingConsent", "allowTraining", "canTrain", "restaurantCommercialPermission", "providerModel", "imageUrl", "publicImageUrl"].every(
      (field) => sharedContractTypes.includes(`"${field}"`)
    )
);
record(
  "response type still always requires user confirmation; candidates remain documented as AI observation only",
  /requiresUserConfirmation:\s*true;/.test(sharedContractTypes) &&
    /AI visual observation only/.test(sharedContractTypes) &&
    !/verifiedName|verifiedNutrition/.test(sharedContractTypes)
);
record(
  "restaurant commercial licensing remains a separate purpose label only, never merged into the AI analysis request contract",
  /export type MealPhotoAssetPurpose = "diary_storage" \| "ai_training_and_improvement" \| "restaurant_commercial_use";/.test(sharedContractTypes) &&
    !/restaurantCommercial/i.test(sharedContractTypes.split("MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS")[1] ?? sharedContractTypes.split("MealPhotoAnalysisRequestV1")[1])
);
record(
  "all three migrations remain additive only, and meal_analyses.analysis_request_id keeps its legacy-compatible partial unique index",
  [analysesMigration, correctionsMigration, storageMigration].every((sql) => !/drop table|drop column|alter column .* type|truncate/i.test(sql)) &&
    /create unique index meal_analyses_analysis_request_id_key\s+on meal_analyses \(analysis_request_id\)\s+where analysis_request_id is not null/.test(analysesMigration)
);

// ==== MI-E-C2-R1: service-role table grant migration checks ====

const grantCode = stripSqlComments(grantMigration);
const grantStatements = grantCode.match(/grant\s+[^;]+;/gi) ?? [];
record(
  "the grant migration contains grant statements, and every one targets only meal_analyses or meal_corrections",
  grantStatements.length > 0 &&
    grantStatements.every((stmt) => /on table public\.(meal_analyses|meal_corrections)\b/i.test(stmt))
);
record(
  "every grant statement's recipient is service_role only",
  grantStatements.length > 0 && grantStatements.every((stmt) => /to service_role\s*;/i.test(stmt))
);
record(
  "no grant statement targets anon",
  !/to\s+anon\b/i.test(grantCode)
);
record(
  "no grant statement gives authenticated a new direct write privilege (insert/update/delete)",
  !/grant[^;]*\b(insert|update|delete)\b[^;]*to\s+authenticated\s*;/i.test(grantCode)
);
record(
  "the migration does not use GRANT ALL ON ALL TABLES",
  !/grant\s+all\s+on\s+all\s+tables/i.test(grantCode)
);
record(
  "the migration does not use ALTER DEFAULT PRIVILEGES (no schema-wide default-privilege change)",
  !/alter\s+default\s+privileges/i.test(grantCode)
);
record(
  "the migration does not disable, force, or otherwise alter row level security on any table",
  !/disable\s+row\s+level\s+security|force\s+row\s+level\s+security|enable\s+row\s+level\s+security/i.test(grantCode)
);
record(
  "the migration is additive only (no drop/truncate/revoke of the existing authenticated SELECT grant)",
  !/drop table|drop column|truncate/i.test(grantMigration) &&
    !/revoke[^;]*select[^;]*from\s+authenticated/i.test(grantCode)
);

const failed = checks.filter((c) => !c.pass);
console.log(`RESULT ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
