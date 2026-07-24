import { zhTW } from "../../../../lib/i18n/zh-TW";
import type {
  MealIdentificationCandidate,
  MealSourceContext
} from "../meal-identification";
import type {
  CorrectionSectionKey,
  MatchState,
  MealAnalysisMode,
  MealPhotoCaptureMethod,
  MealRecordTimingChoice
} from "./types";

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
  // MI-E-B2: capture provenance and actual-meal-time intent. Mobile-flow-only fields —
  // captureMethod is never sent to the finalization contract; recordTiming/occurredAt
  // map directly onto the frozen MI-E-B1 v2 fields of the same name.
  captureMethod: MealPhotoCaptureMethod | null;
  recordTiming: MealRecordTimingChoice;
  recordTimingConfirmed: boolean;
  occurredAt: string | null;
  postHocDateKey: string | null;
  postHocTimeKey: string | null;
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
    recordTiming: "current",
    recordTimingConfirmed: false,
    occurredAt: null,
    postHocDateKey: null,
    postHocTimeKey: null
  };
}

let session: AnalysisSessionState = createDefaultSession();

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

// Called once per new photo, from the meal-photo capture/upload entry point, before
// navigating to /analysis. Starts a fresh session (same guarantee as resetAnalysisSession)
// and records how this session's photo was obtained. Camera sessions are "current" and
// already confirmed (occurredAt = the moment of capture/entry, no further choice needed);
// gallery sessions start unconfirmed so analysis.tsx must show the current/post-hoc prompt.
export function beginAnalysisCapture(method: MealPhotoCaptureMethod, capturedAt: Date = new Date()) {
  session = createDefaultSession();
  session.captureMethod = method;
  if (method === "camera") {
    session.recordTiming = "current";
    session.recordTimingConfirmed = true;
    session.occurredAt = capturedAt.toISOString();
  }
}
