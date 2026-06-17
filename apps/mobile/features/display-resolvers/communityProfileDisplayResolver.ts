import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getCommunityCardSettings, getSelectedMascot, type SystemMascot } from "../community-card-settings";
import { getDemoUserPlan } from "../demo-user-plan";
import { getMockProfile } from "../meal-buddy-card";
import type { AvatarSource, CommunityProfileDisplay, CommunityProfileMode } from "./types";

const currentUserIds = new Set(["demo-user", "current-user", "me", "self", "community-card"]);
const mascots = zhTW.mobile.communityCardSettings.mascots as readonly SystemMascot[];

export function resolveCommunityProfileDisplay(profileIdOrCommunityCardId: string): CommunityProfileDisplay | null {
  if (currentUserIds.has(profileIdOrCommunityCardId)) {
    return resolveCurrentUserCommunityProfile();
  }

  const profile = getMockProfile(profileIdOrCommunityCardId);
  if (!profile) {
    return null;
  }

  const mascot = resolveMascot(profile.mascotId);
  const avatarSource: AvatarSource = profile.mascotId
    ? { type: "mascot", mascotId: profile.mascotId, assetKey: mascot?.assetKey }
    : { type: "initial", value: profile.avatar };

  return {
    displayName: profile.name,
    avatarSource,
    mascotId: profile.mascotId ?? null,
    selectedMascotName: mascot?.name ?? null,
    photoUrl: null,
    profileMode: profile.verified ? "premium_anonymous" : "free_anonymous",
    isPremium: profile.verified,
    shortProfileSummary: profile.intro,
    tags: [...profile.tags]
  };
}

function resolveCurrentUserCommunityProfile(): CommunityProfileDisplay {
  const settings = getCommunityCardSettings();
  const selectedMascot = getSelectedMascot(settings);
  const isPremium = getDemoUserPlan() === "premium";
  const profileMode = resolveCurrentUserProfileMode(isPremium, settings.hasUploadedPhoto);
  const photoUrl = null;
  const avatarSource: AvatarSource =
    profileMode === "premium_real_photo"
      ? { type: "photo", photoUrl, assetKey: settings.privateAvatarAssetKey }
      : { type: "mascot", mascotId: settings.publicMascotAvatarId || selectedMascot.id, assetKey: selectedMascot.assetKey };

  return {
    displayName: isPremium ? settings.nickname : selectedMascot.name,
    avatarSource,
    mascotId: settings.publicMascotAvatarId || selectedMascot.id,
    selectedMascotName: selectedMascot.name,
    photoUrl,
    profileMode,
    isPremium,
    shortProfileSummary: settings.intro,
    tags: uniqueStrings([...settings.selectedEatingTags, ...settings.selectedHealthTags, ...settings.selectedBuddyTags, ...selectedMascot.tags])
  };
}

function resolveCurrentUserProfileMode(isPremium: boolean, hasUploadedPhoto: boolean): CommunityProfileMode {
  if (!isPremium) {
    return "free_anonymous";
  }
  return hasUploadedPhoto ? "premium_real_photo" : "premium_anonymous";
}

function resolveMascot(mascotId?: string | null) {
  if (!mascotId) {
    return null;
  }
  return mascots.find((mascot) => mascot.id === mascotId) ?? null;
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}
