import type { CommunityCardSettingsState, SystemMascot } from "./types";

export type AvatarDisplayContext = "normal" | "anonymous" | "free" | "tableHost" | "owner";

export function getAvatarDisplayLabel({
  context,
  mascot,
  settings
}: {
  context: AvatarDisplayContext;
  mascot: SystemMascot;
  settings: CommunityCardSettingsState;
}) {
  const avatarPrivacy = settings.fieldVisibility.avatar ?? "public";

  if (context === "tableHost") {
    return settings.privateAvatarAssetKey ?? mascot.assetKey;
  }

  if (context === "owner") {
    return settings.privateAvatarAssetKey ?? mascot.assetKey;
  }

  if (avatarPrivacy === "private") {
    return mascot.assetKey;
  }

  if (context === "free" || context === "anonymous") {
    return settings.privateAvatarAssetKey ?? mascot.assetKey;
  }

  return settings.privateAvatarAssetKey ?? mascot.assetKey;
}
