import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getConsumerClientStateScope, subscribeConsumerClientStateScope } from "../consumer-auth/clientStateScope";
import type { CommunityCardSettingsState, SystemMascot, VisibilityLevel } from "./types";

const mascots = zhTW.mobile.communityCardSettings.mascots as readonly SystemMascot[];

let loadedActorKey: string | null = null;

function defaultSettings(): CommunityCardSettingsState {
  return {
  age: zhTW.mobile.communityCardSettings.ageValue,
  gender: zhTW.mobile.communityCardSettings.genderValue,
  nickname: zhTW.mobile.communityCardSettings.nicknameValue,
  intro: zhTW.mobile.communityCardSettings.introValue,
  selectedEatingTags: zhTW.mobile.communityCardSettings.eatingPreferenceTags.slice(0, 3),
  selectedHealthTags: zhTW.mobile.communityCardSettings.healthGoalTags.slice(0, 2),
  selectedBuddyTags: zhTW.mobile.communityCardSettings.mealBuddyTypeTags.slice(0, 3),
  avoidedFoods: zhTW.mobile.communityCardSettings.avoidedFoodsOptions.slice(0, 2),
  dietTypes: zhTW.mobile.communityCardSettings.dietTypeOptions.slice(0, 2),
  spicePreference: zhTW.mobile.communityCardSettings.spicePreferenceOptions[1],
  gatheringStyle: zhTW.mobile.communityCardSettings.gatheringStyleOptions[1],
  paymentPreference: zhTW.mobile.communityCardSettings.paymentPreferenceOptions[0],
  areaVisibility: zhTW.mobile.communityCardSettings.areaVisibilityOptions[0],
  calorieGoalVisibility: zhTW.mobile.communityCardSettings.calorieGoalVisibilityOptions[0],
  breakfastTime: zhTW.mobile.communityCardSettings.mealTimeDefaults.breakfast,
  lunchTime: zhTW.mobile.communityCardSettings.mealTimeDefaults.lunch,
  dinnerTime: zhTW.mobile.communityCardSettings.mealTimeDefaults.dinner,
  lateNightTime: zhTW.mobile.communityCardSettings.mealTimeDefaults.lateNight,
  selectedMascotId: mascots[0].id,
  privateAvatarAssetKey: null,
  publicMascotAvatarId: mascots[0].id,
  hasUploadedPhoto: false,
  fieldVisibility: Object.fromEntries(zhTW.mobile.communityCardSettings.privacyFields.map((field) => [field.id, "public" as VisibilityLevel]))
  };
}

let savedSettings: CommunityCardSettingsState = defaultSettings();

subscribeConsumerClientStateScope(() => {
  loadedActorKey = null;
  savedSettings = defaultSettings();
});

export function getCommunityCardSettings() {
  ensureActorState();
  return savedSettings;
}

export function saveCommunityCardSettings(nextSettings: CommunityCardSettingsState) {
  ensureActorState();
  savedSettings = {
    ...nextSettings,
    selectedEatingTags: [...nextSettings.selectedEatingTags],
    selectedHealthTags: [...nextSettings.selectedHealthTags],
    selectedBuddyTags: [...nextSettings.selectedBuddyTags],
    avoidedFoods: [...nextSettings.avoidedFoods],
    dietTypes: [...nextSettings.dietTypes],
    fieldVisibility: { ...nextSettings.fieldVisibility }
  };
}

export function getSelectedMascot(settings?: CommunityCardSettingsState) {
  ensureActorState();
  const resolvedSettings = settings ?? savedSettings;
  return mascots.find((mascot) => mascot.id === resolvedSettings.selectedMascotId) ?? mascots[0];
}

function ensureActorState() {
  const actorKey = getConsumerClientStateScope().actorKey;
  if (actorKey === loadedActorKey) return;
  loadedActorKey = actorKey;
  // This compatibility-only mock has no server persistence.  It is session
  // state, so a different Consumer must start from the neutral defaults.
  savedSettings = defaultSettings();
}
