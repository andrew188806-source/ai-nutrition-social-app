import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, SectionTitle, TagRow, colors } from "../../components/DemoUi";
import { getCommunityProfileByProfileId, resolveCommunityProfileDisplay, type AvatarSource } from "../../features/display-resolvers";
import { getMascotSource } from "../../theme/components";

export default function CommunityProfileDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId?: string }>();
  const profileId = Array.isArray(params.profileId) ? params.profileId[0] : params.profileId;
  const profile = profileId ? getCommunityProfileByProfileId(profileId) : null;
  const display = resolveCommunityProfileDisplay(profile ? profile.id : undefined);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>返回</Text>
      </Pressable>
      <Card tone="premium">
        <SectionTitle title={profile ? display.displayName : "找不到社群檔案"} subtitle={profile ? display.shortProfileSummary : "這個社群檔案不存在或缺少 profileId。"} />
        <View style={styles.header}>
          <View style={styles.avatar}>
            <ResolvedAvatar avatarSource={display.avatarSource} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{display.displayName}</Text>
            <Text style={styles.meta}>{profile ? `${profile.ageRange}｜${profile.area}` : "未知飯友"}</Text>
          </View>
        </View>
        <TagRow tags={display.tags} />
        {profile ? (
          <>
            <Text style={styles.message}>健康目標：{profile.healthGoal ?? profile.commonInterests[1] ?? display.shortProfileSummary}</Text>
            <Text style={styles.message}>飲食摘要：{profile.dietSummary ?? display.shortProfileSummary}</Text>
            <Text style={styles.message}>最近狀態：{profile.recentMealStyle}</Text>
          </>
        ) : (
          <Text style={styles.message}>請從有效的社群卡、聊天、邀請或飯局參加者重新開啟。</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function ResolvedAvatar({ avatarSource }: { avatarSource: AvatarSource }) {
  if (avatarSource.type === "photo" && avatarSource.photoUrl) {
    return <Image source={{ uri: avatarSource.photoUrl }} style={styles.avatarImage} resizeMode="cover" />;
  }
  if (avatarSource.type === "mascot") {
    const source = getMascotSource(avatarSource.mascotId);
    return source ? <Image source={source} style={styles.avatarImage} resizeMode="cover" /> : null;
  }
  if (avatarSource.type === "initial") {
    return <Text style={styles.avatarText}>{avatarSource.value}</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    gap: 12,
    padding: 18,
    paddingBottom: 40
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  backButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#e8f6f1",
    borderColor: "#ffffff",
    borderRadius: 38,
    borderWidth: 3,
    height: 76,
    justifyContent: "center",
    overflow: "hidden",
    width: 76
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  flex: {
    flex: 1
  },
  name: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4
  },
  message: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 8
  }
});
