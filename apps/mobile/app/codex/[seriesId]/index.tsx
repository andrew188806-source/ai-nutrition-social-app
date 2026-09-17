import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IpCodexDomain } from "@haocu/shared";
import { zhTW } from "../../../../../lib/i18n/zh-TW";
import { Card, SectionTitle, colors } from "../../../components/DemoUi";
import { PlaceholderScreen } from "../../../components/PlaceholderScreen.tsx";
import { CodexAssetImage } from "../../../features/ip-codex/CodexAssetImage";
import { CodexScaleComparison } from "../../../features/ip-codex/CodexScaleComparison";
import { fonts } from "../../../theme/tokens";

const { CODEX_MOCK_CATALOG, getSeries, listEntriesForSeries } = IpCodexDomain;

export default function CodexSeriesDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ seriesId?: string }>();
  const seriesId = Array.isArray(params.seriesId) ? params.seriesId[0] : params.seriesId;
  const t = zhTW.mobile.ipCodex;

  const series = seriesId ? getSeries(CODEX_MOCK_CATALOG, seriesId) : null;
  const entries = series ? listEntriesForSeries(CODEX_MOCK_CATALOG, series.id) : [];

  if (!series) {
    return (
      <PlaceholderScreen title={t.galleryTitle} subtitle={t.gallerySubtitle}>
        <Text style={styles.emptyText}>{t.emptySeries}</Text>
      </PlaceholderScreen>
    );
  }

  return (
    <PlaceholderScreen title={series.displayName} subtitle={series.description ?? t.seriesDetailSubtitle}>
      <Card>
        <View style={styles.hero}>
          <CodexAssetImage asset={series.coverAsset} variant="hero" />
        </View>
      </Card>

      {entries.length === 0 ? (
        <Text style={styles.emptyText}>{t.emptySeries}</Text>
      ) : (
        <>
          <SectionTitle title={t.scaleComparisonTitle} />
          <Card>
            <CodexScaleComparison entries={entries} />
          </Card>

          <View style={styles.grid}>
            {entries.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push({ pathname: "/codex/[seriesId]/[entryId]", params: { seriesId: series.id, entryId: entry.id } })}
                style={styles.cardWrap}
              >
                <Card>
                  <CodexAssetImage asset={entry.primaryAsset} variant="card" style={styles.entryImage} />
                  <Text style={styles.entryName} numberOfLines={1}>{entry.displayName ?? entry.id}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14
  },
  cardWrap: {
    width: "47%"
  },
  entryImage: {
    marginBottom: 8,
    alignSelf: "center"
  },
  entryName: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.black,
    fontWeight: "700",
    textAlign: "center"
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.body
  }
});
