import type { ImageSourcePropType } from "react-native";

// Resolves a CodexAsset.path key (an opaque domain-layer string) to a real React Native image
// source. The domain layer (`@haocu/shared`) stays platform-agnostic and never holds a `require()`
// result; only this file, and only the mobile app, knows how a path key becomes bytes on screen.
//
// DEMO art is reused from apps/mobile/assets/mascots/* purely for its image bytes — this file does
// not import or depend on that directory's own SystemMascot / mascotAvatarKey system in any way.
const DEMO_ASSET_SOURCES: Record<string, ImageSourcePropType> = {
  balance: require("../../assets/mascots/balance.png"),
  dessert: require("../../assets/mascots/dessert.png"),
  explorer: require("../../assets/mascots/explorer.png"),
  fastfood: require("../../assets/mascots/fastfood.png"),
  latenight: require("../../assets/mascots/latenight.png"),
  lowcarb: require("../../assets/mascots/lowcarb.png"),
  protein: require("../../assets/mascots/protein.png"),
  veggie: require("../../assets/mascots/veggie.jpg")
};

export function resolveCodexAssetSource(path: string): ImageSourcePropType | null {
  return DEMO_ASSET_SOURCES[path] ?? null;
}

export function isResolvableCodexAssetPath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEMO_ASSET_SOURCES, path);
}
