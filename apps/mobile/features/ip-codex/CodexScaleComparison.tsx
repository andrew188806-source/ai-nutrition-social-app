import type { IpCodexDomain } from "@haocu/shared";
type CodexSeriesEntry = IpCodexDomain.CodexSeriesEntry;
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CodexAssetImage } from "./CodexAssetImage";
import { colors } from "../../components/DemoUi";
import { fonts } from "../../theme/tokens";
import { zhTW } from "../../../../lib/i18n/zh-TW";

// A. 相對比例 — the baseline height in px that relativeScale = 1.0 renders at within a Series'
// shared scale context. This number has no physical meaning; it exists only so every entry in the
// same comparison shares one anchor and their heights stay mutually proportional.
const SCALE_BASELINE_HEIGHT = 140;
const MIN_RENDER_HEIGHT = 36;
const MAX_RENDER_HEIGHT = 260;

export interface CodexScaleComparisonProps {
  entries: readonly CodexSeriesEntry[];
}

/** Renders a Series' entries side by side, each sized proportionally to its own relativeScale
 * against one shared baseline — never uniformly resized to the same height. */
export function CodexScaleComparison({ entries }: CodexScaleComparisonProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {entries.map((entry) => {
        const hasScale = typeof entry.relativeScale === "number";
        const height = hasScale
          ? clamp(SCALE_BASELINE_HEIGHT * (entry.relativeScale as number), MIN_RENDER_HEIGHT, MAX_RENDER_HEIGHT)
          : SCALE_BASELINE_HEIGHT;
        return (
          <View key={entry.id} style={styles.item}>
            <View style={styles.imageSlot}>
              <CodexAssetImage asset={entry.primaryAsset} scaleHeight={height} />
            </View>
            <Text style={styles.name} numberOfLines={1}>{entry.displayName ?? entry.id}</Text>
            <Text style={styles.scaleLabel}>
              {hasScale ? `${zhTW.mobile.ipCodex.relativeScaleLabel} ${(entry.relativeScale as number).toFixed(2)}x` : zhTW.mobile.ipCodex.scaleUnknown}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 18,
    paddingHorizontal: 4,
    paddingVertical: 12
  },
  item: {
    alignItems: "center",
    gap: 6,
    width: 96
  },
  imageSlot: {
    justifyContent: "flex-end"
  },
  name: {
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: "center"
  },
  scaleLabel: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.body
  }
});
