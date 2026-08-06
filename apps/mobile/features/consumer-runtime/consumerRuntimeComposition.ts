import {
  ConsumerAuthRefreshLifecycle,
  ConsumerAuthStateStore,
  ConsumerProfileService,
  SupabaseConsumerAuthAdapter,
  SupabaseConsumerClientFactory,
  createAsyncStorageConsumerAuthStorage,
  createConsumerAuthScaffold,
  createOfficialSupabaseConsumerSdkLoader,
  createReactNativeConsumerAppStateSource,
  deriveLiveSupabaseClientFlags,
  getConsumerRuntimeFlags,
  getSupabaseConsumerEnvironment,
  withoutObsoleteConsumerWritesIssue,
  type ConsumerAuthError,
  type ConsumerAuthPort,
  type ConsumerAuthState,
  type ConsumerProfile,
  type ConsumerRuntimeFlags,
  MemoryConsumerAuthStorage,
  type ConsumerAuthStorage,
  type SupabaseConsumerProfileClientLike
} from "../consumer-auth";
import { getConsumerMealRuntimeFlags } from "../consumer-meals/featureFlags";
import type { ConsumerMealRuntimeFlags } from "../consumer-meals/types";
import type { ConsumerPlannedMeal, ConsumerPlannedMealsReadResult } from "../consumer-meals/types";
import type { ConsumerTodayIntakeOverviewService } from "../consumer-meals/consumerTodayIntakeOverviewService";
import type { ConsumerPlannedMealV2Service } from "../consumer-meals/consumerPlannedMealV2Service";
import type { SupabaseConsumerMealClientLike } from "../consumer-meals/supabaseMealContracts";
import { getConsumerMealIdentificationFinalizationRuntimeFlags } from "../meal-identification-finalization/featureFlags";
import type { ConsumerMealIdentificationFinalizationRuntimeFlags } from "../meal-identification-finalization/types";
import type { SupabaseConsumerMealIdentificationFinalizationClientLike } from "../meal-identification-finalization/supabaseMealIdentificationFinalizationContracts";
import { createMealPhotoUploadService } from "../meal-photo-upload/factories";
import { getMealPhotoUploadRuntimeFlags, type MealPhotoUploadRuntimeFlags } from "../meal-photo-upload/featureFlags";
import type { MealPhotoUploadService } from "../meal-photo-upload/mealPhotoUploadService";
import type { SupabaseMealPhotoStorageClientLike } from "../meal-photo-upload/supabaseMealPhotoStorageContracts";
import { createMealPhotoAnalysisService } from "../meal-photo-analysis/factories";
import { getMealPhotoAnalysisRuntimeFlags, type MealPhotoAnalysisRuntimeFlags } from "../meal-photo-analysis/featureFlags";
import type { MealPhotoAnalysisService } from "../meal-photo-analysis/mealPhotoAnalysisService";
import type { SupabaseMealPhotoAnalysisClientLike } from "../meal-photo-analysis/supabaseMealPhotoAnalysisContracts";
import { ConsumerMealWriteOperationStore } from "./consumerMealWriteOperationStore";
import { ConsumerMealWriteRuntime } from "./consumerMealWriteRuntime";
import { ConsumerMealIdentificationFinalizationOperationStore } from "./consumerMealIdentificationFinalizationOperationStore";
import { ConsumerMealIdentificationFinalizationRuntime } from "./consumerMealIdentificationFinalizationRuntime";
import { ConsumerPlannedMealOperationStore } from "./consumerPlannedMealOperationStore";
import { ConsumerPlannedMealRuntime } from "./consumerPlannedMealRuntime";

export type ConsumerRuntimeMode = "mock" | "disabled" | "supabase";
export type ConsumerRuntimeOperation = "idle" | "signingIn" | "signingOut";
export type ConsumerRuntimeErrorCode =
  | "account_disabled"
  | "authentication_failed"
  | "configuration_error"
  | "operation_not_enabled"
  | "profile_failed"
  | "profile_not_found";

export type ConsumerRuntimeProfileState =
  | { status: "idle"; profile: null; errorCode: null }
  | { status: "loading"; profile: null; errorCode: null }
  | { status: "available"; profile: ConsumerProfile; errorCode: null }
  | { status: "notFound"; profile: null; errorCode: "profile_not_found" }
  | { status: "error"; profile: null; errorCode: "profile_failed" };

export type ConsumerRuntimeState = {
  authState: ConsumerAuthState;
  operation: ConsumerRuntimeOperation;
  actorKey: string | null;
  actorGeneration: number;
  profileState: ConsumerRuntimeProfileState;
  errorCode: ConsumerRuntimeErrorCode | null;
};

export type ConsumerRuntimeListener = (state: ConsumerRuntimeState) => void;

export type ConsumerRuntimeControllerOptions = {
  authPort: ConsumerAuthPort;
  profileService: Pick<ConsumerProfileService, "getCurrentProfile">;
  refreshLifecycle?: Pick<ConsumerAuthRefreshLifecycle, "initialize" | "dispose"> | null;
};

export class ConsumerAuthProfileRuntime {
  private readonly authStore: ConsumerAuthStateStore;
  private readonly listeners = new Set<ConsumerRuntimeListener>();
  private readonly profileService: ConsumerRuntimeControllerOptions["profileService"];
  private readonly refreshLifecycle: ConsumerRuntimeControllerOptions["refreshLifecycle"];
  private authStoreUnsubscribe: (() => void) | null = null;
  private restorePromise: Promise<void> | null = null;
  private restoring = true;
  private started = false;
  private state: ConsumerRuntimeState = {
    authState: { status: "initializing", session: null },
    operation: "idle",
    actorKey: null,
    actorGeneration: 0,
    profileState: idleProfileState(),
    errorCode: null
  };

  constructor(private readonly options: ConsumerRuntimeControllerOptions) {
    this.authStore = new ConsumerAuthStateStore(options.authPort);
    this.profileService = options.profileService;
    this.refreshLifecycle = options.refreshLifecycle;
  }

  get mode(): ConsumerRuntimeMode {
    if (this.options.authPort.source === "mock") return "mock";
    if (this.options.authPort.source === "supabase-live") return "supabase";
    return "disabled";
  }

  getState() {
    return this.state;
  }

  subscribe(listener: ConsumerRuntimeListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.started) return this.restorePromise ?? Promise.resolve();
    this.started = true;
    this.authStoreUnsubscribe = this.authStore.subscribe((state) => this.handleAuthState(state));
    this.authStore.start();
    this.refreshLifecycle?.initialize();

    if (!this.restorePromise) {
      this.restorePromise = this.authStore.restore().then(() => undefined).finally(() => {
        this.restoring = false;
        this.handleAuthState(this.authStore.getState());
      });
    } else if (!this.restoring) {
      this.handleAuthState(this.authStore.getState());
    }
    return this.restorePromise;
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.authStoreUnsubscribe?.();
    this.authStoreUnsubscribe = null;
    this.authStore.stop();
    this.refreshLifecycle?.dispose();
  }

  async signIn(email: string, password: string) {
    if (this.state.operation !== "idle") return false;
    this.update({ operation: "signingIn", errorCode: null });
    const result = await this.authStore.signIn({ email: email.trim(), password });
    if (result.ok) {
      this.handleAuthState({ status: "signedIn", session: result.value });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async signInDemo() {
    if (this.mode !== "mock" || this.state.operation !== "idle") return false;
    this.update({ operation: "signingIn", errorCode: null });
    const result = await this.authStore.signIn({ mockUserId: "current-user" });
    if (result.ok) {
      this.handleAuthState({ status: "signedIn", session: result.value });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async signOut() {
    if (this.state.operation !== "idle") return false;
    this.update({ operation: "signingOut", errorCode: null });
    const result = await this.authStore.signOut();
    if (result.ok) {
      this.handleAuthState({ status: "signedOut", session: null });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async retryProfile() {
    if (!this.state.actorKey || this.state.authState.status !== "signedIn") return false;
    await this.loadProfile(this.state.actorKey, this.state.actorGeneration);
    return this.state.profileState.status === "available";
  }

  private handleAuthState(next: ConsumerAuthState) {
    if (this.restoring && next.status === "signedOut") {
      this.update({ authState: { status: "initializing", session: null } });
      return;
    }

    if (next.status === "signedIn" && next.session) {
      const actorKey = next.session.user.userId;
      if (actorKey !== this.state.actorKey) {
        const actorGeneration = this.state.actorGeneration + 1;
        this.state = {
          ...this.state,
          authState: next,
          actorKey,
          actorGeneration,
          profileState: loadingProfileState(),
          errorCode: null
        };
        this.emit();
        void this.loadProfile(actorKey, actorGeneration);
        return;
      }
      this.update({ authState: next, errorCode: null });
      return;
    }

    if (next.status === "signedOut") {
      this.clearActor(next, null);
      return;
    }
    if (next.status === "disabled") {
      this.clearActor(next, "account_disabled");
      return;
    }
    if (next.status === "error") {
      if (this.state.operation === "signingOut" && this.state.actorKey && this.state.authState.status === "signedIn") {
        this.update({ errorCode: mapAuthError(next.error) });
        return;
      }
      this.clearActor(next, mapAuthError(next.error));
      return;
    }
    this.update({ authState: next });
  }

  private clearActor(authState: ConsumerAuthState, errorCode: ConsumerRuntimeErrorCode | null) {
    const changed = this.state.actorKey !== null || this.state.profileState.status !== "idle";
    this.state = {
      ...this.state,
      authState,
      actorKey: null,
      actorGeneration: changed ? this.state.actorGeneration + 1 : this.state.actorGeneration,
      profileState: idleProfileState(),
      errorCode
    };
    this.emit();
  }

  private async loadProfile(actorKey: string, generation: number) {
    if (actorKey !== this.state.actorKey || generation !== this.state.actorGeneration) return;
    this.update({ profileState: loadingProfileState() });
    const result = await this.profileService.getCurrentProfile();
    if (actorKey !== this.state.actorKey || generation !== this.state.actorGeneration) return;

    if (result.ok) {
      this.update({ profileState: { status: "available", profile: result.value, errorCode: null }, errorCode: null });
      return;
    }
    if (result.error.code === "account_disabled") {
      this.clearActor({ status: "disabled", session: this.state.authState.session, error: result.error }, "account_disabled");
      return;
    }
    if (result.error.code === "profile_not_found") {
      this.update({ profileState: { status: "notFound", profile: null, errorCode: "profile_not_found" } });
      return;
    }
    this.update({ profileState: { status: "error", profile: null, errorCode: "profile_failed" } });
  }

  private update(patch: Partial<ConsumerRuntimeState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state);
  }
}

export type ConsumerRuntimeComposition = {
  flags: ConsumerRuntimeFlags;
  controller: ConsumerAuthProfileRuntime;
  mealWriteRuntime: ConsumerMealWriteRuntime;
  mealIdentificationFinalizationRuntime: ConsumerMealIdentificationFinalizationRuntime;
  plannedMealRuntime: ConsumerPlannedMealRuntime;
  plannedMealService: Pick<ConsumerPlannedMealV2Service, "update" | "cancel">;
  mealPhotoUploadService: MealPhotoUploadService;
  mealPhotoAnalysisService: MealPhotoAnalysisService;
  getPlannedMeals(plannedDate: string): Promise<ConsumerPlannedMealsReadResult>;
  createOverviewService(timezone: string): ConsumerTodayIntakeOverviewService;
};

export type ConsumerRuntimeCompositionResult =
  | { ok: true; value: ConsumerRuntimeComposition }
  | { ok: false; errorCode: "configuration_error" };

export type ConsumerRuntimeCompositionOptions = {
  flags?: ConsumerRuntimeFlags;
  authPort?: ConsumerAuthPort;
  profileService?: Pick<ConsumerProfileService, "getCurrentProfile">;
  refreshLifecycle?: Pick<ConsumerAuthRefreshLifecycle, "initialize" | "dispose"> | null;
  mealFlags?: ConsumerMealRuntimeFlags;
  operationStorage?: ConsumerAuthStorage;
  mealWriteRuntime?: ConsumerMealWriteRuntime;
  mealIdentificationFinalizationRuntime?: ConsumerMealIdentificationFinalizationRuntime;
  plannedMealRuntime?: ConsumerPlannedMealRuntime;
  plannedMealService?: ConsumerPlannedMealV2Service;
  overviewService?: ConsumerTodayIntakeOverviewService;
};

let appComposition: ConsumerRuntimeCompositionResult | null = null;

export function getOrCreateConsumerRuntimeComposition() {
  if (!appComposition) appComposition = createConsumerRuntimeComposition();
  return appComposition;
}

export function createConsumerRuntimeComposition(options: ConsumerRuntimeCompositionOptions = {}): ConsumerRuntimeCompositionResult {
  const canonicalFlags = options.flags ?? getConsumerRuntimeFlags();
  const capabilityFlags = normalizeConsumerCapabilityFlags(canonicalFlags);
  const authFlags = deriveAuthCompositionFlags(capabilityFlags);
  if (capabilityFlags.issues.length) return { ok: false, errorCode: "configuration_error" };
  if (capabilityFlags.authSource === "supabase-live" && capabilityFlags.profileSource !== "supabase-live") {
    return { ok: false, errorCode: "configuration_error" };
  }
  if (capabilityFlags.authSource === "mock" && capabilityFlags.profileSource !== "mock") {
    return { ok: false, errorCode: "configuration_error" };
  }

  try {
    if (options.authPort && options.profileService) {
      const storage = options.operationStorage ?? new MemoryConsumerAuthStorage();
      const runtimeParts = createMealRuntimeParts({
        authFlags: capabilityFlags,
        authPort: options.authPort,
        storage,
        mealFlags: options.mealFlags,
        mealWriteRuntime: options.mealWriteRuntime,
        mealIdentificationFinalizationRuntime: options.mealIdentificationFinalizationRuntime,
        plannedMealRuntime: options.plannedMealRuntime,
        plannedMealService: options.plannedMealService,
        overviewService: options.overviewService
      });
      if (!runtimeParts) return { ok: false, errorCode: "configuration_error" };
      return {
        ok: true,
        value: {
          flags: capabilityFlags,
          controller: new ConsumerAuthProfileRuntime({
            authPort: options.authPort,
            profileService: options.profileService,
            refreshLifecycle: options.refreshLifecycle
          }),
          ...runtimeParts
        }
      };
    }

    if (capabilityFlags.authSource === "supabase-live") {
      const storage = options.operationStorage ?? createAsyncStorageConsumerAuthStorage();
      const clientFactory = new SupabaseConsumerClientFactory({
        env: getSupabaseConsumerEnvironment(),
        flags: authFlags,
        storage,
        sdkLoader: createOfficialSupabaseConsumerSdkLoader()
      });
      const { client } = clientFactory.getOrCreateClient();
      const authPort = new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true });
      const scaffold = createConsumerAuthScaffold({
        flags: authFlags,
        authPort,
        profileClient: client as unknown as SupabaseConsumerProfileClientLike
      });
      const refreshLifecycle = new ConsumerAuthRefreshLifecycle(client.auth, createReactNativeConsumerAppStateSource());
      const runtimeParts = createMealRuntimeParts({
        authFlags: capabilityFlags,
        authPort,
        storage,
        mealClient: client as unknown as SupabaseConsumerMealClientLike,
        mealFlags: options.mealFlags,
        mealWriteRuntime: options.mealWriteRuntime,
        mealIdentificationFinalizationRuntime: options.mealIdentificationFinalizationRuntime,
        plannedMealRuntime: options.plannedMealRuntime,
        plannedMealService: options.plannedMealService,
        overviewService: options.overviewService
      });
      if (!runtimeParts) return { ok: false, errorCode: "configuration_error" };
      return {
        ok: true,
        value: {
          flags: capabilityFlags,
          controller: new ConsumerAuthProfileRuntime({ authPort, profileService: scaffold.profileService, refreshLifecycle }),
          ...runtimeParts
        }
      };
    }

    const storage = options.operationStorage ?? createAsyncStorageConsumerAuthStorage();
    const scaffold = createConsumerAuthScaffold({ flags: authFlags, storage });
    const runtimeParts = createMealRuntimeParts({
      authFlags: capabilityFlags,
      authPort: scaffold.authPort,
      storage,
      mealFlags: options.mealFlags,
      mealWriteRuntime: options.mealWriteRuntime,
      plannedMealRuntime: options.plannedMealRuntime,
      plannedMealService: options.plannedMealService,
      overviewService: options.overviewService
    });
    if (!runtimeParts) return { ok: false, errorCode: "configuration_error" };
    return {
      ok: true,
      value: {
        flags: capabilityFlags,
        controller: new ConsumerAuthProfileRuntime({ authPort: scaffold.authPort, profileService: scaffold.profileService }),
        ...runtimeParts
      }
    };
  } catch {
    return { ok: false, errorCode: "configuration_error" };
  }
}

function createMealRuntimeParts(input: {
  authFlags: ConsumerRuntimeFlags;
  authPort: ConsumerAuthPort;
  storage: ConsumerAuthStorage;
  mealClient?: SupabaseConsumerMealClientLike;
  mealFlags?: ConsumerMealRuntimeFlags;
  mealWriteRuntime?: ConsumerMealWriteRuntime;
  mealIdentificationFinalizationRuntime?: ConsumerMealIdentificationFinalizationRuntime;
  plannedMealRuntime?: ConsumerPlannedMealRuntime;
  plannedMealService?: ConsumerPlannedMealV2Service;
  overviewService?: ConsumerTodayIntakeOverviewService;
}) {
  // Keep the meal factory graph behind the B2 runtime boundary. Historical B1
  // controller-only validation deliberately loads this module without a native
  // runtime, while an actual B2 composition always enters this function.
  const {
    createConsumerMealRecordWriteService,
    createConsumerPlannedMealV2Service,
    createConsumerPlannedMealsService,
    createConsumerTodayIntakeOverviewService
  } = require("../consumer-meals/factories") as typeof import("../consumer-meals/factories");
  const { ConsumerPlannedMealsService } = require("../consumer-meals/consumerPlannedMealsService") as typeof import("../consumer-meals/consumerPlannedMealsService");
  const { createConsumerMealIdentificationFinalizationRepository } =
    require("../meal-identification-finalization/factories") as typeof import("../meal-identification-finalization/factories");
  const { ConsumerMealIdentificationFinalizationService } =
    require("../meal-identification-finalization/consumerMealIdentificationFinalizationService") as typeof import("../meal-identification-finalization/consumerMealIdentificationFinalizationService");
  const rawMealFlags = input.mealFlags ?? getConsumerMealRuntimeFlags();
  if (rawMealFlags.authSource !== input.authFlags.authSource) return null;
  const writeFlags = normalizeMealWriteFlags(rawMealFlags, input.authFlags.authSource);
  const overviewFlags = normalizeOverviewFlags(rawMealFlags, input.authFlags.authSource);
  const plannedWriteFlags = normalizePlannedMealWriteFlags(rawMealFlags, input.authFlags.authSource);
  if (writeFlags.issues.length || overviewFlags.issues.length || plannedWriteFlags.issues.length) return null;
  const dependencies = { authPort: input.authPort, mealClient: input.mealClient };
  const mealWriteRuntime = input.mealWriteRuntime ?? new ConsumerMealWriteRuntime({
    service: createConsumerMealRecordWriteService(writeFlags, dependencies),
    operationStore: new ConsumerMealWriteOperationStore(input.storage)
  });
  const finalizationFlags = normalizeMealIdentificationFinalizationFlags(
    getConsumerMealIdentificationFinalizationRuntimeFlags(),
    input.authFlags.authSource
  );
  const mealIdentificationFinalizationRepository = createConsumerMealIdentificationFinalizationRepository(
    finalizationFlags,
    {
      authPort: input.authPort,
      finalizationClient: input.mealClient as unknown as SupabaseConsumerMealIdentificationFinalizationClientLike
    }
  );
  const mealIdentificationFinalizationRuntime =
    input.mealIdentificationFinalizationRuntime ??
    new ConsumerMealIdentificationFinalizationRuntime({
      service: new ConsumerMealIdentificationFinalizationService({
        authPort: input.authPort,
        repository: mealIdentificationFinalizationRepository
      }),
      operationStore: new ConsumerMealIdentificationFinalizationOperationStore(input.storage)
    });
  const basePlannedMealsService = createConsumerPlannedMealsService(overviewFlags, dependencies);
  const basePlannedMealService = input.plannedMealService ?? createConsumerPlannedMealV2Service(plannedWriteFlags, dependencies);
  const trackedRows = new Map<string, Map<string, ConsumerPlannedMeal>>();
  const currentActor = async () => {
    const session = await input.authPort.getCurrentSession();
    return session.ok ? session.value?.user.userId ?? null : null;
  };
  const remember = async (meal: ConsumerPlannedMeal, expectedActor: string | null) => {
    if (!expectedActor || await currentActor() !== expectedActor) return;
    const rows = trackedRows.get(expectedActor) ?? new Map<string, ConsumerPlannedMeal>();
    rows.set(meal.plannedMealId, meal); trackedRows.set(expectedActor, rows);
  };
  const plannedMealService: Pick<ConsumerPlannedMealV2Service, "create" | "update" | "cancel" | "convert"> = {
    create: async (value) => { const actor = await currentActor(); const result = await basePlannedMealService.create(value); if (result.ok) await remember(result.value.plannedMeal, actor); return result; },
    update: async (value) => { const actor = await currentActor(); const result = await basePlannedMealService.update(value); if (result.ok) await remember(result.value.plannedMeal, actor); return result; },
    cancel: async (value) => { const actor = await currentActor(); const result = await basePlannedMealService.cancel(value); if (result.ok) await remember(result.value.plannedMeal, actor); return result; },
    convert: async (value) => {
      const actor = await currentActor(); const result = await basePlannedMealService.convert(value);
      if (result.ok && actor && await currentActor() === actor) {
        const rows = trackedRows.get(actor); const row = rows?.get(result.value.plannedMealId);
        if (row) rows?.set(row.plannedMealId, { ...row, status: "converted", convertedMealRecordId: result.value.mealRecordId, updatedAt: result.value.convertedAt });
      }
      return result;
    }
  };
  const plannedMealsService = new ConsumerPlannedMealsService({
    clock: { now: () => new Date() },
    repository: {
      source: basePlannedMealsService.source,
      getCurrentUserPlannedMeals: async ({ plannedDate }) => {
        const actor = await currentActor();
        const result = await basePlannedMealsService.getCurrentUserPlannedMeals({ plannedDate });
        if (!actor || await currentActor() !== actor) return result;
        const tracked = [...(trackedRows.get(actor)?.values() ?? [])].filter((meal) => meal.plannedDate === plannedDate);
        const base = result.status === "available" ? result.meals : [];
        const merged = new Map(tracked.map((meal) => [meal.plannedMealId, meal])); for (const meal of base) merged.set(meal.plannedMealId, meal);
        const meals = [...merged.values()].sort((left, right) => (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "") || left.plannedMealId.localeCompare(right.plannedMealId));
        return meals.length ? { status: "available" as const, plannedDate, meals } : result;
      }
    }
  });
  const plannedMealRuntime = input.plannedMealRuntime ?? new ConsumerPlannedMealRuntime({
    service: plannedMealService,
    operationStore: new ConsumerPlannedMealOperationStore(input.storage)
  });
  const mealPhotoUploadFlags = normalizeMealPhotoUploadFlags(
    getMealPhotoUploadRuntimeFlags(input.authFlags.authSource, input.authFlags.supabaseAuthEnabled, input.authFlags.supabaseWritesEnabled),
    input.authFlags.authSource
  );
  const mealPhotoUploadService = createMealPhotoUploadService(
    input.authFlags.authSource,
    input.authFlags.supabaseAuthEnabled,
    input.authFlags.supabaseWritesEnabled,
    {
      authPort: input.authPort,
      storageClient: input.mealClient as unknown as SupabaseMealPhotoStorageClientLike | undefined
    },
    mealPhotoUploadFlags
  );
  const mealPhotoAnalysisFlags = normalizeMealPhotoAnalysisFlags(
    getMealPhotoAnalysisRuntimeFlags(
      input.authFlags.authSource,
      input.authFlags.supabaseAuthEnabled,
      input.authFlags.supabaseWritesEnabled,
      mealPhotoUploadFlags.uploadSource
    ),
    input.authFlags.authSource
  );
  const mealPhotoAnalysisService = createMealPhotoAnalysisService(
    input.authFlags.authSource,
    input.authFlags.supabaseAuthEnabled,
    input.authFlags.supabaseWritesEnabled,
    mealPhotoUploadFlags.uploadSource,
    {
      authPort: input.authPort,
      analysisClient: input.mealClient as unknown as SupabaseMealPhotoAnalysisClientLike | undefined
    },
    mealPhotoAnalysisFlags
  );
  return {
    mealWriteRuntime,
    mealIdentificationFinalizationRuntime,
    plannedMealRuntime,
    plannedMealService,
    mealPhotoUploadService,
    mealPhotoAnalysisService,
    getPlannedMeals: (plannedDate: string) => plannedMealsService.getCurrentUserPlannedMeals({ plannedDate }),
    createOverviewService: (timezone: string) => input.overviewService ?? createConsumerTodayIntakeOverviewService(
      overviewFlags,
      { ...dependencies, plannedMealsService, timezone }
    )
  };
}

function normalizeMealIdentificationFinalizationFlags(
  flags: ConsumerMealIdentificationFinalizationRuntimeFlags,
  authSource: ConsumerRuntimeFlags["authSource"]
): ConsumerMealIdentificationFinalizationRuntimeFlags {
  if (authSource === "mock") {
    return { source: "mock", issues: [] };
  }
  return flags;
}

// MI-E-C5-R7-C4-R1: both of these were private duplicates of the shared consumer-auth authority.
// They now delegate, so the Restaurant Catalog, Favorites and Ratings compositions reconcile the
// legacy Phase 1D gates through exactly the same code path this runtime uses.
//
// The two remain distinct on purpose: capability flags keep supabaseWritesEnabled TRUE (the product
// really does write), while only the CLIENT-CONSTRUCTION flags clear the factory-facing gate.
function normalizeConsumerCapabilityFlags(flags: ConsumerRuntimeFlags): ConsumerRuntimeFlags {
  return withoutObsoleteConsumerWritesIssue(flags);
}

function deriveAuthCompositionFlags(flags: ConsumerRuntimeFlags): ConsumerRuntimeFlags {
  return deriveLiveSupabaseClientFlags(flags);
}

function normalizeMealWriteFlags(flags: ConsumerMealRuntimeFlags, authSource: ConsumerRuntimeFlags["authSource"]): ConsumerMealRuntimeFlags {
  if (authSource === "mock" && flags.mealRecordsSource === "mock") {
    return { ...flags, supabaseWritesEnabled: true, mealRecordWritesEnabled: true, mealRecordLiveWriteOptIn: false, issues: [] };
  }
  return { ...flags, issues: flags.issues.filter((issue) => !isApprovedB2ReadWriteTransitionIssue(issue)) };
}

function normalizeOverviewFlags(flags: ConsumerMealRuntimeFlags, authSource: ConsumerRuntimeFlags["authSource"]): ConsumerMealRuntimeFlags {
  return {
    ...flags,
    plannedMealsSource: authSource === "mock" ? "mock" : flags.plannedMealsSource,
    supabaseWritesEnabled: false,
    mealRecordWritesEnabled: false,
    mealRecordLiveWriteOptIn: false,
    dailyNutritionWriteSource: "disabled",
    plannedMealsWriteSource: "disabled",
    issues: flags.issues.filter((issue) => !isApprovedB2ReadWriteTransitionIssue(issue))
  };
}

function normalizePlannedMealWriteFlags(flags: ConsumerMealRuntimeFlags, authSource: ConsumerRuntimeFlags["authSource"]): ConsumerMealRuntimeFlags {
  if (authSource === "mock") {
    return {
      ...flags,
      plannedMealsSource: "mock",
      plannedMealsWriteSource: "mock",
      supabaseWritesEnabled: true,
      issues: []
    };
  }
  return { ...flags, issues: flags.issues.filter((issue) => !isApprovedB2ReadWriteTransitionIssue(issue)) };
}

function normalizeMealPhotoUploadFlags(
  flags: MealPhotoUploadRuntimeFlags,
  authSource: ConsumerRuntimeFlags["authSource"]
): MealPhotoUploadRuntimeFlags {
  if (authSource === "mock") {
    return { uploadSource: "mock", issues: [] };
  }
  return flags;
}

function normalizeMealPhotoAnalysisFlags(
  flags: MealPhotoAnalysisRuntimeFlags,
  authSource: ConsumerRuntimeFlags["authSource"]
): MealPhotoAnalysisRuntimeFlags {
  if (authSource === "mock") {
    return { analysisSource: "mock", issues: [] };
  }
  return flags;
}

function isApprovedB2ReadWriteTransitionIssue(issue: string) {
  return issue.includes("daily nutrition summary reads require Consumer meal record writes to remain disabled")
    || issue.includes("daily nutrition summary reads require Consumer Supabase writes to remain disabled");
}

function mapAuthError(error: ConsumerAuthError | undefined): ConsumerRuntimeErrorCode {
  if (!error) return "authentication_failed";
  if (error.code === "account_disabled") return "account_disabled";
  if (error.code === "configuration_error" || error.code === "provider_not_configured" || error.code === "profile_configuration_invalid") {
    return "configuration_error";
  }
  if (error.code === "operation_not_enabled" || error.code === "email_confirmation_required") return "operation_not_enabled";
  if (error.code === "profile_not_found") return "profile_not_found";
  if (error.code.startsWith("profile_")) return "profile_failed";
  return "authentication_failed";
}

function idleProfileState(): ConsumerRuntimeProfileState {
  return { status: "idle", profile: null, errorCode: null };
}

function loadingProfileState(): ConsumerRuntimeProfileState {
  return { status: "loading", profile: null, errorCode: null };
}
