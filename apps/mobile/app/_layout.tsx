import { NotoSansTC_400Regular, NotoSansTC_500Medium, NotoSansTC_700Bold, NotoSansTC_900Black } from "@expo-google-fonts/noto-sans-tc";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { ConsumerRuntimeNavigationGate, ConsumerRuntimeProvider } from "../features/consumer-runtime";
import { ConsumerLocationProvider } from "../features/consumer-location/ConsumerLocationProvider";
import { snowPalette } from "../theme/tokens";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NotoSansTC_400Regular,
    NotoSansTC_500Medium,
    NotoSansTC_700Bold,
    NotoSansTC_900Black,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ConsumerRuntimeProvider>
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
          </Stack>
        </ConsumerRuntimeNavigationGate>
      </ConsumerLocationProvider>
    </ConsumerRuntimeProvider>
  );
}
