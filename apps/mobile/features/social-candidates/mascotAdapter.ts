import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { SystemMascot } from "../community-card-settings/types";

// SR-2E frozen mascot policy: the server's `mascotAvatarKey` carries a SystemMascot.assetKey.
//
// The existing asset renderer (theme/components.tsx getMascotSource) keys on the mascot ID, not the
// assetKey, so this adapter is the one narrow translation between them. It deliberately does NOT
// reuse the DEMO_ONLY community profile resolver, which is mock-backed and emits verification,
// premium, real-avatar and tag fields SR-2C forbids.
//
// An unrecognised key resolves to the existing unknown/fallback mascot. It never throws, never hides
// or reorders the candidate, never mutates the candidate, and is never written back to the server.
const MASCOTS = zhTW.mobile.communityCardSettings.mascots as readonly SystemMascot[];
const UNKNOWN_MASCOT = MASCOTS[0];

export type SocialCandidateMascot = Readonly<{
  mascotId: string;
  assetKey: string;
  name: string;
  resolvedFromKey: boolean;
}>;

export function resolveSocialCandidateMascot(mascotAvatarKey: string): SocialCandidateMascot {
  const matched = MASCOTS.find((mascot) => mascot.assetKey === mascotAvatarKey) ?? null;
  const mascot = matched ?? UNKNOWN_MASCOT;
  return Object.freeze({
    mascotId: mascot.id,
    assetKey: mascot.assetKey,
    name: mascot.name,
    resolvedFromKey: matched !== null
  });
}
