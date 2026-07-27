import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { snowPalette as colors } from "../../theme/tokens";
import {
  getOrCreateConsumerRuntimeComposition,
  type ConsumerRuntimeErrorCode,
  type ConsumerRuntimeMode,
  type ConsumerRuntimeProfileState,
  type ConsumerRuntimeState
} from "./consumerRuntimeComposition";
import type { ConsumerTodayIntakeOverviewService } from "../consumer-meals/consumerTodayIntakeOverviewService";
import type { ConsumerAnalysisMealWriteDraft } from "./consumerMealWriteMapper";
import type { ConsumerMealWriteRuntimeState } from "./consumerMealWriteRuntime";
import type {
  ConsumerMealIdentificationFinalizationDraft,
  ConsumerMealIdentificationFinalizationRuntimeState
} from "./consumerMealIdentificationFinalizationRuntime";
import type { ConsumerPlannedMeal, ConsumerUpdatePlannedMealV2Input } from "../consumer-meals/types";
import type { ConsumerPlannedMealDraft } from "./consumerPlannedMealMapper";
import type { ConsumerPlannedMealRuntimeState } from "./consumerPlannedMealRuntime";
import { errUpload, MealPhotoUploadError, type MealPhotoUploadInput, type MealPhotoUploadOutcome } from "../meal-photo-upload/types";
import { errAnalysis, MealPhotoAnalysisClientError, type MealPhotoAnalysisClientInput, type MealPhotoAnalysisOutcome } from "../meal-photo-analysis/types";

export type ConsumerPlannedMealMutationState = {
  status: "idle" | "submitting" | "succeeded" | "error";
  operation: "update" | "cancel" | null;
  errorCode: "authentication_required" | "timezone_required" | "configuration_error" | "conflict" | "provider_rejected" | null;
};

export type ConsumerRuntimeContextValue = {
  state: ConsumerRuntimeState;
  mode: ConsumerRuntimeMode;
  configurationError: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  signInDemo(): Promise<boolean>;
  signOut(): Promise<boolean>;
  retryProfile(): Promise<boolean>;
  createMealRecord(draft: ConsumerAnalysisMealWriteDraft): Promise<ConsumerMealWriteRuntimeState>;
  retryPendingMealRecord(): Promise<ConsumerMealWriteRuntimeState>;
  finalizeMealIdentification(
    draft: ConsumerMealIdentificationFinalizationDraft
  ): Promise<ConsumerMealIdentificationFinalizationRuntimeState>;
  retryPendingMealIdentificationFinalization(): Promise<ConsumerMealIdentificationFinalizationRuntimeState>;
  createPlannedMeal(draft: ConsumerPlannedMealDraft): Promise<ConsumerPlannedMealRuntimeState>;
  retryPendingPlannedMeal(): Promise<ConsumerPlannedMealRuntimeState>;
  updatePlannedMeal(input: ConsumerUpdatePlannedMealV2Input): Promise<ConsumerPlannedMealMutationState>;
  cancelPlannedMeal(input: { plannedMealId: string; expectedUpdatedAt: string }): Promise<ConsumerPlannedMealMutationState>;
  convertPlannedMeal(input: { plannedMealId: string; expectedUpdatedAt: string }): Promise<ConsumerPlannedMealRuntimeState>;
  getPlannedMeals(plannedDate: string): Promise<ConsumerPlannedMeal[]>;
  uploadMealPhoto(input: MealPhotoUploadInput): Promise<MealPhotoUploadOutcome>;
  deleteMealPhotoObject(imageObjectRef: string): Promise<boolean>;
  analyzeMealPhoto(input: MealPhotoAnalysisClientInput): Promise<MealPhotoAnalysisOutcome>;
  mealWriteState: ConsumerMealWriteRuntimeState;
  mealIdentificationFinalizationState: ConsumerMealIdentificationFinalizationRuntimeState;
  plannedMealState: ConsumerPlannedMealRuntimeState;
  plannedMealMutationState: ConsumerPlannedMealMutationState;
  consumerDataRevision: number;
  mealDataRevision: number;
  overviewService: ConsumerTodayIntakeOverviewService | null;
};

const unavailableState: ConsumerRuntimeState = {
  authState: { status: "error", session: null },
  operation: "idle",
  actorKey: null,
  actorGeneration: 0,
  profileState: { status: "idle", profile: null, errorCode: null },
  errorCode: "configuration_error"
};

const ConsumerRuntimeContext = createContext<ConsumerRuntimeContextValue | null>(null);
const unavailableMealWriteState: ConsumerMealWriteRuntimeState = {
  status: "error",
  errorCode: "configuration_error",
  mealRecordId: null,
  mealDate: null,
  pending: false,
  mealDataRevision: 0
};
const unavailableMealIdentificationFinalizationState: ConsumerMealIdentificationFinalizationRuntimeState = {
  status: "error",
  errorCode: "finalization_configuration_invalid",
  mealRecordId: null,
  mealRecordItemId: null,
  mealAnalysisId: null,
  mealIdentificationFinalizationId: null,
  mealCorrectionIds: null,
  pending: false,
  finalizationDataRevision: 0
};
const unavailablePlannedMealState: ConsumerPlannedMealRuntimeState = {
  status: "error", pendingKind: null, errorCode: "configuration_error", plannedMealId: null, mealRecordId: null, revision: 0
};
const idlePlannedMealMutationState: ConsumerPlannedMealMutationState = { status: "idle", operation: null, errorCode: null };

export function ConsumerRuntimeProvider({ children }: { children: ReactNode }) {
  const compositionRef = useRef<ReturnType<typeof getOrCreateConsumerRuntimeComposition> | null>(null);
  if (!compositionRef.current) compositionRef.current = getOrCreateConsumerRuntimeComposition();
  const composition = compositionRef.current;
  const controller = composition.ok ? composition.value.controller : null;
  const mealWriteRuntime = composition.ok ? composition.value.mealWriteRuntime : null;
  const mealIdentificationFinalizationRuntime = composition.ok ? composition.value.mealIdentificationFinalizationRuntime : null;
  const plannedMealRuntime = composition.ok ? composition.value.plannedMealRuntime : null;
  const [state, setState] = useState<ConsumerRuntimeState>(() => controller?.getState() ?? unavailableState);
  const runtimeStateRef = useRef(state);
  runtimeStateRef.current = state;
  const [mealWriteState, setMealWriteState] = useState<ConsumerMealWriteRuntimeState>(() => mealWriteRuntime?.getState() ?? unavailableMealWriteState);
  const [mealIdentificationFinalizationState, setMealIdentificationFinalizationState] =
    useState<ConsumerMealIdentificationFinalizationRuntimeState>(
      () => mealIdentificationFinalizationRuntime?.getState() ?? unavailableMealIdentificationFinalizationState
    );
  const [plannedMealState, setPlannedMealState] = useState<ConsumerPlannedMealRuntimeState>(() => plannedMealRuntime?.getState() ?? unavailablePlannedMealState);
  const [plannedMealMutationState, setPlannedMealMutationState] = useState<ConsumerPlannedMealMutationState>(idlePlannedMealMutationState);
  const [plannedMealMutationRevision, setPlannedMealMutationRevision] = useState(0);

  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(setState);
    void controller.start();
    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    if (!mealWriteRuntime) return;
    return mealWriteRuntime.subscribe(setMealWriteState);
  }, [mealWriteRuntime]);

  useEffect(() => {
    if (!mealIdentificationFinalizationRuntime) return;
    return mealIdentificationFinalizationRuntime.subscribe(setMealIdentificationFinalizationState);
  }, [mealIdentificationFinalizationRuntime]);

  useEffect(() => {
    if (!plannedMealRuntime) return;
    return plannedMealRuntime.subscribe(setPlannedMealState);
  }, [plannedMealRuntime]);

  useEffect(() => {
    if (!mealWriteRuntime) return;
    void mealWriteRuntime.setActor(state.actorKey, state.actorGeneration);
  }, [mealWriteRuntime, state.actorGeneration, state.actorKey]);

  useEffect(() => {
    if (!mealIdentificationFinalizationRuntime) return;
    void mealIdentificationFinalizationRuntime.setActor(state.actorKey, state.actorGeneration);
  }, [mealIdentificationFinalizationRuntime, state.actorGeneration, state.actorKey]);

  useEffect(() => {
    if (!plannedMealRuntime) return;
    setPlannedMealMutationState(idlePlannedMealMutationState);
    void plannedMealRuntime.setActor(state.actorKey, state.actorGeneration);
  }, [plannedMealRuntime, state.actorGeneration, state.actorKey]);

  const profileTimezone = state.profileState.status === "available" ? state.profileState.profile.timezone : null;
  const overviewService = useMemo(() => {
    if (!composition.ok || !profileTimezone) return null;
    try {
      return composition.value.createOverviewService(profileTimezone);
    } catch {
      return null;
    }
  }, [composition, profileTimezone]);

  const value = useMemo<ConsumerRuntimeContextValue>(() => ({
    state,
    mode: controller?.mode ?? "disabled",
    configurationError: !composition.ok,
    signIn: (email, password) => controller?.signIn(email, password) ?? Promise.resolve(false),
    signInDemo: () => controller?.signInDemo() ?? Promise.resolve(false),
    signOut: () => controller?.signOut() ?? Promise.resolve(false),
    retryProfile: () => controller?.retryProfile() ?? Promise.resolve(false),
    createMealRecord: (draft) => {
      if (!mealWriteRuntime || !state.actorKey || state.authState.status !== "signedIn") {
        return Promise.resolve(mealWriteRuntime?.reject("authentication_required") ?? unavailableMealWriteState);
      }
      if (!isValidIanaTimezone(profileTimezone)) return Promise.resolve(mealWriteRuntime.reject("profile_timezone_required"));
      return mealWriteRuntime.submit({ actorKey: state.actorKey, actorGeneration: state.actorGeneration, timezone: profileTimezone }, draft);
    },
    retryPendingMealRecord: () => {
      if (!mealWriteRuntime || !state.actorKey || state.authState.status !== "signedIn") {
        return Promise.resolve(mealWriteRuntime?.reject("authentication_required") ?? unavailableMealWriteState);
      }
      return mealWriteRuntime.retry({ actorKey: state.actorKey, actorGeneration: state.actorGeneration });
    },
    finalizeMealIdentification: (draft) => {
      if (!mealIdentificationFinalizationRuntime || !state.actorKey || state.authState.status !== "signedIn") {
        return Promise.resolve(
          mealIdentificationFinalizationRuntime?.reject("finalization_authentication_required") ??
            unavailableMealIdentificationFinalizationState
        );
      }
      if (!isValidIanaTimezone(profileTimezone)) {
        return Promise.resolve(mealIdentificationFinalizationRuntime.reject("profile_timezone_required"));
      }
      return mealIdentificationFinalizationRuntime.submit(
        { actorKey: state.actorKey, actorGeneration: state.actorGeneration, timezone: profileTimezone },
        draft
      );
    },
    retryPendingMealIdentificationFinalization: () => {
      if (!mealIdentificationFinalizationRuntime || !state.actorKey || state.authState.status !== "signedIn") {
        return Promise.resolve(
          mealIdentificationFinalizationRuntime?.reject("finalization_authentication_required") ??
            unavailableMealIdentificationFinalizationState
        );
      }
      return mealIdentificationFinalizationRuntime.retry({
        actorKey: state.actorKey,
        actorGeneration: state.actorGeneration
      });
    },
    createPlannedMeal: (draft) => {
      if (!plannedMealRuntime || !state.actorKey || state.authState.status !== "signedIn") return Promise.resolve(unavailablePlannedMealState);
      if (!isValidIanaTimezone(profileTimezone)) return Promise.resolve(unavailablePlannedMealState);
      return plannedMealRuntime.submitCreate({ actorKey: state.actorKey, actorGeneration: state.actorGeneration, timezone: profileTimezone }, draft);
    },
    retryPendingPlannedMeal: () => {
      if (!plannedMealRuntime || !state.actorKey || state.authState.status !== "signedIn") return Promise.resolve(unavailablePlannedMealState);
      return plannedMealRuntime.retry({ actorKey: state.actorKey, actorGeneration: state.actorGeneration });
    },
    updatePlannedMeal: async (input) => {
      if (!composition.ok || !state.actorKey || state.authState.status !== "signedIn") return mutationFailure(setPlannedMealMutationState, "authentication_required");
      if (!isValidIanaTimezone(profileTimezone)) return mutationFailure(setPlannedMealMutationState, "timezone_required");
      const actor = state.actorKey; const generation = state.actorGeneration;
      setPlannedMealMutationState({ status: "submitting", operation: "update", errorCode: null });
      try {
        const result = await composition.value.plannedMealService.update(input);
        if (actor !== runtimeStateRef.current.actorKey || generation !== runtimeStateRef.current.actorGeneration) return idlePlannedMealMutationState;
        if (!result.ok) return mutationFailure(setPlannedMealMutationState, mapPlannedMutationError(result.error.code, result.error.message), "update");
        const succeeded = { status: "succeeded", operation: "update", errorCode: null } as const;
        setPlannedMealMutationState(succeeded); setPlannedMealMutationRevision((value) => value + 1); return succeeded;
      } catch {
        if (actor !== runtimeStateRef.current.actorKey || generation !== runtimeStateRef.current.actorGeneration) return idlePlannedMealMutationState;
        return mutationFailure(setPlannedMealMutationState, "provider_rejected", "update");
      }
    },
    cancelPlannedMeal: async (input) => {
      if (!composition.ok || !state.actorKey || state.authState.status !== "signedIn") return mutationFailure(setPlannedMealMutationState, "authentication_required");
      if (!isValidIanaTimezone(profileTimezone)) return mutationFailure(setPlannedMealMutationState, "timezone_required");
      const actor = state.actorKey; const generation = state.actorGeneration;
      setPlannedMealMutationState({ status: "submitting", operation: "cancel", errorCode: null });
      try {
        const result = await composition.value.plannedMealService.cancel(input);
        if (actor !== runtimeStateRef.current.actorKey || generation !== runtimeStateRef.current.actorGeneration) return idlePlannedMealMutationState;
        if (!result.ok) return mutationFailure(setPlannedMealMutationState, mapPlannedMutationError(result.error.code, result.error.message), "cancel");
        const succeeded = { status: "succeeded", operation: "cancel", errorCode: null } as const;
        setPlannedMealMutationState(succeeded); setPlannedMealMutationRevision((value) => value + 1); return succeeded;
      } catch {
        if (actor !== runtimeStateRef.current.actorKey || generation !== runtimeStateRef.current.actorGeneration) return idlePlannedMealMutationState;
        return mutationFailure(setPlannedMealMutationState, "provider_rejected", "cancel");
      }
    },
    convertPlannedMeal: (input) => {
      if (!plannedMealRuntime || !state.actorKey || state.authState.status !== "signedIn" || !isValidIanaTimezone(profileTimezone)) return Promise.resolve(unavailablePlannedMealState);
      return plannedMealRuntime.submitConversion(
        { actorKey: state.actorKey, actorGeneration: state.actorGeneration, timezone: profileTimezone }, input
      );
    },
    getPlannedMeals: async (plannedDate) => {
      if (!composition.ok || !state.actorKey || state.authState.status !== "signedIn") return [];
      const actor = state.actorKey; const generation = state.actorGeneration;
      try {
        const result = await composition.value.getPlannedMeals(plannedDate);
        if (actor !== runtimeStateRef.current.actorKey || generation !== runtimeStateRef.current.actorGeneration) return [];
        return result.status === "available" ? result.meals : [];
      } catch { return []; }
    },
    uploadMealPhoto: (input) => {
      if (!composition.ok) {
        return Promise.resolve(errUpload(new MealPhotoUploadError("meal_photo_upload_disabled", "Meal photo upload is disabled in this runtime.")));
      }
      return composition.value.mealPhotoUploadService.uploadMealPhoto(input);
    },
    deleteMealPhotoObject: (imageObjectRef) => {
      if (!composition.ok) return Promise.resolve(false);
      return composition.value.mealPhotoUploadService.deleteMealPhotoObject(imageObjectRef);
    },
    analyzeMealPhoto: (input) => {
      if (!composition.ok) {
        return Promise.resolve(errAnalysis(new MealPhotoAnalysisClientError("analysis_disabled", "Meal photo analysis is disabled in this runtime.")));
      }
      return composition.value.mealPhotoAnalysisService.analyzeMealPhoto(input);
    },
    mealWriteState,
    mealIdentificationFinalizationState,
    plannedMealState,
    plannedMealMutationState,
    consumerDataRevision:
      mealWriteState.mealDataRevision +
      mealIdentificationFinalizationState.finalizationDataRevision +
      plannedMealState.revision +
      plannedMealMutationRevision,
    mealDataRevision:
      mealWriteState.mealDataRevision +
      mealIdentificationFinalizationState.finalizationDataRevision +
      plannedMealState.revision +
      plannedMealMutationRevision,
    overviewService
  }), [
    composition,
    controller,
    mealWriteRuntime,
    mealWriteState,
    mealIdentificationFinalizationRuntime,
    mealIdentificationFinalizationState,
    overviewService,
    plannedMealMutationRevision,
    plannedMealMutationState,
    plannedMealRuntime,
    plannedMealState,
    profileTimezone,
    state
  ]);

  return <ConsumerRuntimeContext.Provider value={value}>{children}</ConsumerRuntimeContext.Provider>;
}

function mutationFailure(
  setter: (value: ConsumerPlannedMealMutationState) => void,
  errorCode: NonNullable<ConsumerPlannedMealMutationState["errorCode"]>,
  operation: ConsumerPlannedMealMutationState["operation"] = null
) {
  const state: ConsumerPlannedMealMutationState = { status: "error", operation, errorCode };
  setter(state); return state;
}

function mapPlannedMutationError(code: string, message: string): NonNullable<ConsumerPlannedMealMutationState["errorCode"]> {
  if (code.includes("authentication") || code === "session_expired") return "authentication_required";
  if (code.includes("configuration") || code.includes("disabled")) return "configuration_error";
  if (message.includes("CONFLICT") || message.includes("changed") || message.includes("converted")) return "conflict";
  return "provider_rejected";
}

function isValidIanaTimezone(value: string | null): value is string {
  if (!value?.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0)); return true; } catch { return false; }
}

export function useConsumerRuntime() {
  const value = useContext(ConsumerRuntimeContext);
  if (!value) throw new Error("useConsumerRuntime must be used inside ConsumerRuntimeProvider.");
  return value;
}

export function ConsumerRuntimeNavigationGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const runtime = useConsumerRuntime();
  const authStatus = runtime.state.authState.status;
  const onLoginRoute = String(segments[0] ?? "") === "login";
  const profileLoading = runtime.state.profileState.status === "loading";
  const signedInReady = authStatus === "signedIn" && !profileLoading;
  const signedOutLike = authStatus === "signedOut" || (authStatus === "error" && runtime.state.errorCode !== "configuration_error");

  useEffect(() => {
    if (signedOutLike && !onLoginRoute) router.replace("/login");
    if (signedInReady && onLoginRoute) router.replace("/");
  }, [onLoginRoute, router, signedInReady, signedOutLike]);

  if (runtime.configurationError || runtime.state.errorCode === "configuration_error") {
    return <RuntimeBoundary errorCode="configuration_error" />;
  }
  if (authStatus === "disabled" || runtime.state.errorCode === "account_disabled") {
    return <RuntimeBoundary errorCode="account_disabled" />;
  }
  if (authStatus === "initializing" || profileLoading) {
    return <RuntimeLoadingBoundary />;
  }
  if ((signedOutLike && !onLoginRoute) || (signedInReady && onLoginRoute)) {
    return <RuntimeLoadingBoundary />;
  }
  return <>{children}</>;
}

function RuntimeLoadingBoundary() {
  return (
    <View style={styles.boundary}>
      <ActivityIndicator color={colors.primaryDeep} size="large" />
      <Text style={styles.boundaryTitle}>{zhTW.mobile.consumerAuth.initializing}</Text>
    </View>
  );
}

function RuntimeBoundary({ errorCode }: { errorCode: ConsumerRuntimeErrorCode }) {
  const copy = errorCode === "account_disabled" ? zhTW.mobile.consumerAuth.accountDisabled : zhTW.mobile.consumerAuth.configurationError;
  return (
    <View style={styles.boundary}>
      <Text style={styles.boundaryTitle}>{copy.title}</Text>
      <Text style={styles.boundaryBody}>{copy.body}</Text>
    </View>
  );
}

export function ConsumerProfileStateNotice({ profileState, onRetry }: { profileState: ConsumerRuntimeProfileState; onRetry: () => void }) {
  if (profileState.status === "available" || profileState.status === "idle") return null;
  const copy = profileState.status === "notFound" ? zhTW.mobile.consumerAuth.profileNotFound : zhTW.mobile.consumerAuth.profileLoadError;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{copy.title}</Text>
      <Text style={styles.boundaryBody}>{copy.body}</Text>
      {profileState.status === "error" ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>{zhTW.mobile.consumerAuth.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
    backgroundColor: colors.bg,
    padding: 28
  },
  boundaryTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  boundaryBody: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center"
  },
  notice: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 16
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center"
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  retryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  }
});
