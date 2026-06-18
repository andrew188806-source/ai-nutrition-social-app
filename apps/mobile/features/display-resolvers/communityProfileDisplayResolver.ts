import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getCommunityCardSettings, getSelectedMascot, type SystemMascot } from "../community-card-settings";
import { getDemoUserPlan } from "../demo-user-plan";
import { getMockProfile } from "../meal-buddy-card";
import type { AvatarSource, CommunityProfileDisplay, CommunityProfileMode } from "./types";

const currentUserIds = new Set(["demo-user", "current-user", "me", "self", "community-card"]);
const mascots = zhTW.mobile.communityCardSettings.mascots as readonly SystemMascot[];
const unknownMascot = mascots[0];

// DEMO_ONLY display resolver guard:
// profileId is canonical. Free mode may swap avatarSource to mascot, but it must
// not replace the person's displayName with anonymousName.
export function getCommunityProfileByProfileId(profileId: string) {
  return getMockProfile(profileId) ?? null;
}

export function resolveCommunityProfileDisplay(profileId: string | null | undefined, mode?: "anonymous" | "free" | "premium" | "paid"): CommunityProfileDisplay {
  if (!profileId) {
    return unknownCommunityProfileDisplay();
  }

  if (currentUserIds.has(profileId)) {
    return resolveCurrentUserCommunityProfile();
  }

  const profile = getCommunityProfileByProfileId(profileId);
  if (!profile) {
    return unknownCommunityProfileDisplay();
  }

  const isPaid = mode ? mode === "premium" || mode === "paid" : getDemoUserPlan() === "premium";
  const mascot = resolveMascot(profile.mascotId);

  // Free / anonymous mode: mascot avatar only. The person's displayName stays stable.
  // Paid / real mode: placeholder real-photo avatar + display name.
  let avatarSource: AvatarSource;
  if (isPaid && profile.realAvatarKey) {
    avatarSource = { type: "photo", photoUrl: profile.realAvatarUrl ?? profile.realAvatar ?? null, assetKey: profile.realAvatarKey };
  } else if (profile.mascotId) {
    avatarSource = { type: "mascot", mascotId: profile.mascotId, assetKey: mascot?.assetKey };
  } else {
    avatarSource = { type: "initial", value: profile.avatar };
  }

  const displayName = profile.displayName;
  const profileMode: CommunityProfileMode = isPaid
    ? (profile.realAvatarKey ? "premium_real_photo" : "premium_anonymous")
    : profile.verified
    ? "premium_anonymous"
    : "free_anonymous";

  return {
    displayName,
    avatarSource,
    mascotId: profile.mascotId ?? null,
    selectedMascotName: mascot?.name ?? null,
    photoUrl: isPaid ? profile.realAvatarUrl ?? profile.realAvatar ?? null : null,
    profileMode,
    isPremium: profile.verified,
    shortProfileSummary: profile.intro,
    tags: [...profile.tags]
  };
}

export function unknownCommunityProfileDisplay(): CommunityProfileDisplay {
  return {
    displayName: "未知飯友",
    avatarSource: unknownMascot ? { type: "mascot", mascotId: unknownMascot.id, assetKey: unknownMascot.assetKey } : { type: "none" },
    mascotId: unknownMascot?.id ?? null,
    selectedMascotName: unknownMascot?.name ?? null,
    photoUrl: null,
    profileMode: "unknown",
    isPremium: false,
    shortProfileSummary: "",
    tags: []
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
    displayName: settings.nickname,
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
