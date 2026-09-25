import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { BottomNav } from "../components/DemoUi";
import { createMobileConsumerFavoriteComposition } from "../features/consumer-favorites/consumerFavoriteComposition";
import { useConsumerFavoriteList } from "../features/consumer-favorites/consumerFavoriteUiModel";
import type { ConsumerFavoriteRecord, ConsumerMenuItemFavoriteTarget } from "../features/consumer-favorites/types";
import { toDateKeyInTimeZone } from "../features/consumer-meals/mealDateTime";
import type { ConsumerMealRecord } from "../features/consumer-meals/types";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { useRestaurantCatalog } from "../features/restaurants/catalog";
import { Card, SectionHeader } from "../theme/components";
import { fonts, radius, snowPalette as colors } from "../theme/tokens";

type MealLogReadState =
  | { queryKey: string; status: "loading" | "unavailable" | "signInRequired"; records: null }
  | { queryKey: string; status: "ready"; records: ConsumerMealRecord[] };

const copy = zhTW.mobile.mealLog.canonical;

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function MealLogScreen() {
  const router = useRouter();
  const runtime = useConsumerRuntime();
  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [readState, setReadState] = useState<MealLogReadState>({ queryKey: "", status: "loading", records: null });
  const timezone = runtime.state.profileState.status === "available" ? runtime.state.profileState.profile.timezone : null;
  const authStatus = runtime.state.authState.status;
  const profileStatus = runtime.state.profileState.status;
  const signedIn = authStatus === "signedIn";
  const service = runtime.mealRecordsService;
  const dateWindow = useMemo(() => {
    if (!timezone) return null;
    try {
      const endDate = shiftDateKey(toDateKeyInTimeZone(new Date(), timezone), weekOffset * 7);
      return { startDate: shiftDateKey(endDate, -6), endDate, limit: 100 };
    } catch {
      return null;
    }
  }, [timezone, weekOffset, refreshVersion]);
  const queryKey = [runtime.state.actorKey, runtime.state.actorGeneration, authStatus, profileStatus, dateWindow?.startDate, dateWindow?.endDate, runtime.mealDataRevision, refreshVersion].join(":");
  const visibleReadState: MealLogReadState = readState.queryKey === queryKey
    ? readState
    : { queryKey, status: "loading", records: null };

  useEffect(() => {
    let cancelled = false;
    if (authStatus === "initializing" || (signedIn && (profileStatus === "idle" || profileStatus === "loading"))) {
      setReadState({ queryKey, status: "loading", records: null });
      return () => { cancelled = true; };
    }
    if (authStatus === "signedOut") {
      setReadState({ queryKey, status: "signInRequired", records: null });
      return () => { cancelled = true; };
    }
    if (!service || !dateWindow) {
      setReadState({ queryKey, status: "unavailable", records: null });
      return () => { cancelled = true; };
    }
    setReadState({ queryKey, status: "loading", records: null });
    void service.listCurrentUserMealRecords(dateWindow).then((result) => {
      if (cancelled) return;
      setReadState(result.ok
        ? { queryKey, status: "ready", records: result.value }
        : { queryKey, status: "unavailable", records: null });
    }).catch(() => {
      if (!cancelled) setReadState({ queryKey, status: "unavailable", records: null });
    });
    return () => { cancelled = true; };
  }, [authStatus, profileStatus, signedIn, service, dateWindow, runtime.state.actorKey, runtime.state.actorGeneration, runtime.mealDataRevision, refreshVersion]);

  const groups = visibleReadState.status === "ready"
    ? visibleReadState.records.reduce<Record<string, ConsumerMealRecord[]>>((byDate, record) => {
        (byDate[record.mealDate] ??= []).push(record);
        return byDate;
      }, {})
    : {} as Record<string, ConsumerMealRecord[]>;
  const dates = Object.keys(groups).sort((left, right) => right.localeCompare(left));

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{copy.title}</Text>
        <Card>
          <SectionHeader title={copy.recentWindow} subtitle={copy.boundedWindow} />
          {dateWindow ? <Text style={styles.meta}>{dateWindow.startDate} – {dateWindow.endDate}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setWeekOffset((value) => value - 1)}><Text style={styles.action}>{copy.previousWeek}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={weekOffset >= 0} onPress={() => setWeekOffset((value) => Math.min(0, value + 1))}><Text style={styles.action}>{copy.nextWeek}</Text></Pressable>
          </View>
          {visibleReadState.status === "loading" ? <Text style={styles.message}>{copy.loading}</Text> : null}
          {visibleReadState.status === "signInRequired" ? <Text style={styles.message}>{copy.signInRequired}</Text> : null}
          {visibleReadState.status === "unavailable" ? (
            <View style={styles.stack}>
              <Text style={styles.message}>{copy.unavailable}</Text>
              <Pressable accessibilityRole="button" onPress={() => setRefreshVersion((value) => value + 1)}><Text style={styles.action}>{copy.retry}</Text></Pressable>
            </View>
          ) : null}
          {visibleReadState.status === "ready" && visibleReadState.records.length === 0 ? <Text style={styles.message}>{copy.empty}</Text> : null}
          {visibleReadState.status === "ready" ? dates.map((date) => (
            <View key={date} style={styles.day}>
              <Text style={styles.dayTitle}>{date}</Text>
              {(groups[date] ?? []).map((record) => (
                <View key={record.mealRecordId} style={styles.meal}>
                  <Text style={styles.mealTitle}>{record.title || record.items.map((item) => item.displayName).join("、") || copy.mealTypes[record.mealType]}</Text>
                  <Text style={styles.meta}>{copy.mealTypes[record.mealType]} · {copy.sources[record.source]}</Text>
                  {record.items.map((item) => (
                    <Text key={item.mealRecordItemId} style={styles.item}>
                      {item.displayName}{item.portion ? ` · ${item.portion}` : ""}
                      {typeof item.nutrition.calories === "number" && Number.isFinite(item.nutrition.calories)
                        ? ` · ${item.nutrition.calories} kcal` : ""}
                    </Text>
                  ))}
                  {record.note ? <Text style={styles.item}>{record.note}</Text> : null}
                  {!record.items.some((item) => typeof item.nutrition.calories === "number" && Number.isFinite(item.nutrition.calories))
                    ? <Text style={styles.meta}>{copy.noNutrition}</Text> : null}
                </View>
              ))}
            </View>
          )) : null}
          {visibleReadState.status === "ready" && visibleReadState.records.length === 100 ? <Text style={styles.message}>{copy.recordLimit}</Text> : null}
        </Card>
        <MealLogFavorites key={`${runtime.state.actorKey ?? "signed-out"}:${runtime.state.actorGeneration}:${authStatus}`} />
        <Pressable accessibilityRole="button" onPress={() => router.push("/today-intake")}><Text style={styles.action}>{copy.viewToday}</Text></Pressable>
        <BottomNav />
      </ScrollView>
    </View>
  );
}

function MealLogFavorites() {
  const runtime = useConsumerRuntime();
  const restaurantCatalog = useRestaurantCatalog();
  const service = runtime.mealRecordsService;
  const favoritesComposition = useMemo(() => {
    if (!service || runtime.mode !== "supabase") return null;
    try { return createMobileConsumerFavoriteComposition(); } catch { return null; }
  }, [service, runtime.mode]);
  const favorites = useConsumerFavoriteList({
    service: favoritesComposition?.service ?? null,
    entityType: "menu_item",
    enabled: runtime.state.authState.status === "signedIn" && Boolean(service)
  });
  return <Card>
          <SectionHeader title={copy.favoritesTitle} />
          {favorites.status === "loading" ? <Text style={styles.message}>{zhTW.mobile.consumerFavorites.loading}</Text> : null}
          {favorites.status === "idle" || favorites.status === "disabled"
            ? <Text style={styles.message}>{zhTW.mobile.consumerFavorites.disabled}</Text> : null}
          {favorites.status === "unauthenticated" ? <Text style={styles.message}>{zhTW.mobile.consumerFavorites.loginRequired}</Text> : null}
          {favorites.status === "failed" ? <Text style={styles.message}>{zhTW.mobile.consumerFavorites.failed}</Text> : null}
          {favorites.status === "empty" ? <Text style={styles.message}>{zhTW.mobile.consumerFavorites.empty}</Text> : null}
          {favorites.status === "loaded" && restaurantCatalog.state.status !== "success"
            ? <Text style={styles.message}>{copy.favoritesUnavailable}</Text> : null}
          {favorites.status === "loaded" && restaurantCatalog.state.status === "success" ? favorites.records.map((favorite) => {
            const target = favorite.target as ConsumerMenuItemFavoriteTarget;
            const item = restaurantCatalog.findMenuItemById(target.menuItemId);
            const restaurant = restaurantCatalog.findRestaurantById(target.restaurantId);
            return <LiveFavoriteFoodCard key={favorite.favoriteId} record={favorite} menuItemName={item?.name} restaurantName={restaurant?.name} />;
          }) : null}
        </Card>;
}

function LiveFavoriteFoodCard({ record, menuItemName, restaurantName }: {
  record: ConsumerFavoriteRecord;
  menuItemName?: string;
  restaurantName?: string;
}) {
  return <View style={styles.meal}>
    <Text style={styles.mealTitle}>{menuItemName ?? record.collectionLabel ?? zhTW.mobile.consumerFavorites.listTitle}</Text>
    {restaurantName ? <Text style={styles.meta}>{restaurantName}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 24 },
  stack: { gap: 10 },
  actions: { flexDirection: "row", gap: 24, marginVertical: 12 },
  action: { color: colors.primaryDeep, fontFamily: fonts.medium, fontSize: 14 },
  message: { color: colors.sub, fontFamily: fonts.body, fontSize: 14, marginTop: 12 },
  meta: { color: colors.sub, fontFamily: fonts.body, fontSize: 12, marginTop: 6 },
  day: { gap: 10, marginTop: 16 },
  dayTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  meal: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: radius.base, padding: 12, gap: 4 },
  mealTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  item: { color: colors.ink, fontFamily: fonts.body, fontSize: 13 }
});
