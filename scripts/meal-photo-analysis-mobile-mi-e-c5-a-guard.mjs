#!/usr/bin/env node
// MI-E-C5-A static guard: mechanical, regex/structural assertions over the Mobile
// meal-photo-analysis feature (Edge Function invocation from the client side). Companion to
// meal-photo-analysis-mobile-mi-e-c5-a-smoke.mjs (behavioral).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const results = [];

function record(name, pass) {
  results.push({ name, pass: Boolean(pass) });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function stripTsComments(source) {
  return source
    .split("\n")
    .map((line) => {
      const index = line.indexOf("//");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

const featureRoot = "apps/mobile/features/meal-photo-analysis";
const paths = {
  types: `${featureRoot}/types.ts`,
  ports: `${featureRoot}/ports.ts`,
  service: `${featureRoot}/mealPhotoAnalysisService.ts`,
  featureFlags: `${featureRoot}/featureFlags.ts`,
  factories: `${featureRoot}/factories.ts`,
  contracts: `${featureRoot}/supabaseMealPhotoAnalysisContracts.ts`,
  disabledAdapter: `${featureRoot}/adapters/disabledMealPhotoAnalysisRepository.ts`,
  mockAdapter: `${featureRoot}/adapters/mockMealPhotoAnalysisRepository.ts`,
  supabaseAdapter: `${featureRoot}/adapters/supabaseMealPhotoAnalysisRepository.ts`,
  hook: "apps/mobile/features/analysis/useMealPhotoAnalysis.ts",
  sessionStore: "apps/mobile/features/analysis/analysisSessionStore.ts",
  staleGuard: "apps/mobile/features/analysis/mealPhotoUploadStaleGuard.ts",
  composition: "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  provider: "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  analysisScreen: "apps/mobile/app/analysis.tsx",
  zhTW: "lib/i18n/zh-TW.ts"
};

const allFeatureSources = [
  paths.types,
  paths.ports,
  paths.service,
  paths.featureFlags,
  paths.factories,
  paths.contracts,
  paths.disabledAdapter,
  paths.mockAdapter,
  paths.supabaseAdapter,
  paths.hook
]
  .map(read)
  .join("\n\n");
const allFeatureSourcesNoComments = stripTsComments(allFeatureSources);

const envExampleSrc = read(".env.example");
const typesSrc = read(paths.types);
const supabaseAdapterSrc = read(paths.supabaseAdapter);
const supabaseAdapterSrcNoComments = stripTsComments(supabaseAdapterSrc);
const mockAdapterSrc = read(paths.mockAdapter);
const featureFlagsSrc = read(paths.featureFlags);
const hookSrc = read(paths.hook);
const sessionStoreSrc = read(paths.sessionStore);
const analysisScreenSrc = read(paths.analysisScreen);
const zhTWSrc = read(paths.zhTW);

// 1. Mobile only ever invokes meal-photo-analysis
record(
  "the client only ever invokes the meal-photo-analysis Function name, and no other Mobile file invokes any other Function",
  read(paths.contracts).includes('MEAL_PHOTO_ANALYSIS_FUNCTION_NAME = "meal-photo-analysis" as const') &&
    supabaseAdapterSrc.includes("MEAL_PHOTO_ANALYSIS_FUNCTION_NAME") &&
    (() => {
      try {
        const grep = git(["grep", "--untracked", "-oE", "\\.functions\\.invoke\\(\\s*[\"'][a-zA-Z0-9_-]+[\"']", "--", "apps/mobile"]);
        const invoked = new Set(
          grep
            .split("\n")
            .filter(Boolean)
            .map((line) => line.match(/functions\.invoke\(\s*["']([a-zA-Z0-9_-]+)["']/)?.[1])
            .filter(Boolean)
        );
        invoked.delete("meal-photo-analysis");
        return invoked.size === 0;
      } catch {
        return true;
      }
    })()
);

// 2. no direct OpenAI call from Mobile
record(
  "no Mobile file (this feature or elsewhere) calls OpenAI directly",
  !/openai|api\.openai\.com/i.test(allFeatureSourcesNoComments) &&
    (() => {
      try {
        // --untracked also matches binary assets that happen to contain the byte sequence
        // "openai" incidentally (e.g. a sprite PNG) and legitimate explanatory comments
        // disclosing that a file deliberately never calls OpenAI (e.g. "Never touches OpenAI.").
        // Only a .ts/.tsx source file with the substring surviving comment-stripping is a real hit.
        const grep = git(["grep", "--untracked", "-liE", "openai", "--", "apps/mobile"]);
        const candidateFiles = grep.split("\n").filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
        return candidateFiles.every((file) => !/openai|api\.openai\.com/i.test(stripTsComments(read(file))));
      } catch {
        return true;
      }
    })()
);

// 3. no OPENAI_API_KEY anywhere in Mobile
record(
  "OPENAI_API_KEY is never referenced anywhere under apps/mobile",
  (() => {
    try {
      const grep = git(["grep", "--untracked", "-l", "OPENAI_API_KEY", "--", "apps/mobile"]);
      return grep.trim().length === 0;
    } catch {
      return true;
    }
  })()
);

// 4. no admin/service key anywhere in Mobile
record(
  "SUPABASE_SERVICE_ROLE_KEY and MEAL_PHOTO_ANALYSIS_ADMIN_KEY are never referenced anywhere under apps/mobile",
  (() => {
    try {
      const grep = git(["grep", "--untracked", "-lE", "SUPABASE_SERVICE_ROLE_KEY|MEAL_PHOTO_ANALYSIS_ADMIN_KEY", "--", "apps/mobile"]);
      return grep.trim().length === 0;
    } catch {
      return true;
    }
  })()
);

// 5-8. MealPhotoAnalysisClientInput shape never carries forbidden fields
const clientInputBlock = typesSrc.slice(typesSrc.indexOf("export type MealPhotoAnalysisClientInput"), typesSrc.indexOf("export type MealPhotoAnalysisClientResult"));
record(
  "MealPhotoAnalysisClientInput has no userId field",
  !/\buserId\s*:/.test(clientInputBlock)
);
record(
  "MealPhotoAnalysisClientInput has no provider/model selection field",
  !/\bprovider\s*:|\bmodel\s*:/.test(clientInputBlock)
);
record(
  "MealPhotoAnalysisClientInput has no training consent/eligibility field",
  !/trainingEligible|trainingConsent|allowTraining|canTrain/i.test(clientInputBlock)
);
record(
  "MealPhotoAnalysisClientInput has no restaurant commercial permission field",
  !/restaurantCommercialPermission|restaurantCommercialGrant|commercialLicense/i.test(clientInputBlock)
);

// 9. shared request validator used, not a second copy
record(
  "the Supabase adapter uses the shared validateMealPhotoAnalysisRequestV1 (imported from @haocu/shared), never a second hand-copied validator",
  supabaseAdapterSrc.includes('from "@haocu/shared"') &&
    supabaseAdapterSrc.includes("validateMealPhotoAnalysisRequestV1") &&
    supabaseAdapterSrc.includes("validateMealPhotoAnalysisRequestV1({")
);

// 10. shared response validator used
record(
  "the Supabase adapter uses the shared validateMealPhotoAnalysisResponseV1, never a second hand-copied validator",
  supabaseAdapterSrc.includes("validateMealPhotoAnalysisResponseV1(invokeResult.data)")
);

// 11. no raw response cast
record(
  "the raw invoke() response is never cast directly into the result type — only the validator's own output is ever returned",
  !/invokeResult\.data\s+as\s+MealPhotoAnalysis/.test(supabaseAdapterSrcNoComments) &&
    supabaseAdapterSrc.includes("okAnalysis(responseValidation.value)")
);

// 12. requiresUserConfirmation forced true (enforced transitively via the shared validator, which
// the adapter never bypasses — see check 10/11)
record(
  "the client never manually constructs a success result bypassing the shared response validator",
  !/okAnalysis\(\s*\{/.test(stripTsComments(supabaseAdapterSrc + mockAdapterSrc))
);

// 13. upload must succeed before invoke
record(
  "the hook refuses to start an analysis invocation unless the current session's uploadStatus is already \"uploaded\"",
  hookSrc.includes('current.uploadStatus !== "uploaded"')
);

// 14-15. retry reuses same analysisRequestId/imageObjectRef (never generates new ones)
record(
  "startAnalysis reads analysisRequestId/imageObjectRef from the current session rather than generating new ones",
  hookSrc.includes("current.analysisRequestId") &&
    hookSrc.includes("current.imageObjectRef") &&
    !/generateMealPhotoAnalysisRequestId/.test(hookSrc)
);
record(
  "retryAnalysis is the same startAnalysis function used for the first attempt — no separate retry-specific request construction",
  hookSrc.includes("retryAnalysis: startAnalysis")
);

// 16. a new photo clears the old AI response — createDefaultSession() resets every analysis field
record(
  "createDefaultSession() resets every analysis-invocation field, so a new photo (beginAnalysisCapture) always clears prior AI results",
  ['analysisInvocationStatus: "not_started"', "analysisCandidates: []", "selectedCandidateId: null", "analysisStatus: null"].every((needle) =>
    sessionStoreSrc.includes(needle)
  )
);

// 17-18. stale capture / actor-switch results are rejected via the reused stale guard
record(
  "the hook reuses isMealPhotoUploadResultStillCurrent (imported, not reimplemented) as its stale-result/actor-switch guard",
  hookSrc.includes('from "./mealPhotoUploadStaleGuard"') &&
    hookSrc.includes("isMealPhotoUploadResultStillCurrent") &&
    !/export function isMealPhotoUploadResultStillCurrent/.test(hookSrc) &&
    hookSrc.includes("if (!stillCurrent()) return;")
);

// 19. local preview retained after analysis failure
record(
  "the analysis hook never clears capturedImageUri on a failed invocation — local preview is preserved",
  !/capturedImageUri:\s*null/.test(hookSrc) && !/capturedImageUri\s*=\s*null/.test(hookSrc)
);

// 20. real (supabase-live) mode never shows demo/mock nutrition — the mock repository can only be
// constructed when analysisSource === "mock"
record(
  "MockMealPhotoAnalysisRepository is only constructible via the factory's mock branch, gated on flags.analysisSource === \"mock\"",
  read(paths.factories).includes('flags.analysisSource === "mock"') &&
    read(paths.factories).includes("new MockMealPhotoAnalysisRepository(")
);

// 21. mock mode is explicitly labeled as demo, both in data and in UI
record(
  "the mock adapter's own candidate data is unmistakably labeled as demo (never indistinguishable from a real candidate)",
  /示範/.test(mockAdapterSrc) && mockAdapterSrc.includes('analysisEngineVersion: "mock-demo-v1"')
);
record(
  "the analysis screen shows an explicit mock badge whenever the runtime mode is mock",
  analysisScreenSrc.includes('consumerRuntimeMode === "mock"') && zhTWSrc.includes("mockBadge:")
);

// 22. disabled is the default source
record(
  "the analysis source defaults to \"disabled\" when the env var is unset",
  /function parseAnalysisSource[\s\S]{0,120}if \(!value\) return "disabled";/.test(featureFlagsSrc)
);

// 23-25. no meal record / correction / finalization RPC writes from this feature
record(
  "this feature never writes a meal record",
  !/from\(\s*["']meal_records["']\s*\)|createMealRecord\(/.test(allFeatureSourcesNoComments)
);
record(
  "this feature never writes a meal correction",
  !/from\(\s*["']meal_corrections["']\s*\)/.test(allFeatureSourcesNoComments)
);
record(
  "this feature never calls the finalization RPC",
  !/finalize_current_user_meal_identification_v1|finalizeMealIdentification\(/.test(allFeatureSourcesNoComments)
);

// 26. no restaurant/menu auto-resolution
record(
  "this feature never calls the restaurant/menu catalog resolver",
  !/resolveCatalogMealCandidates|restaurant_catalog|menu_items/i.test(allFeatureSourcesNoComments)
);

// 27. no verified-nutrition claim; the UI always discloses estimate/unconfirmed status
record(
  "no verified-nutrition claim exists in this feature's code or new UI copy, and the disclaimers are present",
  !/verified nutrition|verifiedNutrition|已驗證的營養/i.test(allFeatureSourcesNoComments + zhTWSrc) &&
    zhTWSrc.includes("disclaimerEstimate:") &&
    zhTWSrc.includes("disclaimerNutrition:") &&
    zhTWSrc.includes("disclaimerAction:")
);

// 28. no model training
record(
  "no training-dataset or model-artifact reference exists in this feature",
  !/trainingEligible|trainingConsent|training-dataset|model-artifact|dataset-export/i.test(allFeatureSourcesNoComments)
);

// 29. existing C1/C3/C4 guards still pass in full
record(
  "the MI-E-C1, MI-E-C3, and MI-E-C4 guards all still pass in full",
  (() => {
    const runGuard = (scriptPath) => {
      try {
        return execFileSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      } catch (err) {
        if (typeof err.stdout === "string") return err.stdout;
        throw err;
      }
    };
    const fullPass = (output) => {
      const match = output.match(/RESULT (\d+)\/(\d+) PASS/);
      return Boolean(match) && match[1] === match[2];
    };
    try {
      return (
        fullPass(runGuard("scripts/meal-photo-analysis-mi-e-c1-guard.mjs")) &&
        fullPass(runGuard("scripts/meal-photo-upload-mi-e-c3-guard.mjs")) &&
        fullPass(runGuard("scripts/meal-photo-analysis-edge-function-mi-e-c4-guard.mjs"))
      );
    } catch {
      return false;
    }
  })()
);

// 30. deferred migration absent from active queue
record(
  "the deferred P2V-PERF migration is not present in the active supabase/migrations/ queue",
  !fs.readdirSync(path.join(root, "supabase", "migrations")).some((name) => name.includes("20260722010000"))
);

// 31. MI-E-C5-A-R1: env var present in .env.example
record(
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE is present in .env.example",
  /^EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE=/m.test(envExampleSrc)
);

// 32. MI-E-C5-A-R1: its .env.example default value is exactly "disabled"
record(
  "the .env.example default value for EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE is exactly \"disabled\"",
  /^EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE=disabled$/m.test(envExampleSrc)
);

// 33. MI-E-C5-A-R1: no live-by-default — exactly one declaration, never mock/supabase-live
record(
  "no line in .env.example sets EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE to mock or supabase-live, and it is declared exactly once",
  !/^EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE=(mock|supabase-live)/m.test(envExampleSrc) &&
    (envExampleSrc.match(/EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE=/g) || []).length === 1
);

// 34. MI-E-C5-A Post-Freeze Guard Correction: pure current-content check for a smuggled secret
// VALUE in .env.example. Deliberately reads only the committed file content via envExampleSrc
// (fs.readFileSync) — never git diff/--cached/HEAD/dirty-working-tree state — so the result is
// identical on a dirty pre-commit candidate, a clean post-commit worktree, and any future clean
// checkout. The original version of this check compared `git diff -- .env.example`, which is
// naturally empty on a clean checkout and produced a false negative right after this feature's own
// freeze commit; it never indicated a real content defect.
// OPENAI_API_KEY is a legitimate pre-existing empty template placeholder elsewhere in this file
// (used by unrelated features) — this checks its VALUE is empty, not its absence.
// SUPABASE_SERVICE_ROLE_KEY is likewise checked for an empty-or-absent value.
// MEAL_PHOTO_ANALYSIS_ADMIN_KEY and MI_E_C5_A_TEST_ADMIN_KEY have no legitimate reason to appear in
// a committed template file at all, so those two must be absent entirely, not merely empty.
record(
  ".env.example never carries a real secret value for OPENAI_API_KEY or SUPABASE_SERVICE_ROLE_KEY (empty-or-absent only), and never references MEAL_PHOTO_ANALYSIS_ADMIN_KEY or MI_E_C5_A_TEST_ADMIN_KEY at all",
  (() => {
    function declaredValue(varName) {
      const match = envExampleSrc.match(new RegExp(`^${varName}=(.*)$`, "m"));
      return match ? match[1] : undefined;
    }
    function emptyOrAbsent(value) {
      return value === undefined || value.trim() === "";
    }
    const openaiEmptyOrAbsent = emptyOrAbsent(declaredValue("OPENAI_API_KEY"));
    const serviceRoleEmptyOrAbsent = emptyOrAbsent(declaredValue("SUPABASE_SERVICE_ROLE_KEY"));
    const adminKeyAbsent = !/^MEAL_PHOTO_ANALYSIS_ADMIN_KEY=/m.test(envExampleSrc);
    const testAdminKeyAbsent = !/^MI_E_C5_A_TEST_ADMIN_KEY=/m.test(envExampleSrc);
    return openaiEmptyOrAbsent && serviceRoleEmptyOrAbsent && adminKeyAbsent && testAdminKeyAbsent;
  })()
);

// 35. MI-E-C5-A-R1: .env.example never references any admin/service/test-harness secret name
record(
  ".env.example never references MEAL_PHOTO_ANALYSIS_ADMIN_KEY, MI_E_C5_A_TEST_ADMIN_KEY, or SUPABASE_SERVICE_ROLE_KEY",
  !/MEAL_PHOTO_ANALYSIS_ADMIN_KEY|MI_E_C5_A_TEST_ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(envExampleSrc)
);

// 36. MI-E-C5-A-R1: permanent exact-file-count check for the feature directory (corrects the prior
// report's miscount of 9 — the directory has always contained exactly 10 files: types, ports,
// contracts, service, featureFlags, factories, index, and 3 adapters).
record(
  "apps/mobile/features/meal-photo-analysis/ contains exactly 10 files",
  (() => {
    function walk(dir) {
      let files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files = files.concat(walk(full));
        else files.push(full);
      }
      return files;
    }
    return walk(path.join(root, featureRoot)).length === 10;
  })()
);

const passCount = results.filter((r) => r.pass).length;
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} — ${result.name}`);
}
console.log(`RESULT ${passCount}/${results.length} PASS`);
if (passCount !== results.length) process.exit(1);
