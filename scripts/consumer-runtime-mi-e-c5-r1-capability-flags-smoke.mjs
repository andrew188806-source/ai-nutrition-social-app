#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const moduleCache = new Map();
let canonicalMealFlags;
let capturedAuthClientFlags = null;
let capturedProfileFlags = null;
let capturedMealWriteFlags = null;
let storageUploadCalls = 0;

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push({ name, pass: true });
}

function loadTsModule(file, special = {}) {
  const absolute = path.resolve(root, file);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute);
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolute, module.exports);
  const localRequire = (request) => {
    if (request in special) return special[request];
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.(?:js|tsx?)$/, "");
    const resolved = fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
    return loadTsModule(path.relative(root, resolved), special);
  };
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute });
  wrapper(localRequire, module, module.exports);
  moduleCache.set(absolute, module.exports);
  return module.exports;
}

const shared = {
  buildMealPhotoAnalysisObjectPath(userId, requestId, extension) {
    return `${userId}/${requestId}.${extension}`;
  },
  detectImageSignature() {
    return { mimeType: "image/jpeg", extension: "jpg" };
  },
  buildMealPhotoAnalysisResponseV1(value) {
    return value;
  },
  MEAL_PHOTO_ANALYSIS_ERROR_CODES: [],
  MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION: "meal-photo-analysis-v1",
  validateMealPhotoAnalysisRequestV1(value) {
    return { ok: true, value };
  },
  validateMealPhotoAnalysisResponseV1(value) {
    return { ok: true, value };
  }
};

const nativeFileBodySource = {
  expoFileSystemMealPhotoFileBodySource: {
    async readFileAsBytes() {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
      return { bytes, byteSize: bytes.byteLength };
    }
  }
};

const photoSpecial = {
  "@haocu/shared": shared,
  "./nativeFileBodySource": nativeFileBodySource
};
const uploadFlags = loadTsModule("apps/mobile/features/meal-photo-upload/featureFlags.ts", photoSpecial);
const uploadFactories = loadTsModule("apps/mobile/features/meal-photo-upload/factories.ts", photoSpecial);
const analysisFlags = loadTsModule("apps/mobile/features/meal-photo-analysis/featureFlags.ts", photoSpecial);
const analysisFactories = loadTsModule("apps/mobile/features/meal-photo-analysis/factories.ts", photoSpecial);

const fakeClient = {
  auth: {},
  storage: {
    from() {
      return {
        async upload() {
          storageUploadCalls += 1;
          return { data: { path: "controlled" }, error: null };
        },
        async remove() {
          return { data: [], error: null };
        },
        async list() {
          return { data: [], error: null };
        }
      };
    }
  },
  functions: {
    async invoke() {
      return { data: {}, error: null };
    }
  }
};

class MemoryStorage {
  async getItem() { return null; }
  async setItem() {}
  async removeItem() {}
}

class FakeSupabaseConsumerClientFactory {
  constructor(options) {
    capturedAuthClientFlags = options.flags;
  }
  getOrCreateClient() {
    return { client: fakeClient, options: {} };
  }
}

class FakeSupabaseConsumerAuthAdapter {
  source = "supabase-live";
  async getCurrentSession() {
    return { ok: true, value: { user: { userId: "actor-r1", email: null } } };
  }
  observeAuthState() { return () => undefined; }
  async restoreSession() { return { ok: true, value: null }; }
  async signIn() { return { ok: true, value: null }; }
  async signOut() { return { ok: true, value: undefined }; }
  async refreshSession() { return { ok: true, value: null }; }
}

class NoopLifecycle {
  initialize() {}
  dispose() {}
}

const authExports = {
  ConsumerAuthRefreshLifecycle: NoopLifecycle,
  ConsumerAuthStateStore: class {},
  ConsumerProfileService: class {},
  SupabaseConsumerAuthAdapter: FakeSupabaseConsumerAuthAdapter,
  SupabaseConsumerClientFactory: FakeSupabaseConsumerClientFactory,
  createAsyncStorageConsumerAuthStorage() { return new MemoryStorage(); },
  createConsumerAuthScaffold(options) {
    capturedProfileFlags = options.flags;
    return {
      authPort: options.authPort ?? new FakeSupabaseConsumerAuthAdapter(),
      profileService: { async getCurrentProfile() { return { ok: false, error: { code: "profile_not_found" } }; } }
    };
  },
  createOfficialSupabaseConsumerSdkLoader() { return () => fakeClient; },
  createReactNativeConsumerAppStateSource() { return {}; },
  getConsumerRuntimeFlags() { throw new Error("explicit flags are required by this smoke"); },
  getSupabaseConsumerEnvironment() { return { url: "https://development.invalid", publishableKey: "public-test-key" }; },
  MemoryConsumerAuthStorage: MemoryStorage
};

const plannedService = {
  async create() { throw new Error("not used"); },
  async update() { throw new Error("not used"); },
  async cancel() { throw new Error("not used"); },
  async convert() { throw new Error("not used"); }
};

const consumerMealFactories = {
  createConsumerMealRecordWriteService(flags) {
    capturedMealWriteFlags = flags;
    return {};
  },
  createConsumerPlannedMealV2Service() {
    return plannedService;
  },
  createConsumerPlannedMealsService() {
    return {
      source: "disabled",
      async getCurrentUserPlannedMeals({ plannedDate }) {
        return { status: "disabled", plannedDate, meals: [] };
      }
    };
  },
  createConsumerTodayIntakeOverviewService() {
    return {};
  }
};

class FakeConsumerPlannedMealsService {
  constructor(options) {
    this.repository = options.repository;
  }
  getCurrentUserPlannedMeals(input) {
    return this.repository.getCurrentUserPlannedMeals(input);
  }
}

const special = {
  ...photoSpecial,
  "../consumer-auth": authExports,
  "../consumer-meals/featureFlags": {
    getConsumerMealRuntimeFlags() {
      return canonicalMealFlags;
    }
  },
  "../meal-identification-finalization/featureFlags": {
    getConsumerMealIdentificationFinalizationRuntimeFlags() {
      return { source: "disabled", issues: [] };
    }
  },
  "../meal-photo-upload/factories": uploadFactories,
  "../meal-photo-upload/featureFlags": uploadFlags,
  "../meal-photo-analysis/factories": analysisFactories,
  "../meal-photo-analysis/featureFlags": analysisFlags,
  "../consumer-meals/factories": consumerMealFactories,
  "../consumer-meals/consumerPlannedMealsService": {
    ConsumerPlannedMealsService: FakeConsumerPlannedMealsService
  },
  "../meal-identification-finalization/factories": {
    createConsumerMealIdentificationFinalizationRepository() {
      return {};
    }
  },
  "../meal-identification-finalization/consumerMealIdentificationFinalizationService": {
    ConsumerMealIdentificationFinalizationService: class {}
  },
  "./consumerMealWriteOperationStore": { ConsumerMealWriteOperationStore: class {} },
  "./consumerMealWriteRuntime": { ConsumerMealWriteRuntime: class {} },
  "./consumerMealIdentificationFinalizationOperationStore": {
    ConsumerMealIdentificationFinalizationOperationStore: class {}
  },
  "./consumerMealIdentificationFinalizationRuntime": {
    ConsumerMealIdentificationFinalizationRuntime: class {}
  },
  "./consumerPlannedMealOperationStore": { ConsumerPlannedMealOperationStore: class {} },
  "./consumerPlannedMealRuntime": { ConsumerPlannedMealRuntime: class {} }
};

const runtime = loadTsModule(
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  special
);
const phase1dIssue = "Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D.";

function canonicalFlags(overrides = {}) {
  return {
    authSource: "supabase-live",
    profileSource: "supabase-live",
    supabaseAuthEnabled: true,
    supabaseWritesEnabled: true,
    issues: [phase1dIssue],
    ...overrides
  };
}

function setMealFlags(writesEnabled) {
  canonicalMealFlags = {
    authSource: "supabase-live",
    mealRecordsSource: "supabase-disabled",
    dailyNutritionSource: "supabase-disabled",
    plannedMealsSource: "supabase-disabled",
    supabaseAuthEnabled: true,
    supabaseWritesEnabled: writesEnabled,
    mealRecordWritesEnabled: writesEnabled,
    mealRecordLiveWriteOptIn: false,
    dailyNutritionLiveReadOptIn: false,
    dailyNutritionWriteSource: "disabled",
    plannedMealsWriteSource: "disabled",
    issues: []
  };
}

const injected = {
  mealIdentificationFinalizationRuntime: {},
  plannedMealRuntime: {},
  plannedMealService: plannedService,
  overviewService: {}
};

function setPhotoSources(uploadSource, analysisSource) {
  process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT = "development";
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE = uploadSource;
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE = analysisSource;
}

try {
  // Scenario A: live Auth/profile plus global writes selects both real photo repositories.
  setMealFlags(true);
  setPhotoSources("supabase-live", "supabase-live");
  const original = canonicalFlags();
  const originalSnapshot = JSON.stringify(original);
  const live = runtime.createConsumerRuntimeComposition({ flags: original, ...injected });
  expect(live.ok, "Scenario A: legal live capability composition succeeds");
  expect(live.ok && live.value.mealPhotoUploadService.source === "supabase-live", "Scenario A: upload repository is live");
  expect(live.ok && live.value.mealPhotoAnalysisService.source === "supabase-live", "Scenario A: analysis repository is live");

  // Scenario C: auth-only normalization remains safe and cannot rewrite capability authority.
  expect(JSON.stringify(original) === originalSnapshot, "Scenario C: canonical input flags remain immutable");
  expect(live.ok && live.value.flags.supabaseWritesEnabled === true, "Scenario C: composition preserves writes-enabled capability flags");
  expect(live.ok && live.value.flags.issues.length === 0, "Scenario C: only the obsolete Phase 1D issue is removed");
  expect(capturedAuthClientFlags?.supabaseWritesEnabled === false, "Scenario C: Auth client receives writes-disabled derived flags");
  expect(capturedProfileFlags?.supabaseWritesEnabled === false, "Scenario C: profile scaffold receives writes-disabled derived flags");
  expect(capturedMealWriteFlags?.supabaseWritesEnabled === true, "Scenario C: meal-write derivation retains its own writes capability");

  // Scenario E: the real upload factory is active and reaches the supplied Storage client.
  const uploaded = live.ok
    ? await live.value.mealPhotoUploadService.uploadMealPhoto({
        analysisRequestId: "11111111-1111-4111-8111-111111111111",
        localImageUri: "file:///controlled.jpg",
        captureMethod: "camera",
        candidateMimeType: "image/jpeg",
        candidateFileName: "controlled.jpg"
      })
    : null;
  expect(uploaded?.ok === true && storageUploadCalls === 1, "Scenario E: legal live composition invokes real Storage upload repository");

  // Scenario B: writes disabled keeps Auth valid but safely disables both photo capabilities.
  capturedAuthClientFlags = null;
  capturedProfileFlags = null;
  setMealFlags(false);
  const disabled = runtime.createConsumerRuntimeComposition({
    flags: canonicalFlags({ supabaseWritesEnabled: false, issues: [] }),
    ...injected
  });
  expect(disabled.ok, "Scenario B: writes-disabled Auth/profile composition remains valid");
  expect(disabled.ok && disabled.value.mealPhotoUploadService.source === "disabled", "Scenario B: upload safely disables");
  expect(disabled.ok && disabled.value.mealPhotoAnalysisService.source === "disabled", "Scenario B: analysis safely disables");
  expect(capturedAuthClientFlags?.supabaseWritesEnabled === false, "Scenario B: Auth remains writes-disabled");

  // Scenario D: source mismatches and unrelated issues still fail closed.
  const mismatch = runtime.createConsumerRuntimeComposition({
    flags: canonicalFlags({ profileSource: "mock" }),
    ...injected
  });
  expect(!mismatch.ok && mismatch.errorCode === "configuration_error", "Scenario D: live Auth/mock profile mismatch fails closed");
  const unrelatedIssue = runtime.createConsumerRuntimeComposition({
    flags: canonicalFlags({ issues: [phase1dIssue, "unexpected mixed configuration"] }),
    ...injected
  });
  expect(!unrelatedIssue.ok && unrelatedIssue.errorCode === "configuration_error", "Scenario D: unrelated configuration issue is not normalized away");

  console.log(JSON.stringify({
    phase: "MI-E-C5-R1 Consumer Runtime Capability Flag Isolation Smoke",
    status: "passed",
    totalChecks: checks.length,
    passed: checks.length,
    failed: 0,
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    phase: "MI-E-C5-R1 Consumer Runtime Capability Flag Isolation Smoke",
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
    passed: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false
  }, null, 2));
  process.exitCode = 1;
}
