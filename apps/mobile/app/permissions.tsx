import { useRouter } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { ProfileMenuItem } from "../features/community-card-settings";

export default function PermissionsScreen() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      title={zhTW.mobile.profile.title}
      subtitle={zhTW.mobile.profile.subtitle}
    >
      <Card tone="premium">
        <View style={styles.premiumHero}>
          <View style={styles.premiumMark}>
            <Text style={styles.premiumMarkText}>P</Text>
          </View>
          <View style={styles.flex}>
            <PremiumBadge />
            <SectionTitle title={zhTW.mobile.profile.premiumTitle} subtitle={zhTW.mobile.profile.premiumBody} />
          </View>
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.profile.healthGoalTitle} subtitle={zhTW.mobile.profile.healthGoalBody} />
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.finalUx.nutritionHistoryTitle} subtitle={zhTW.mobile.finalUx.nutritionHistoryBody} />
        <ProfileMenuItem title={zhTW.mobile.refinedLogic.profile.nutritionFoodMemoryEntry} body={zhTW.mobile.refinedLogic.profile.nutritionFoodMemoryBody} onPress={() => router.push("/meal-log")} />
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.profile.personalTagsTitle} />
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.social.sharedTags} />
        </View>
        <ProfileMenuItem title={zhTW.mobile.communityCardSettings.openFromProfile} body={zhTW.mobile.communityCardSettings.openFromProfileBody} onPress={() => router.push("/community-card-settings")} />
      </Card>

      <Card tone="sky">
        <SectionTitle title={zhTW.mobile.profile.privacyTitle} subtitle={zhTW.mobile.profile.privacyBody} />
      </Card>

      {zhTW.mobile.permissions.controls.map((control) => (
        <Card key={control.title}>
          <View style={styles.permissionRow}>
            <View style={styles.toggle}>
              <View style={styles.knob} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{control.title}</Text>
              <Text style={styles.body}>{control.body}</Text>
            </View>
          </View>
        </Card>
      ))}

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.permissions.esgTitle} subtitle={zhTW.mobile.permissions.esgBody} />
      </Card>

      <Card tone="sky">
        <SectionTitle title={zhTW.mobile.permissions.vipTitle} subtitle={zhTW.mobile.permissions.vipBody} />
      </Card>

      <Card tone="amber">
        <Text style={styles.demoBadge}>{zhTW.mobile.demoAccess.demoOnlyBadge}</Text>
        <SectionTitle title={zhTW.mobile.demoAccess.title} subtitle={zhTW.mobile.demoAccess.subtitle} />
        <View style={styles.demoPlatformRow}>
          <Text style={styles.platformPill}>{zhTW.mobile.demoAccess.consumerLabel}</Text>
          <Text style={styles.platformPill}>{zhTW.mobile.demoAccess.restaurantLabel}</Text>
          <Text style={styles.platformPill}>{zhTW.mobile.demoAccess.adminLabel}</Text>
        </View>
        <Pressable style={styles.demoButton} onPress={() => Linking.openURL("http://localhost:3001")}>
          <Text style={styles.demoButtonText}>{zhTW.mobile.demoAccess.restaurantButton}</Text>
          <Text style={styles.demoButtonHelp}>{zhTW.mobile.demoAccess.restaurantHelp}</Text>
        </Pressable>
        <Pressable style={[styles.demoButton, styles.adminButton]} onPress={() => Linking.openURL("http://localhost:3002")}>
          <Text style={styles.demoButtonText}>{zhTW.mobile.demoAccess.adminButton}</Text>
          <Text style={styles.demoButtonHelp}>{zhTW.mobile.demoAccess.adminHelp}</Text>
        </Pressable>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  permissionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  premiumHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16
  },
  premiumMark: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.82)",
    borderRadius: 30,
    borderWidth: 4,
    backgroundColor: colors.coral,
    height: 78,
    shadowColor: "#a86421",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    width: 78
  },
  premiumMarkText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900"
  },
  toggle: {
    alignItems: "flex-end",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.teal,
    height: 32,
    paddingHorizontal: 4,
    width: 56
  },
  knob: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    height: 24,
    width: 24
  },
  flex: {
    flex: 1,
    gap: 5
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  demoBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  demoButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  adminButton: {
    backgroundColor: colors.teal
  },
  demoButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  demoButtonHelp: {
    color: "#f5efe2",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center"
  },
  demoPlatformRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  platformPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  tagSpace: {
    marginTop: 14
  }
});
