import { type Href, useRouter } from "expo-router";
import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
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
    backgroundColor: "#fbf5ec"
  },
  container: {
    gap: 22,
    padding: 16,
    paddingBottom: 32
  },
  hero: {
    overflow: "hidden",
    borderColor: "#f1dfc9",
    borderRadius: 38,
    borderWidth: 1,
    backgroundColor: "#fff7eb",
    gap: 15,
    padding: 26,
    shadowColor: "#b98558",
    shadowOpacity: 0.14,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 }
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.coral,
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  platformLabel: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 41
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23
  },
  content: {
    gap: 16
  },
  panelText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  button: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderColor: "#eadbc7",
    borderWidth: 1
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: colors.ink
  }
});
