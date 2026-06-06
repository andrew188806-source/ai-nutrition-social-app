import { Stack } from "expo-router";
import { zhTW } from "../../../lib/i18n/zh-TW";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#f7f3ea" },
        headerTintColor: "#1f2933",
        contentStyle: { backgroundColor: "#fffaf0" }
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
      <Stack.Screen name="group-tables" options={{ title: zhTW.mobile.groupTablesTitle }} />
      <Stack.Screen name="health-goal-plan" options={{ title: zhTW.mobile.healthGoalPlan.title }} />
      <Stack.Screen name="community-card" options={{ title: zhTW.mobile.communityCard.title }} />
      <Stack.Screen name="community-card-settings" options={{ title: zhTW.mobile.communityCardSettings.title }} />
      <Stack.Screen name="meal-buddies" options={{ title: zhTW.mobile.mealBuddies.title }} />
    </Stack>
  );
}
