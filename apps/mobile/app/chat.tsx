import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";

export default function ChatScreen() {
  const router = useRouter();
  const [sentReply, setSentReply] = useState<string | null>(null);

  return (
    <PlaceholderScreen
      title={zhTW.mobile.chat.title}
      subtitle={zhTW.mobile.chat.subtitle}
      primaryAction={{ href: "/restaurants", label: zhTW.mobile.mealBuddies.viewRestaurant }}
      secondaryAction={{ href: "/meal-buddies", label: zhTW.common.backHome }}
    >
      <Card tone="amber">
        <Text style={styles.demoBadge}>{zhTW.mobile.chat.demoLabel}</Text>
        <SectionTitle title={zhTW.mobile.chat.participantName} subtitle={zhTW.mobile.communityCard.nearbyStatus} />
        <Text style={styles.paymentNote}>{zhTW.mobile.correctedFlow.paymentPreferencePrefix}{zhTW.mobile.correctedFlow.paymentOptions[0]}</Text>
      </Card>

      <Card>
        <View style={styles.messages}>
          {zhTW.mobile.chat.messages.map((message) => (
            <View key={message.text} style={[styles.messageBubble, message.sender === "me" && styles.myMessage]}>
              <Text style={[styles.messageText, message.sender === "me" && styles.myMessageText]}>{message.text}</Text>
            </View>
          ))}
          {sentReply ? (
            <View style={[styles.messageBubble, styles.myMessage]}>
              <Text style={[styles.messageText, styles.myMessageText]}>{sentReply}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.chat.quickRepliesTitle} />
        <View style={styles.quickReplyGrid}>
          {zhTW.mobile.chat.quickReplies.map((reply) => (
            <Pressable key={reply} style={styles.quickReply} onPress={() => setSentReply(reply)}>
              <Text style={styles.quickReplyText}>{reply}</Text>
            </Pressable>
          ))}
        </View>
        {sentReply ? <Text style={styles.sentText}>{zhTW.mobile.chat.sentState}</Text> : null}
      </Card>

      <Card tone="premium">
        <View style={styles.ctaGrid}>
          <Pressable style={styles.ctaButton} onPress={() => router.push("/restaurants")}>
            <Text style={styles.ctaButtonText}>{zhTW.mobile.mealBuddies.planMeal}</Text>
          </Pressable>
          <Pressable style={styles.ctaButton} onPress={() => router.push("/restaurants")}>
            <Text style={styles.ctaButtonText}>{zhTW.mobile.mealBuddies.viewRestaurant}</Text>
          </Pressable>
          <Pressable style={styles.ctaButton} onPress={() => router.push("/meal-buddies")}>
            <Text style={styles.ctaButtonText}>{zhTW.mobile.mealBuddies.viewList}</Text>
          </Pressable>
          <Pressable style={styles.ctaButton} onPress={() => router.push("/meal-buddies?section=tables")}>
            <Text style={styles.ctaButtonText}>{zhTW.mobile.correctedFlow.createGroupTable}</Text>
          </Pressable>
        </View>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
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
  messages: {
    gap: 10
  },
  paymentNote: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10
  },
  messageBubble: {
    alignSelf: "flex-start",
    borderRadius: 18,
    backgroundColor: "#f1eadc",
    maxWidth: "88%",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: colors.teal
  },
  messageText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20
  },
  myMessageText: {
    color: "#ffffff"
  },
  quickReplyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  quickReply: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  quickReplyText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  sentText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 12
  },
  ctaGrid: {
    gap: 10
  },
  ctaButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  ctaButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  }
});
