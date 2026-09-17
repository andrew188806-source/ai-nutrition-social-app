import type { IpCodexDomain } from "@haocu/shared";
type CodexAsset = IpCodexDomain.CodexAsset;
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { resolveCodexAssetSource } from "./assetRegistry";
import { colors } from "../../components/DemoUi";

// C. UI display size — a pure rendering-layer concern, intentionally absent from the domain model
// (see packages/shared/src/domain/ip-codex/types.ts). Each named variant maps to a fixed baseline
// pixel height; callers doing a relative-scale comparison instead pass an explicit `scaleHeight`.
export type CodexDisplayVariant = "thumbnail" | "compact" | "card" | "detail" | "hero";

const VARIANT_HEIGHT: Record<CodexDisplayVariant, number> = {
  thumbnail: 48,
  compact: 72,
  card: 120,
  detail: 220,
  hero: 280
};

export interface CodexAssetImageProps {
  asset: CodexAsset;
  variant?: CodexDisplayVariant;
  /** Explicit pixel height, overriding `variant` — how the scale-comparison view renders relativeScale. */
  scaleHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single shared renderer for any Codex asset. Never stretches: the outer box always keeps the
 * asset's own intrinsic aspect ratio (falling back to 1:1 only when resolution is unknown), and the
 * image itself is additionally `resizeMode="contain"` so a missing/incorrect aspectRatio can never
 * crop the subject.
 */
export function CodexAssetImage({ asset, variant = "card", scaleHeight, style }: CodexAssetImageProps) {
  const source = resolveCodexAssetSource(asset.path);
  const aspectRatio = asset.resolution ? asset.resolution.width / asset.resolution.height : 1;
  const height = scaleHeight ?? VARIANT_HEIGHT[variant];

  return (
    <View style={[styles.box, { height, aspectRatio }, style]} accessible accessibilityLabel={asset.altText}>
      {source ? (
        <Image source={source} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.missing} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  image: {
    width: "100%",
    height: "100%"
  },
  missing: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.line,
    borderRadius: 8
  }
});
