import { type Href, useRouter } from "expo-router";
import { ReactNode, useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";

export const colors = {
  ink: "#2d2823",
  muted: "#7e746a",
  line: "#eee2d2",
  paper: "#fff8ee",
  card: "#fffdf9",
  teal: "#4f9f82",
  mint: "#e6f7ed",
  amber: "#f8c977",
  coral: "#f28f7a",
  sky: "#e8f0ff",
  blush: "#ffe8df",
  cream: "#fff3df",
  lilac: "#f2edff"
};

export type DemoMode = "free" | "premium";

const styles = StyleSheet.create({
  card: {
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 20,
    shadowColor: "#9a6b45",
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }
  },
  mintCard: {
    borderColor: "#d4eadc",
    backgroundColor: colors.mint
  },
  amberCard: {
    borderColor: "#f3ddb3",
    backgroundColor: colors.cream
  },
  skyCard: {
    borderColor: "#d7e3fa",
    backgroundColor: colors.sky
  },
  premiumCard: {
    borderColor: "#f0c987",
    backgroundColor: "#fff1cf",
    shadowColor: "#d89c39",
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 }
  },
  sectionHeader: {
    gap: 7
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 28
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 145,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#b58a61",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 5
  },
  metricNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tag: {
    borderRadius: 999,
    backgroundColor: "#fff7ed",
    borderColor: "#f3dcc3",
    borderWidth: 1,
    color: "#7a6a2b",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  premiumBadge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#6f4a19",
    color: "#fff7df",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  freeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fffaf3",
    borderColor: "#eadbc7",
    borderWidth: 1,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  lockNotice: {
    gap: 8,
    borderColor: "#f4c56f",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fff9e8",
    marginTop: 12,
    padding: 12
  },
  lockNoticeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  lockNoticeBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  comparison: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  comparisonColumn: {
    flexGrow: 1,
    flexBasis: 138,
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12
  },
  freeColumn: {
    borderColor: colors.line,
    backgroundColor: "#ffffff"
  },
  premiumColumn: {
    borderColor: "#f4c56f",
    backgroundColor: "#fff5d6"
  },
  comparisonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  comparisonItem: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(32,26,20,0.42)",
    padding: 22
  },
  modalCard: {
    gap: 14,
    borderColor: "#f0c987",
    borderRadius: 30,
    borderWidth: 1,
    backgroundColor: "#fff4d8",
    padding: 22,
    shadowColor: "#3f2d12",
    shadowOpacity: 0.24,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 }
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  modalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  modalButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  modalButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  modeShell: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "#fffdf9",
    padding: 14
  },
  modeCurrent: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8
  },
  modeOption: {
    alignItems: "center",
    flex: 1,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  modeOptionActiveFree: {
    backgroundColor: "#f9f4ee"
  },
  modeOptionActivePremium: {
    borderColor: "#f4c56f",
    backgroundColor: "#fff3d9"
  },
  modeOptionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  modeOptionTextActive: {
    color: colors.ink
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#f28f7a",
    height: 46,
    width: 46
  },
  iconText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
  },
  bottomNav: {
    flexDirection: "row",
    gap: 6,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#fffdf9",
    marginTop: 8,
    padding: 10,
    shadowColor: "#9a6b45",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  navItem: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    borderRadius: 18,
    paddingVertical: 9
  },
  navIcon: {
    color: "#f28f7a",
    fontSize: 18,
    fontWeight: "900"
  },
  navLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800"
  },
  scanTrack: {
    height: 9,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#f7decf"
  },
  scanFill: {
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.coral
  }
});

export function Card({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "mint" | "amber" | "sky" | "premium" }) {
  return (
    <View style={[styles.card, tone === "mint" && styles.mintCard, tone === "amber" && styles.amberCard, tone === "sky" && styles.skyCard, tone === "premium" && styles.premiumCard]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle} numberOfLines={4}>{subtitle}</Text> : null}
    </View>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

export function TagRow({ tags }: { tags: readonly string[] }) {
  return (
    <View style={styles.tags}>
      {tags.map((tag) => (
        <Text key={tag} style={styles.tag}>
          {tag}
        </Text>
      ))}
    </View>
  );
}

export function PremiumBadge({ label = zhTW.common.premium, variant = "premium" }: { label?: string; variant?: "premium" | "free" }) {
  return <Text style={variant === "premium" ? styles.premiumBadge : styles.freeBadge}>{label}</Text>;
}

export function LockNotice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.lockNotice}>
      <Text style={styles.lockNoticeTitle}>{title}</Text>
      <Text style={styles.lockNoticeBody}>{body}</Text>
    </View>
  );
}

export function ComparisonPreview({ freeTitle, premiumTitle, freeItems, premiumItems }: { freeTitle: string; premiumTitle: string; freeItems: readonly string[]; premiumItems: readonly string[] }) {
  return (
    <View style={styles.comparison}>
      <View style={[styles.comparisonColumn, styles.freeColumn]}>
        <PremiumBadge label={freeTitle} variant="free" />
        {freeItems.map((item) => (
          <Text key={item} style={styles.comparisonItem}>
            {item}
          </Text>
        ))}
      </View>
      <View style={[styles.comparisonColumn, styles.premiumColumn]}>
        <PremiumBadge label={premiumTitle} />
        {premiumItems.map((item) => (
          <Text key={item} style={styles.comparisonItem}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function UpgradePromptModal({
  visible,
  title,
  body,
  actionLabel,
  secondaryActionLabel,
  onClose,
  onSecondaryAction
}: {
  visible: boolean;
  title: string;
  body: string;
  actionLabel: string;
  secondaryActionLabel?: string;
  onClose: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <PremiumBadge />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable style={styles.modalButton} onPress={onSecondaryAction}>
              <Text style={styles.modalButtonText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>{actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function DemoModeToggle({ mode, onChange }: { mode: DemoMode; onChange: (mode: DemoMode) => void }) {
  const isPremium = mode === "premium";

  return (
    <View style={styles.modeShell}>
      <Text style={styles.modeCurrent}>{isPremium ? zhTW.mobile.premiumUi.currentPremiumExperience : zhTW.mobile.premiumUi.currentFreeExperience}</Text>
      <View style={styles.modeToggle}>
        <Pressable style={[styles.modeOption, !isPremium && styles.modeOptionActiveFree]} onPress={() => onChange("free")}>
          <Text style={[styles.modeOptionText, !isPremium && styles.modeOptionTextActive]}>{zhTW.mobile.premiumUi.freeToggle}</Text>
        </Pressable>
        <Pressable style={[styles.modeOption, isPremium && styles.modeOptionActivePremium]} onPress={() => onChange("premium")}>
          <Text style={[styles.modeOptionText, isPremium && styles.modeOptionTextActive]}>{zhTW.mobile.premiumUi.premiumToggle}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function IconBubble({ icon }: { icon: string }) {
  return (
    <View style={styles.iconBubble}>
      <Text style={styles.iconText}>{icon}</Text>
    </View>
  );
}

export function BottomNav() {
  const router = useRouter();
  const items = [
    { label: zhTW.mobile.primaryNav.home, icon: "H", href: "/" },
    { label: zhTW.mobile.primaryNav.analysis, icon: "AI", href: "/meal-photo" },
    { label: zhTW.mobile.primaryNav.friends, icon: "F", href: "/meal-buddies" },
    { label: zhTW.mobile.primaryNav.explore, icon: "E", href: "/restaurants" },
    { label: zhTW.mobile.primaryNav.profile, icon: "M", href: "/permissions" }
  ] satisfies Array<{ label: string; icon: string; href: Href }>;

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <Pressable key={item.href} onPress={() => router.push(item.href)} style={styles.navItem}>
          <Text style={styles.navIcon}>{item.icon}</Text>
          <Text style={styles.navLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ScanningBar() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: 1400, useNativeDriver: false })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["18%", "100%"] });

  return (
    <View style={styles.scanTrack}>
      <Animated.View style={[styles.scanFill, { width }]} />
    </View>
  );
}

export const sharedStyles = styles;
