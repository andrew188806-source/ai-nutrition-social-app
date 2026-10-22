import { NotoSansTC_400Regular, NotoSansTC_500Medium, NotoSansTC_700Bold, NotoSansTC_900Black } from "@expo-google-fonts/noto-sans-tc";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import { loadAsync, useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { ConsumerRuntimeNavigationGate, ConsumerRuntimeProvider } from "../features/consumer-runtime";
import { ConsumerLocationProvider } from "../features/consumer-location/ConsumerLocationProvider";
import { snowPalette } from "../theme/tokens";

const appFonts = { NotoSansTC_400Regular, NotoSansTC_500Medium, NotoSansTC_700Bold, NotoSansTC_900Black, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold };

// Typography is optional: it must not prevent Auth initialization or leave the product blank.
function FontStatusNotice() {
  const [loaded, fontError] = useFonts(appFonts);
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (loaded || retried) return;
    const timer = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [loaded, retried]);
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([loadAsync(appFonts), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("FONT_TIMEOUT")), 15000); })]);
      setRetried(true); setFailed(false);
    } catch { setFailed(true); }
    finally { if (timer !== undefined) clearTimeout(timer); setRetrying(false); }
  }
  if (loaded || retried || (!failed && !fontError)) return null;
  return <View style={{ padding: 10, backgroundColor: snowPalette.card }}>
    <Text accessibilityRole="alert">字型未能載入，暫用系統字型；功能仍可操作。</Text>
    <Pressable accessibilityRole="button" disabled={retrying} onPress={() => void retry()}><Text>{retrying ? "正在重試字型…" : "重試字型載入"}</Text></Pressable>
  </View>;
}

export default function RootLayout() {
  return (
    <ConsumerRuntimeProvider>
      <FontStatusNotice />
      <ConsumerLocationProvider>
        <ConsumerRuntimeNavigationGate>
          <Stack
          screenOptions={{
            headerStyle: { backgroundColor: snowPalette.card },
            headerTintColor: snowPalette.ink,
            contentStyle: { backgroundColor: snowPalette.bg }
          }}
        >
          <Stack.Screen name="index" options={{ title: zhTW.common.appName }} />
          <Stack.Screen name="login" options={{ title: zhTW.mobile.nav.login }} />
          <Stack.Screen name="meal-photo" options={{ title: zhTW.mobile.nav.mealPhoto }} />
          <Stack.Screen name="analysis" options={{ title: zhTW.mobile.nav.analysis }} />
          <Stack.Screen name="today-intake" options={{ title: zhTW.mobile.analysis.savedIntake.title }} />
          <Stack.Screen name="meal-log" options={{ title: zhTW.mobile.nav.mealLog }} />
          <Stack.Screen name="recommendation" options={{ title: zhTW.mobile.nav.recommendation }} />
          <Stack.Screen name="social" options={{ title: zhTW.mobile.socialTitle }} />
          <Stack.Screen name="restaurants" options={{ title: zhTW.mobile.primaryNav.explore }} />
          <Stack.Screen name="permissions" options={{ title: zhTW.mobile.primaryNav.profile }} />
          <Stack.Screen name="profile-photo" options={{ title: "平台私人頭貼" }} />
          <Stack.Screen name="me" options={{ title: zhTW.mobile.primaryNav.profile }} />
          <Stack.Screen name="group-tables" options={{ title: zhTW.mobile.groupTablesTitle }} />
          <Stack.Screen name="health-goal-plan" options={{ title: zhTW.mobile.healthGoalPlan.title }} />
          <Stack.Screen name="community-card" options={{ title: zhTW.mobile.communityCard.title }} />
          <Stack.Screen name="community-card-settings" options={{ title: zhTW.mobile.communityCardSettings.title }} />
          <Stack.Screen name="social-interest-settings" options={{ title: zhTW.mobile.socialInterestSettings.title }} />
          <Stack.Screen name="allergy-settings" options={{ title: zhTW.mobile.allergySettings.title }} />
          <Stack.Screen name="ingredient-avoidance-settings" options={{ title: zhTW.mobile.ingredientAvoidanceSettings.title }} />
          <Stack.Screen name="meal-buddies" options={{ title: zhTW.mobile.mealBuddies.title }} />
          <Stack.Screen name="meal-buddy-candidate-profile/[candidateRef]" options={{ title: "飯友公開檔案" }} />
          <Stack.Screen name="meal-buddy-chat/[relationshipRef]" options={{ title: zhTW.mobile.mealBuddyChat.screenTitle }} />
          <Stack.Screen name="codex/index" options={{ title: zhTW.mobile.ipCodex.galleryTitle }} />
          <Stack.Screen name="codex/[seriesId]/index" options={{ title: zhTW.mobile.ipCodex.galleryTitle }} />
          <Stack.Screen name="codex/[seriesId]/[entryId]" options={{ title: zhTW.mobile.ipCodex.galleryTitle }} />
          </Stack>
        </ConsumerRuntimeNavigationGate>
      </ConsumerLocationProvider>
    </ConsumerRuntimeProvider>
  );
}
