import { type Href, useRouter } from "expo-router";
import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { fonts, radius, shadows } from "../theme/tokens";
import { BottomNav, colors } from "./DemoUi";

interface ActionLink {
  href: Href;
  label: string;
}

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  eyebrow?: string;
  children?: ReactNode;
  primaryAction?: ActionLink;
  secondaryAction?: ActionLink;
}

export function PlaceholderScreen({
  title,
  subtitle,
  eyebrow = zhTW.common.phaseBadge,
  children,
  primaryAction,
  secondaryAction
}: PlaceholderScreenProps) {
  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.platformLabel}>{zhTW.mobile.demoAccess.platformConsumer}</Text>
            <Text style={styles.badge}>{eyebrow}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.actions}>
            {primaryAction ? <ActionButton action={primaryAction} variant="primary" /> : null}
            {secondaryAction ? <ActionButton action={secondaryAction} variant="secondary" /> : null}
          </View>
        </View>
        <View style={styles.content}>{children ?? <Text style={styles.panelText}>{zhTW.common.demoOnly}</Text>}</View>
        <Text style={styles.disclaimer}>{zhTW.common.notMedical}</Text>
        <BottomNav />
      </ScrollView>
    </View>
  );
}

function ActionButton({ action, variant }: { action: ActionLink; variant: "primary" | "secondary" }) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push(action.href)} style={[styles.button, variant === "secondary" && styles.secondaryButton]}>
      <Text style={[styles.buttonText, variant === "secondary" && styles.secondaryButtonText]}>{action.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.paper
  },
  container: {
    gap: 22,
    padding: 16,
    paddingBottom: 32
  },
  hero: {
    overflow: "hidden",
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.card,
    gap: 15,
    padding: 24,
    ...shadows.card
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  platformLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: "900",
    letterSpacing: 0
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontFamily: fonts.black,
    fontWeight: "900",
    lineHeight: 39
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: fonts.body
  },
  content: {
    gap: 16
  },
  panelText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.body
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  button: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: colors.ink
  }
});
