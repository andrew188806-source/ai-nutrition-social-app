import { type Href, usePathname, useRouter } from "expo-router";
import { ReactNode, useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Icon, type IconName } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette } from "../theme/tokens";

// Bright White / Warm Minimal ("snow") palette, re-exported under the legacy
// key names so existing screens keep working while picking up the new look.
export const colors = {
  ink: snowPalette.ink,
  muted: snowPalette.sub,
  line: snowPalette.line,
  paper: snowPalette.bg,
  card: snowPalette.card,
  teal: snowPalette.ai,
  mint: "#EAF2EC",
  amber: snowPalette.amber,
  coral: snowPalette.primary,
  sky: snowPalette.aiSoft,
  blush: snowPalette.blush,
  cream: snowPalette.bg2,
  lilac: "#EFEAF2"
};

export type DemoMode = "free" | "premium";

const styles = StyleSheet.create({
  card: {
    borderColor: colors.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 18,
    ...shadows.soft
  },
  mintCard: {
    borderColor: hexA(snowPalette.green, 0.28),
    backgroundColor: colors.mint
  },
  amberCard: {
    borderColor: hexA(colors.amber, 0.35),
    backgroundColor: hexA(colors.amber, 0.12)
  },
  skyCard: {
    borderColor: hexA(colors.teal, 0.2),
    backgroundColor: colors.sky
  },
  premiumCard: {
    borderColor: hexA(colors.amber, 0.4),
    backgroundColor: hexA(colors.amber, 0.14),
    shadowColor: colors.amber,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 }
  },
  sectionHeader: {
    gap: 4
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 145,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    padding: 14,
    ...shadows.soft
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 23,
    fontFamily: fonts.numeral,
    fontWeight: "900",
    marginTop: 5
  },
  metricNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontFamily: fonts.body
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tag: {
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  premiumBadge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
    color: "#ffffff",
    fontSize: 11,
    fontFamily: fonts.bold,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  freeBadge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.bold,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  lockNotice: {
    gap: 8,
    borderColor: hexA(colors.amber, 0.4),
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: hexA(colors.amber, 0.12),
    marginTop: 12,
    padding: 12
  },
  lockNoticeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "900"
  },
  lockNoticeBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body
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
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12
  },
  freeColumn: {
    borderColor: colors.line,
    backgroundColor: colors.card
  },
  premiumColumn: {
    borderColor: hexA(colors.amber, 0.4),
    backgroundColor: hexA(colors.amber, 0.14)
  },
  comparisonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "900"
  },
  comparisonItem: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.body
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: hexA(snowPalette.ink, 0.4),
    padding: 22
  },
  modalCard: {
    gap: 14,
    borderColor: hexA(colors.amber, 0.4),
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: hexA(colors.amber, 0.14),
    padding: 22,
    shadowColor: snowPalette.ink,
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 }
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 20,
    fontFamily: fonts.black,
    fontWeight: "900"
  },
  modalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.body
  },
  modalButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  modalButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "900"
  },
  modeShell: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 14
  },
  modeCurrent: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
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
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  modeOptionActiveFree: {
    backgroundColor: snowPalette.bg2
  },
  modeOptionActivePremium: {
    borderColor: hexA(colors.amber, 0.4),
    backgroundColor: hexA(colors.amber, 0.16)
  },
  modeOptionText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "900",
    textAlign: "center"
  },
  modeOptionTextActive: {
    color: colors.ink
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.coral,
    height: 46,
    width: 46
  },
  iconText: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: fonts.bold,
    fontWeight: "900"
  },
  bottomNav: {
    flexDirection: "row",
    gap: 6,
    borderColor: snowPalette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: snowPalette.card,
    marginTop: 8,
    padding: 10,
    ...shadows.card
  },
  navItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    borderRadius: radius.sm,
    paddingVertical: 9
  },
  navItemActive: {
    backgroundColor: snowPalette.primarySoft
  },
  navLabel: {
    color: snowPalette.sub,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  navLabelActive: {
    color: snowPalette.primaryDeep,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  scanTrack: {
    height: 9,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: hexA(colors.coral, 0.16)
  },
  scanFill: {
    height: 9,
    borderRadius: radius.pill,
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
  const pathname = usePathname();
  const items = [
    { label: zhTW.mobile.primaryNav.home, icon: "home", href: "/", match: ["/"] },
    {
      label: zhTW.mobile.primaryNav.analysis,
      icon: "chart",
      href: "/meal-photo",
      match: ["/meal-photo", "/analysis", "/today-intake", "/meal-log", "/recommendation", "/health-goal-plan"]
    },
    {
      label: zhTW.mobile.primaryNav.friends,
      icon: "buddies",
      href: "/meal-buddies",
      match: ["/meal-buddies", "/social", "/group-tables", "/community-card", "/community-card-settings"]
    },
    { label: zhTW.mobile.primaryNav.explore, icon: "plate", href: "/restaurants", match: ["/restaurants"] },
    { label: zhTW.mobile.primaryNav.profile, icon: "user", href: "/me", match: ["/me", "/permissions"] }
  ] satisfies Array<{ label: string; icon: IconName; href: Href; match: string[] }>;

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const active = item.match.some((path) => path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/"));

        return (
          <Pressable key={item.href} onPress={() => router.push(item.href)} style={[styles.navItem, active && styles.navItemActive]}>
            <Icon name={item.icon} size={20} color={active ? snowPalette.primaryDeep : snowPalette.sub} strokeWidth={active ? 2.4 : 2} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
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
