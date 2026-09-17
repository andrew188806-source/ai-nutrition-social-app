import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IpCodexDomain } from "@haocu/shared";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, colors } from "../../components/DemoUi";
import { PlaceholderScreen } from "../../components/PlaceholderScreen.tsx";
import { CodexAssetImage } from "../../features/ip-codex/CodexAssetImage";
import { fonts } from "../../theme/tokens";

const { CODEX_MOCK_CATALOG, listSeries, entryCountForSeries } = IpCodexDomain;

export default function CodexSeriesGalleryScreen() {
  const router = useRouter();
  const t = zhTW.mobile.ipCodex;
  const seriesList = listSeries(CODEX_MOCK_CATALOG);

  return (
    <PlaceholderScreen title={t.galleryTitle} subtitle={t.gallerySubtitle}>
      <View style={styles.demoBanner}>
        <Text style={styles.demoBannerText}>{t.demoBadge}｜{t.demoNotice}</Text>
      </View>
      <View style={styles.grid}>
        {seriesList.map((series) => (
          <Pressable
            key={series.id}
            onPress={() => router.push({ pathname: "/codex/[seriesId]", params: { seriesId: series.id } })}
            style={styles.cardWrap}
          >
            <Card>
              <CodexAssetImage asset={series.coverAsset} variant="card" style={styles.cover} />
              <Text style={styles.seriesName} numberOfLines={1}>{series.displayName}</Text>
              <Text style={styles.entryCount}>{entryCountForSeries(CODEX_MOCK_CATALOG, series.id)} {t.entryCountLabel}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  demoBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.amber,
    padding: 10
  },
  demoBannerText: {
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.body
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14
  },
  cardWrap: {
    width: "47%"
  },
  cover: {
    marginBottom: 10,
    alignSelf: "center"
  },
  seriesName: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.black,
    fontWeight: "700"
  },
  entryCount: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 2
  }
});
