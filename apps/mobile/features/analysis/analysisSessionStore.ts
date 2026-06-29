import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { CorrectionSectionKey, MatchState, MealAnalysisMode } from "./types";

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
  correctedRows: Record<string, boolean>;
  selectedMealPeriod: string;
  mealSaved: boolean;
  autoSavedConfirmedMeal: boolean;
  mealId: string;
  preMealPhotoIds: string[];
  guiltSharingResult: { peopleCount: number; sharedCaloriesPerPerson: number } | null;
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
    correctedRows: {},
    selectedMealPeriod: zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1],
    mealSaved: false,
    autoSavedConfirmedMeal: false,
    mealId: "",
    preMealPhotoIds: [],
    guiltSharingResult: null
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
