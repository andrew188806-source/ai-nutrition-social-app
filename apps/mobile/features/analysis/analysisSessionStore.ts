import { zhTW } from "../../../../lib/i18n/zh-TW";
import type {
  MealIdentificationCandidate,
  MealSourceContext
} from "../meal-identification";
import { generateMealPhotoAnalysisRequestId } from "../meal-photo-upload/requestId";
import type { MealPhotoUploadErrorCode } from "../meal-photo-upload/types";
import type {
  CorrectionSectionKey,
  MatchState,
  MealAnalysisMode,
  MealPhotoCaptureMethod,
  MealRecordTimingChoice
} from "./types";

export type MealPhotoUploadStatus = "not_started" | "uploading" | "uploaded" | "failed";

export type AnalysisSessionState = {
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
};

function createDefaultSession(): AnalysisSessionState {
  return {
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
    uploadedAt: null
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

// Called once per new photo, from the meal-photo capture/upload entry point, after a
// real photo has actually been captured or picked (never on cancellation or permission
// denial), before navigating to /analysis. Starts a fresh session (same guarantee as
// resetAnalysisSession) and records how this session's photo was obtained. Camera
// sessions are "current" and already confirmed (occurredAt = the moment the photo was
// accepted, no further choice needed); photo_library sessions start unconfirmed so
// analysis.tsx must show the current/post-hoc prompt.
export function beginAnalysisCapture(
  method: MealPhotoCaptureMethod,
  imageUri: string,
  capturedAt: Date = new Date(),
  mimeType: string | null = null,
  fileName: string | null = null
) {
  captureGenerationCounter += 1;
  session = createDefaultSession();
  session.captureMethod = method;
  session.capturedImageUri = imageUri;
  session.capturedImageMimeType = mimeType;
  session.capturedImageFileName = fileName;
  session.analysisRequestId = generateMealPhotoAnalysisRequestId();
  session.captureGeneration = captureGenerationCounter;
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
