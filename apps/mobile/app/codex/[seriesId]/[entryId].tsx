import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IpCodexDomain } from "@haocu/shared";
import { zhTW } from "../../../../../lib/i18n/zh-TW";
import { Card, SectionTitle, colors } from "../../../components/DemoUi";
import { PlaceholderScreen } from "../../../components/PlaceholderScreen.tsx";
import { CodexAssetImage } from "../../../features/ip-codex/CodexAssetImage";
import { fonts } from "../../../theme/tokens";

const { CODEX_MOCK_CATALOG, getSeries, getSeriesEntry, getCharacter, listOtherAppearances } = IpCodexDomain;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function CodexSeriesEntryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ seriesId?: string; entryId?: string }>();
  const seriesId = firstParam(params.seriesId);
  const entryId = firstParam(params.entryId);
  const t = zhTW.mobile.ipCodex;

  const series = seriesId ? getSeries(CODEX_MOCK_CATALOG, seriesId) : null;
  const entry = entryId ? getSeriesEntry(CODEX_MOCK_CATALOG, entryId) : null;
  const character = entry ? getCharacter(CODEX_MOCK_CATALOG, entry.characterId) : null;
  const otherAppearances = entry && series ? listOtherAppearances(CODEX_MOCK_CATALOG, entry.characterId, series.id) : [];

  if (!series || !entry) {
    return (
      <PlaceholderScreen title={t.galleryTitle} subtitle={t.gallerySubtitle}>
        <Text style={styles.emptyText}>{t.emptySeries}</Text>
      </PlaceholderScreen>
    );
  }

  const dims = entry.physicalDimensions;

  return (
    <PlaceholderScreen title={entry.displayName ?? entry.id} subtitle={series.displayName}>
      <Card>
        <View style={styles.hero}>
          <CodexAssetImage asset={entry.primaryAsset} variant="hero" />
        </View>
      </Card>

      <Card>
        <Text style={styles.metaLabel}>{t.entryDetailSeriesLabel}</Text>
        <Text style={styles.metaValue}>{series.displayName}</Text>
        {character && character.displayName !== entry.displayName ? (
          <>
            <Text style={[styles.metaLabel, styles.metaSpacing]}>{t.characterLabel}</Text>
            <Text style={styles.metaValue}>{character.displayName}</Text>
          </>
        ) : null}
        {typeof entry.relativeScale === "number" ? (
          <>
            <Text style={[styles.metaLabel, styles.metaSpacing]}>{t.relativeScaleLabel}</Text>
            <Text style={styles.metaValue}>{entry.relativeScale.toFixed(2)}x</Text>
          </>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title={t.physicalDimensionsTitle} />
        {dims ? (
          <View style={styles.dimensionsRow}>
            <Text style={styles.metaValue}>{t.heightLabel} {dims.height}{dims.unit}</Text>
            {dims.width !== undefined ? <Text style={styles.metaValue}>{t.widthLabel} {dims.width}{dims.unit}</Text> : null}
            {dims.depth !== undefined ? <Text style={styles.metaValue}>{t.depthLabel} {dims.depth}{dims.unit}</Text> : null}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t.physicalDimensionsMissing}</Text>
        )}
      </Card>

      {entry.description ? (
        <Card>
          <SectionTitle title={t.descriptionTitle} />
          <Text style={styles.description}>{entry.description}</Text>
        </Card>
      ) : null}

      {otherAppearances.length > 0 ? (
        <Card>
          <SectionTitle title={t.otherAppearancesTitle} />
          <View style={styles.otherRow}>
            {otherAppearances.map((appearance) => {
              const appearanceSeries = getSeries(CODEX_MOCK_CATALOG, appearance.seriesId);
              return (
                <Pressable
                  key={appearance.id}
                  onPress={() => router.push({ pathname: "/codex/[seriesId]/[entryId]", params: { seriesId: appearance.seriesId, entryId: appearance.id } })}
                  style={styles.otherItem}
                >
                  <CodexAssetImage asset={appearance.primaryAsset} variant="compact" />
                  <Text style={styles.otherLabel} numberOfLines={1}>{appearanceSeries?.displayName ?? appearance.seriesId}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center"
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.body
  },
  metaSpacing: {
    marginTop: 10
  },
  metaValue: {
    color: colors.ink,
    fontSize: 16,
    fontFamily: fonts.black,
    fontWeight: "700"
  },
  dimensionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  description: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.body
  },
  otherRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14
  },
  otherItem: {
    alignItems: "center",
    gap: 6,
    width: 88
  },
  otherLabel: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.body,
    textAlign: "center"
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.body
  }
});
