import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { MealPhotoAnalysisCandidate, MealPhotoAnalysisStatus } from "@haocu/shared";
import type {
  MealIdentificationCandidate,
  MealSourceContext
} from "../meal-identification";
import { generateMealPhotoAnalysisRequestId } from "../meal-photo-upload/requestId";
import type { MealPhotoUploadErrorCode } from "../meal-photo-upload/types";
import type { MealPhotoAnalysisClientErrorCode } from "../meal-photo-analysis/types";
import type {
  CorrectionSectionKey,
  MatchState,
  MealAnalysisMode,
  MealPhotoCaptureMethod,
  MealRecordTimingChoice
} from "./types";
import type { MealPhotoFinalizationDraftState } from "./mealPhotoFinalizationDraft";
import type { CompletedMealPhotoAnalysisSnapshot } from "./mealPhotoAnalysisFlowState";

export type MealPhotoUploadStatus = "not_started" | "uploading" | "uploaded" | "failed";

// MI-E-C5-A: client-side lifecycle for the meal-photo-analysis Edge Function invocation.
// waiting_for_upload exists only as a documented intermediate meaning ("upload not finished yet,
// so analysis has not started") — the hook never actually calls setMealPhotoAnalysisState with it,
// since not_started already covers that case; it is kept in the type for UI code that wants to
// render an explicit distinct message pre-upload vs. genuinely idle.
export type MealPhotoAnalysisInvocationStatus =
  | "not_started"
  | "waiting_for_upload"
  | "invoking"
  | "completed"
  | "low_confidence"
  | "failed";

// MI-E-C5-R5-R2: canonical analysis-session owner identity.
//
// This is NOT a second user-ID system — actorKey/actorGeneration are read straight from the frozen
// consumer-runtime identity authority (see consumerRuntimeComposition's handleAuthState/clearActor,
// which is what mints and bumps them). The analysis session is an in-memory module singleton that
// outlives every route unmount, so without an owner stamped ON the session there is no way, at a
// later mount, to tell whose data it holds. `null` means "not bound to any actor" — either a
// genuinely pristine session, or a legacy/untrusted one that must be reset before use.
export type AnalysisSessionActorOwner = Readonly<{
  actorKey: string;
  actorGeneration: number;
}>;

// The runtime-shaped input side: actorKey is nullable because a signed-out runtime has no actor.
export type AnalysisSessionActorInput = Readonly<{
  actorKey: string | null | undefined;
  actorGeneration: number;
}>;

export type AnalysisSessionState = {
  // MI-E-C5-R5-R2: whose session this is. Covers the WHOLE session, not just the R5 completion —
  // capturedImageUri, imageObjectRef, upload state, analysisRequestId, candidates, the finalization
  // draft, its clientRequestId and the durable result IDs are all equally actor-sensitive.
  actorOwner: AnalysisSessionActorOwner | null;
  matchState: MatchState;
  mode: MealAnalysisMode;
  expandedCorrection: string | null;
  addSection: CorrectionSectionKey | null;
  addedSections: Record<CorrectionSectionKey, boolean>;
  nutritionRefreshed: boolean;
  correctionCompleted: boolean;
  showExternalBreakdown: boolean;
  externalBreakdownTriggered: boolean;
  restaurantName: string;
  mealName: string;
  sourceContext: MealSourceContext;
  selectedCandidate: MealIdentificationCandidate | null;
  correctedRows: Record<string, boolean>;
  selectedMealPeriod: string;
  mealSaved: boolean;
  mealId: string;
  preMealPhotoIds: string[];
  guiltSharingResult: { peopleCount: number; sharedCaloriesPerPerson: number } | null;
  // MI-E-B2/MI-E-B4: capture provenance and actual-meal-time intent. Mobile-flow-only
  // fields — captureMethod and capturedImageUri are never sent to the finalization
  // contract; recordTiming/occurredAt map directly onto the frozen MI-E-B1 v2 fields of
  // the same name. capturedImageUri is a transient local file URI only (not a database
  // media contract) — it exists purely so the analysis screen can keep referencing the
  // real photo the user just took or picked.
  captureMethod: MealPhotoCaptureMethod | null;
  capturedImageUri: string | null;
  // Whatever expo-image-picker's ImagePickerAsset reported for this capture (MI-E-C3) — the
  // upload coordinator's only source of a trusted MIME type; never guessed or defaulted.
  capturedImageMimeType: string | null;
  capturedImageFileName: string | null;
  recordTiming: MealRecordTimingChoice;
  recordTimingConfirmed: boolean;
  occurredAt: string | null;
  // MI-E-C3: private Storage upload state for capturedImageUri. analysisRequestId is generated
  // once per new photo (stable across upload retries, changes on every new capture/retake) and
  // doubles as the Storage object path's second path segment (see @haocu/shared's
  // buildMealPhotoAnalysisObjectPath). captureGeneration is a monotonically increasing counter,
  // bumped only by beginAnalysisCapture — mirrors consumer-runtime's actorGeneration pattern so a
  // stale upload completion from a superseded photo can be detected and discarded the same way a
  // stale actor-switch completion is, without inventing a second competing state model.
  analysisRequestId: string | null;
  captureGeneration: number;
  uploadStatus: MealPhotoUploadStatus;
  imageObjectRef: string | null;
  uploadErrorCode: MealPhotoUploadErrorCode | null;
  uploadAttemptCount: number;
  uploadedAt: string | null;
  // MI-E-C5-A: real AI-observation invocation state for the same photo/analysisRequestId above.
  // Reuses analysisRequestId/captureGeneration (and, at call time, consumer-runtime's own
  // actorKey/actorGeneration) as the single stale-result guard — see
  // useMealPhotoAnalysis.ts/mealPhotoUploadStaleGuard.ts's isMealPhotoUploadResultStillCurrent,
  // which this hook reuses rather than duplicating a second generation system.
  analysisInvocationStatus: MealPhotoAnalysisInvocationStatus;
  analysisCandidates: MealPhotoAnalysisCandidate[];
  // Local-only selection, prepared for a future confirmation round (MI-E-C5-B) — never written to
  // any database by this round, never implies verified/confirmed status by itself.
  selectedCandidateId: string | null;
  analysisStatus: MealPhotoAnalysisStatus | null;
  requiresUserConfirmation: boolean;
  analysisEngineVersion: string | null;
  analysisPromptVersion: string | null;
  analysisResponseSchemaVersion: string | null;
  safeAnalysisErrorCode: MealPhotoAnalysisClientErrorCode | null;
  analysisAttemptCount: number;
  analysisStartedAt: string | null;
  analysisCompletedAt: string | null;
  // MI-E-C5-B2: the one authoritative user-confirmation/finalization draft. It lives in
  // the same resettable photo-analysis session, so a new photo/session cannot inherit a
  // candidate, request ID, submission result, or edits from the previous analysis.
  mealPhotoFinalizationDraft: MealPhotoFinalizationDraftState | null;
  // MI-E-C5-R5: primary-first confirmation. Fallback candidates are only revealed after the user
  // explicitly rejects the primary best match, and the same-page completed snapshot is the sole
  // authority for the durable_completed screen.
  mealPhotoFallbackRevealed: boolean;
  mealPhotoCompletion: CompletedMealPhotoAnalysisSnapshot | null;
};

function createDefaultSession(): AnalysisSessionState {
  return {
    actorOwner: null,
    matchState: "pending",
    mode: "restaurant",
    expandedCorrection: null,
    addSection: null,
    addedSections: { ingredients: false, portions: false, cooking: false },
    nutritionRefreshed: false,
    correctionCompleted: false,
    showExternalBreakdown: false,
    externalBreakdownTriggered: false,
    restaurantName: zhTW.mobile.analysis.candidates[0].restaurant,
    mealName: zhTW.mobile.analysis.candidates[0].meal,
    sourceContext: "unknown",
    selectedCandidate: null,
    correctedRows: {},
    selectedMealPeriod: zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1],
    mealSaved: false,
    mealId: "",
    preMealPhotoIds: [],
    guiltSharingResult: null,
    captureMethod: null,
    capturedImageUri: null,
    capturedImageMimeType: null,
    capturedImageFileName: null,
    recordTiming: "current",
    recordTimingConfirmed: false,
    occurredAt: null,
    analysisRequestId: null,
    captureGeneration: 0,
    uploadStatus: "not_started",
    imageObjectRef: null,
    uploadErrorCode: null,
    uploadAttemptCount: 0,
    uploadedAt: null,
    analysisInvocationStatus: "not_started",
    analysisCandidates: [],
    selectedCandidateId: null,
    analysisStatus: null,
    requiresUserConfirmation: false,
    analysisEngineVersion: null,
    analysisPromptVersion: null,
    analysisResponseSchemaVersion: null,
    safeAnalysisErrorCode: null,
    analysisAttemptCount: 0,
    analysisStartedAt: null,
    analysisCompletedAt: null,
    mealPhotoFinalizationDraft: null,
    mealPhotoFallbackRevealed: false,
    mealPhotoCompletion: null
  };
}

let session: AnalysisSessionState = createDefaultSession();
// Lives outside the resettable session object (like consumer-runtime's actorGeneration) so a
// plain resetAnalysisSession() — which happens before any new photo exists — never regresses it.
let captureGenerationCounter = 0;

// AI Analysis behaves like a session: the in-progress/completed state must survive
// visiting other screens (Today Intake, Restaurant, Meal Buddy, Chat, Profile) and
// coming back, so the user lands on the same screen instead of starting over.
// Only resetAnalysisSession() (called when a new photo is captured/uploaded) clears it.
export function getAnalysisSession(): AnalysisSessionState {
  return session;
}

export function resetAnalysisSession() {
  session = createDefaultSession();
}

// MI-E-C5-R5-R2 §五: is this session free of every actor-sensitive value?
//
// Deliberately NOT "mealPhotoCompletion === null" — the R5-R1 audit proved the captured photo URI,
// the Storage object ref, the finalization draft (with its clientRequestId and durable result IDs)
// and the revealed-fallback step all leak independently of the completion snapshot. Anything that
// could identify a meal, a photo, a request or a database row for a specific person is checked
// here, and a single truthy value is enough to make the session non-pristine.
export function isAnalysisSessionPristine(state: AnalysisSessionState): boolean {
  const pristineDefaults =
    state.captureMethod === null &&
    state.capturedImageUri === null &&
    state.capturedImageMimeType === null &&
    state.capturedImageFileName === null &&
    state.occurredAt === null &&
    state.recordTimingConfirmed === false &&
    state.analysisRequestId === null &&
    state.uploadStatus === "not_started" &&
    state.imageObjectRef === null &&
    state.uploadErrorCode === null &&
    state.uploadAttemptCount === 0 &&
    state.uploadedAt === null &&
    state.analysisInvocationStatus === "not_started" &&
    state.analysisCandidates.length === 0 &&
    state.selectedCandidateId === null &&
    state.analysisStatus === null &&
    state.safeAnalysisErrorCode === null &&
    state.analysisAttemptCount === 0 &&
    state.analysisStartedAt === null &&
    state.analysisCompletedAt === null &&
    state.mealPhotoFinalizationDraft === null &&
    state.mealPhotoFallbackRevealed === false &&
    state.mealPhotoCompletion === null;
  if (!pristineDefaults) return false;
  // Legacy/demo correction-flow values are just as actor-sensitive: they name a meal, a restaurant
  // and a saved record id.
  return (
    state.selectedCandidate === null &&
    state.guiltSharingResult === null &&
    state.mealSaved === false &&
    state.mealId === "" &&
    state.preMealPhotoIds.length === 0 &&
    state.matchState === "pending" &&
    state.correctionCompleted === false
  );
}

export function isAnalysisSessionOwnedBy(
  state: AnalysisSessionState,
  actor: AnalysisSessionActorInput
): boolean {
  const owner = state.actorOwner;
  if (!owner) return false;
  if (!actor.actorKey) return false;
  return owner.actorKey === actor.actorKey && owner.actorGeneration === actor.actorGeneration;
}

export type AnalysisSessionOwnerReconciliationStatus =
  | "preserved"
  | "bound_pristine"
  | "reset_untrusted_and_bound"
  | "reset_different_actor_and_bound"
  | "cleared_signed_out";

export type AnalysisSessionOwnerReconciliation = Readonly<{
  status: AnalysisSessionOwnerReconciliationStatus;
  owner: AnalysisSessionActorOwner | null;
  // Monotonic. Bumped on every transition that is not "preserved", so a mounted screen can detect
  // — during render, before committing anything — that the state it is holding belongs to a
  // previous owner. Lives outside the session object so a reset can never regress it.
  epoch: number;
  releasedOwnedGalleryAsset: boolean;
}>;

// The gallery cache release is injected rather than imported so this module stays free of
// expo-file-system / expo-image-manipulator. That keeps the store loadable in a plain Node smoke
// AND lets the smoke prove both "released exactly once on an actor change" and "a throwing release
// still leaves the session cleared".
export type AnalysisSessionActorOwnerDependencies = Readonly<{
  releaseOwnedGalleryAsset: () => void;
}>;

let actorOwnerEpochCounter = 0;

export function getAnalysisSessionActorOwnerEpoch(): number {
  return actorOwnerEpochCounter;
}

// ============================================================================================
// MI-E-C5-R5-R3 LAYER 1 — PURE RENDER-TIME OWNERSHIP AUTHORITY.
//
// Everything in this section is safe to call from a React render body: it never assigns to
// `session`, never touches `actorOwnerEpochCounter`, never invokes the cleanup dependency, never
// creates a Promise and never performs I/O. An abandoned, interrupted, retried or concurrent
// render can call any of it as many times as React likes with zero observable consequence.
//
// The mutating counterparts live in LAYER 2 below and are named `commit...` so a render-layer
// caller has to go out of its way to reach them.
// ============================================================================================

export type AnalysisSessionOwnershipStatus =
  | "owned"
  | "ownerless_pristine"
  | "untrusted"
  | "different_actor"
  | "signed_out";

export type AnalysisSessionOwnershipDecision = Readonly<{
  status: AnalysisSessionOwnershipStatus;
  // The ONLY session any render path or hook may read. For every status except "owned" and
  // "ownerless_pristine" this is a sanitized empty view — never the raw stale session.
  session: AnalysisSessionState;
  reconciliationRequired: boolean;
  // The owner a commit-phase reconciliation should bind, and the owner a new capture is stamped
  // with. Null while signed out, which is what makes a signed-out capture explicitly ownerless.
  owner: AnalysisSessionActorOwner | null;
  shouldReleaseOwnedGalleryAsset: boolean;
  // True when `session` above is a sanitized stand-in rather than the real stored session.
  exposesSanitizedView: boolean;
}>;

export function toAnalysisSessionActorOwner(
  actor: AnalysisSessionActorInput
): AnalysisSessionActorOwner | null {
  if (!actor.actorKey) return null;
  return Object.freeze({ actorKey: actor.actorKey, actorGeneration: actor.actorGeneration });
}

// A fresh, fully-empty session with no owner. Allocated per call rather than shared, so a consumer
// that writes through it can never corrupt a sanitized view held by someone else.
export function createSanitizedAnalysisSessionView(): AnalysisSessionState {
  return createDefaultSession();
}

// PURE. Given a raw session and an actor, decide what that actor is allowed to see and what a
// later commit-phase reconciliation will have to do. Does not modify `state`, the module session,
// the epoch counter, or anything else.
export function deriveAnalysisSessionViewForActor(
  state: AnalysisSessionState,
  actor: AnalysisSessionActorInput
): AnalysisSessionOwnershipDecision {
  const owner = state.actorOwner;

  // Signed out / failed auth restore. Nothing of any previous actor may be exposed.
  if (!actor.actorKey) {
    const alreadyClean = owner === null && isAnalysisSessionPristine(state);
    return Object.freeze({
      status: "signed_out",
      session: alreadyClean ? state : createSanitizedAnalysisSessionView(),
      reconciliationRequired: !alreadyClean,
      owner: null,
      shouldReleaseOwnedGalleryAsset: !alreadyClean,
      exposesSanitizedView: !alreadyClean
    });
  }

  const nextOwner = toAnalysisSessionActorOwner(actor);

  // Same actorKey AND same actorGeneration — this actor's own in-progress session.
  if (owner && nextOwner && owner.actorKey === nextOwner.actorKey && owner.actorGeneration === nextOwner.actorGeneration) {
    return Object.freeze({
      status: "owned",
      session: state,
      reconciliationRequired: false,
      owner,
      shouldReleaseOwnedGalleryAsset: false,
      exposesSanitizedView: false
    });
  }

  // Ownerless AND genuinely pristine: nothing sensitive exists, so the real (empty) session is
  // already safe to expose. Binding still has to happen, but only in the commit phase.
  if (!owner && isAnalysisSessionPristine(state)) {
    return Object.freeze({
      status: "ownerless_pristine",
      session: state,
      reconciliationRequired: true,
      owner: nextOwner,
      shouldReleaseOwnedGalleryAsset: false,
      exposesSanitizedView: false
    });
  }

  // Ownerless but NOT pristine: legacy/untrusted. "No owner" is never evidence that the data
  // belongs to the arriving actor, so it is hidden immediately and reset in the commit phase.
  if (!owner) {
    return Object.freeze({
      status: "untrusted",
      session: createSanitizedAnalysisSessionView(),
      reconciliationRequired: true,
      owner: nextOwner,
      shouldReleaseOwnedGalleryAsset: true,
      exposesSanitizedView: true
    });
  }

  // Different actorKey, or the same actorKey at a different actorGeneration (re-authentication,
  // sign-out/sign-in, account switch). Hidden on this very render; reset in the commit phase.
  return Object.freeze({
    status: "different_actor",
    session: createSanitizedAnalysisSessionView(),
    reconciliationRequired: true,
    owner: nextOwner,
    shouldReleaseOwnedGalleryAsset: true,
    exposesSanitizedView: true
  });
}

// PURE render-time entry point: reads the module session and derives the safe view from it.
// Reading is not mutating — this is the function render bodies are expected to call.
export function getAnalysisSessionViewForActor(
  actor: AnalysisSessionActorInput
): AnalysisSessionOwnershipDecision {
  return deriveAnalysisSessionViewForActor(session, actor);
}

// ============================================================================================
// MI-E-C5-R5-R3 LAYER 2 — COMMIT-PHASE RECONCILIATION (MUTATING).
//
// Everything below assigns to the module session, moves the epoch counter, and can invoke the
// gallery-cache release. NONE of it may be called from a React render body — only from a layout
// effect, a normal effect, or an event handler, all of which run after React has committed and
// therefore can never be executed speculatively by an abandoned or interrupted render.
//
// Render-time callers want getAnalysisSessionViewForActor / deriveAnalysisSessionViewForActor
// (LAYER 1 above), which answer the same question without touching anything.
// ============================================================================================

function releaseThenReset(dependencies: AnalysisSessionActorOwnerDependencies) {
  // Order matters: the previous owner's app-private normalized cache file is released BEFORE the
  // session is cleared and before any new owner can register a replacement asset. A throwing
  // release must never abort the privacy reset, so the reset runs in `finally`.
  try {
    dependencies.releaseOwnedGalleryAsset();
  } catch {
    // Local cache cleanup is best effort; failing to delete a cache file must never leave the
    // previous actor's session readable.
  } finally {
    session = createDefaultSession();
  }
}

// The canonical mutating reconciliation. Idempotent: a second call with the same actor returns
// "preserved" and mutates nothing, so a StrictMode double-invoked layout effect is safe.
export function commitAnalysisSessionActorOwnerReconciliation(
  actor: AnalysisSessionActorInput,
  dependencies: AnalysisSessionActorOwnerDependencies
): AnalysisSessionOwnerReconciliation {
  // Signed out / failed auth restore: no actor may own a session, and nothing sensitive from the
  // previous actor may remain reachable. Fail closed.
  if (!actor.actorKey) {
    if (session.actorOwner === null && isAnalysisSessionPristine(session)) {
      return { status: "preserved", owner: null, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: false };
    }
    releaseThenReset(dependencies);
    actorOwnerEpochCounter += 1;
    return { status: "cleared_signed_out", owner: null, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: true };
  }

  const nextOwner: AnalysisSessionActorOwner = Object.freeze({
    actorKey: actor.actorKey,
    actorGeneration: actor.actorGeneration
  });
  const owner = session.actorOwner;

  // Same actorKey AND same actorGeneration: a legitimate in-progress session of this very actor.
  // A silent token refresh and a plain remount both land here and preserve everything.
  if (owner && owner.actorKey === nextOwner.actorKey && owner.actorGeneration === nextOwner.actorGeneration) {
    return { status: "preserved", owner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: false };
  }

  // Ownerless AND genuinely pristine: nothing sensitive exists, so binding is safe.
  if (!owner && isAnalysisSessionPristine(session)) {
    session = { ...session, actorOwner: nextOwner };
    actorOwnerEpochCounter += 1;
    return { status: "bound_pristine", owner: nextOwner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: false };
  }

  // Ownerless but NOT pristine: a legacy/untrusted session from before ownership existed, or one
  // whose owner was dropped. "No owner" is never evidence that the data belongs to the current
  // actor — reset first, then bind.
  if (!owner) {
    releaseThenReset(dependencies);
    session = { ...session, actorOwner: nextOwner };
    actorOwnerEpochCounter += 1;
    return { status: "reset_untrusted_and_bound", owner: nextOwner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: true };
  }

  // Different actorKey, or the same actorKey at a different actorGeneration (re-authentication,
  // sign-out/sign-in, account switch). Both are identity changes and both get a full reset.
  releaseThenReset(dependencies);
  session = { ...session, actorOwner: nextOwner };
  actorOwnerEpochCounter += 1;
  return { status: "reset_different_actor_and_bound", owner: nextOwner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: true };
}

// Explicit "start a brand-new analysis" gesture (開始 AI 分析 / autoOpen / 再分析一餐). Always a
// full sensitive reset, then an immediate rebind to the current actor so the next capture is owned
// from the very first write. A signed-out caller gets a cleared, ownerless session.
// MUTATING — event handlers and effects only, never a render body.
export function resetAnalysisSessionForActor(
  actor: AnalysisSessionActorInput,
  dependencies: AnalysisSessionActorOwnerDependencies
): AnalysisSessionOwnerReconciliation {
  releaseThenReset(dependencies);
  actorOwnerEpochCounter += 1;
  if (!actor.actorKey) {
    return { status: "cleared_signed_out", owner: null, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: true };
  }
  const nextOwner: AnalysisSessionActorOwner = Object.freeze({
    actorKey: actor.actorKey,
    actorGeneration: actor.actorGeneration
  });
  session = { ...session, actorOwner: nextOwner };
  return { status: "reset_different_actor_and_bound", owner: nextOwner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: true };
}

// Called once per new photo, from the meal-photo capture/upload entry point, after a
// real photo has actually been captured or picked (never on cancellation or permission
// denial), before navigating to /analysis. Starts a fresh session (same guarantee as
// resetAnalysisSession) and records how this session's photo was obtained. Camera
// sessions are "current" and already confirmed (occurredAt = the moment the photo was
// accepted, no further choice needed); photo_library sessions start unconfirmed so
// analysis.tsx must show the current/post-hoc prompt.
//
// MI-E-C5-R5-R2: `owner` stamps the new session with the actor that captured the photo. It is
// optional only because required parameters cannot follow optional ones; omitting it produces an
// explicitly OWNERLESS session, which reconcileAnalysisSessionActorOwner then treats as untrusted
// and resets rather than silently attributing to whoever mounts /analysis next.
export function beginAnalysisCapture(
  method: MealPhotoCaptureMethod,
  imageUri: string,
  capturedAt: Date = new Date(),
  mimeType: string | null = null,
  fileName: string | null = null,
  owner: AnalysisSessionActorOwner | null = null
) {
  captureGenerationCounter += 1;
  session = createDefaultSession();
  session.captureMethod = method;
  session.capturedImageUri = imageUri;
  session.capturedImageMimeType = mimeType;
  session.capturedImageFileName = fileName;
  session.analysisRequestId = generateMealPhotoAnalysisRequestId();
  session.captureGeneration = captureGenerationCounter;
  session.actorOwner = owner;
  if (method === "camera") {
    session.recordTiming = "current";
    session.recordTimingConfirmed = true;
    session.occurredAt = capturedAt.toISOString();
  }
}

// Called only by the upload coordinator (useMealPhotoUpload). Writes are gated on the caller
// still holding the current analysisRequestId + captureGeneration — see that hook for the actual
// stale-result / actor-switch discard checks; this setter trusts the caller already did them.
export function setMealPhotoUploadState(patch: {
  uploadStatus: MealPhotoUploadStatus;
  imageObjectRef?: string | null;
  uploadErrorCode?: MealPhotoUploadErrorCode | null;
  uploadedAt?: string | null;
  uploadAttemptCount?: number;
}) {
  session = {
    ...session,
    uploadStatus: patch.uploadStatus,
    imageObjectRef: patch.imageObjectRef !== undefined ? patch.imageObjectRef : session.imageObjectRef,
    uploadErrorCode: patch.uploadErrorCode !== undefined ? patch.uploadErrorCode : session.uploadErrorCode,
    uploadedAt: patch.uploadedAt !== undefined ? patch.uploadedAt : session.uploadedAt,
    uploadAttemptCount: patch.uploadAttemptCount !== undefined ? patch.uploadAttemptCount : session.uploadAttemptCount
  };
}

// Called only by the analysis coordinator (useMealPhotoAnalysis). Writes are gated on the caller
// still holding the current analysisRequestId + captureGeneration + actorKey + actorGeneration —
// see that hook for the actual stale-result / actor-switch discard checks (it reuses
// isMealPhotoUploadResultStillCurrent, not a second comparison); this setter trusts the caller
// already did them.
export function setMealPhotoAnalysisState(patch: {
  analysisInvocationStatus: MealPhotoAnalysisInvocationStatus;
  analysisCandidates?: MealPhotoAnalysisCandidate[];
  analysisStatus?: MealPhotoAnalysisStatus | null;
  requiresUserConfirmation?: boolean;
  analysisEngineVersion?: string | null;
  analysisPromptVersion?: string | null;
  analysisResponseSchemaVersion?: string | null;
  safeAnalysisErrorCode?: MealPhotoAnalysisClientErrorCode | null;
  analysisAttemptCount?: number;
  analysisStartedAt?: string | null;
  analysisCompletedAt?: string | null;
}) {
  const nextCandidates = patch.analysisCandidates !== undefined ? patch.analysisCandidates : session.analysisCandidates;
  // Whenever the candidate list itself changes (a fresh response replaced the previous one), any
  // existing local selection that no longer names one of the new candidates is dropped
  // automatically — a selection must never silently keep pointing at a candidate that no longer
  // exists. A patch that doesn't touch analysisCandidates never touches the selection either.
  const nextSelectedCandidateId =
    patch.analysisCandidates !== undefined && !nextCandidates.some((candidate) => candidate.candidateId === session.selectedCandidateId)
      ? null
      : session.selectedCandidateId;
  session = {
    ...session,
    analysisInvocationStatus: patch.analysisInvocationStatus,
    analysisCandidates: nextCandidates,
    selectedCandidateId: nextSelectedCandidateId,
    analysisStatus: patch.analysisStatus !== undefined ? patch.analysisStatus : session.analysisStatus,
    requiresUserConfirmation: patch.requiresUserConfirmation !== undefined ? patch.requiresUserConfirmation : session.requiresUserConfirmation,
    analysisEngineVersion: patch.analysisEngineVersion !== undefined ? patch.analysisEngineVersion : session.analysisEngineVersion,
    analysisPromptVersion: patch.analysisPromptVersion !== undefined ? patch.analysisPromptVersion : session.analysisPromptVersion,
    analysisResponseSchemaVersion:
      patch.analysisResponseSchemaVersion !== undefined ? patch.analysisResponseSchemaVersion : session.analysisResponseSchemaVersion,
    safeAnalysisErrorCode: patch.safeAnalysisErrorCode !== undefined ? patch.safeAnalysisErrorCode : session.safeAnalysisErrorCode,
    analysisAttemptCount: patch.analysisAttemptCount !== undefined ? patch.analysisAttemptCount : session.analysisAttemptCount,
    analysisStartedAt: patch.analysisStartedAt !== undefined ? patch.analysisStartedAt : session.analysisStartedAt,
    analysisCompletedAt: patch.analysisCompletedAt !== undefined ? patch.analysisCompletedAt : session.analysisCompletedAt
  };
}

// Explicit local-only candidate selection (MI-E-C5-A §十一): never writes any database, never
// implies a verified/confirmed result by itself. Selecting a candidateId that no longer exists in
// analysisCandidates (e.g. after a retry replaced the candidate list) is rejected — callers should
// re-derive a valid selection instead of trusting a stale one. (Automatic clearing of a selection
// that a *new* candidate list no longer contains happens in setMealPhotoAnalysisState itself, not
// here — this setter is only ever a direct response to a user's own selection gesture.)
export function setSelectedMealPhotoAnalysisCandidateId(candidateId: string | null) {
  if (candidateId !== null && !session.analysisCandidates.some((candidate) => candidate.candidateId === candidateId)) return;
  session = { ...session, selectedCandidateId: candidateId };
}

export function setMealPhotoFinalizationDraft(draft: MealPhotoFinalizationDraftState | null) {
  session = { ...session, mealPhotoFinalizationDraft: draft };
}

// MI-E-C5-R5: the primary best match is shown alone first; fallbacks stay hidden until the user
// explicitly rejects it. Persisted so leaving and returning to /analysis restores the same step
// rather than silently collapsing back to the primary-only view.
export function setMealPhotoFallbackRevealed(revealed: boolean) {
  session = { ...session, mealPhotoFallbackRevealed: revealed };
}

// MI-E-C5-R5: same-page completion authority. Only ever set from a durable finalization result
// (see buildCompletedMealPhotoAnalysisSnapshot, which returns null without durable result IDs),
// so a rerender can restore the completed screen without re-running any write.
export function setMealPhotoCompletion(snapshot: CompletedMealPhotoAnalysisSnapshot | null) {
  session = { ...session, mealPhotoCompletion: snapshot };
}
