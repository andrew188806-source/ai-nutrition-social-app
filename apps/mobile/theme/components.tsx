import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Icon, type IconName } from "./icons";
import { fonts, hexA, radius, shadows, snowPalette } from "./tokens";

const colors = snowPalette;

export function Ring({
  value,
  max,
  size = 84,
  strokeWidth = 9,
  color = colors.primary,
  children
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dashOffset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={r} stroke={colors.track} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Card({
  children,
  tone = "default",
  style
}: {
  children: ReactNode;
  tone?: "default" | "ai" | "primary" | "blush";
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, tone === "ai" && styles.cardAi, tone === "primary" && styles.cardPrimary, tone === "blush" && styles.cardBlush, style]}>{children}</View>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderTop}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Chip({ label, active = false, onPress, tone = "primary" }: { label: string; active?: boolean; onPress?: () => void; tone?: "primary" | "ai" }) {
  const activeStyle = tone === "ai" ? styles.chipActiveAi : styles.chipActivePrimary;
  const activeTextStyle = tone === "ai" ? styles.chipTextActiveAi : styles.chipTextActivePrimary;

  return (
    <Pressable style={[styles.chip, active && activeStyle]} onPress={onPress}>
      <Text style={[styles.chipText, active && activeTextStyle]}>{label}</Text>
    </Pressable>
  );
}

export function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const progress = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <View style={styles.macroBarRow}>
      <View style={styles.macroBarHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{value}g</Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function PersonAvatar({ type = "real", initial = "?", size = 44 }: { type?: "real" | "anon"; initial?: string; size?: number }) {
  if (type === "anon") {
    return (
      <View style={[styles.avatarBase, styles.avatarAnon, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon name="user" size={size * 0.5} color={colors.faint} />
      </View>
    );
  }

  return (
    <View style={[styles.avatarBase, styles.avatarReal, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, icon }: { label: string; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      {icon ? <Icon name={icon} size={18} color="#FFFFFF" /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SolidButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.solidButton} onPress={onPress}>
      <Text style={styles.solidButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon }: { label: string; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      {icon ? <Icon name={icon} size={18} color={colors.ink} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, tone = "default" }: { icon: IconName; onPress?: () => void; tone?: "default" | "ai" | "primary" }) {
  return (
    <Pressable
      style={[styles.iconButton, tone === "ai" && styles.iconButtonAi, tone === "primary" && styles.iconButtonPrimary]}
      onPress={onPress}
    >
      <Icon name={icon} size={18} color={tone === "ai" ? colors.ai : tone === "primary" ? colors.primaryDeep : colors.sub} />
    </Pressable>
  );
}

export function CompactRow({
  icon,
  iconTone = "default",
  title,
  subtitle,
  value,
  onPress
}: {
  icon?: IconName;
  iconTone?: "default" | "ai" | "primary";
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.compactRow} onPress={onPress}>
      {icon ? (
        <View style={[styles.compactIcon, iconTone === "ai" && styles.compactIconAi, iconTone === "primary" && styles.compactIconPrimary]}>
          <Icon name={icon} size={18} color={iconTone === "ai" ? colors.ai : iconTone === "primary" ? colors.primaryDeep : colors.sub} />
        </View>
      ) : null}
      <View style={styles.compactTextWrap}>
        <Text style={styles.compactTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.compactSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={styles.compactValue}>{value}</Text> : null}
      {onPress ? <Icon name="chevron" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

export function StatCard({ icon, label, value, tone = "default" }: { icon?: IconName; label: string; value: string; tone?: "default" | "ai" | "primary" }) {
  return (
    <View style={[styles.statCard, tone === "ai" && styles.statCardAi, tone === "primary" && styles.statCardPrimary]}>
      {icon ? (
        <View style={[styles.compactIcon, iconTone(tone)]}>
          <Icon name={icon} size={16} color={tone === "ai" ? colors.ai : tone === "primary" ? colors.primaryDeep : colors.sub} />
        </View>
      ) : null}
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

function iconTone(tone: "default" | "ai" | "primary") {
  return tone === "ai" ? styles.compactIconAi : tone === "primary" ? styles.compactIconPrimary : undefined;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 18,
    ...shadows.soft
  },
  cardAi: {
    backgroundColor: colors.aiSoft,
    borderColor: hexA(colors.ai, 0.18)
  },
  cardPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.2)
  },
  cardBlush: {
    backgroundColor: colors.blush,
    borderColor: hexA(colors.primary, 0.12)
  },
  sectionHeader: {
    gap: 4
  },
  sectionHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  chipActivePrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.3)
  },
  chipActiveAi: {
    backgroundColor: colors.aiSoft,
    borderColor: hexA(colors.ai, 0.28)
  },
  chipText: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  chipTextActivePrimary: {
    color: colors.primaryDeep
  },
  chipTextActiveAi: {
    color: colors.ai
  },
  macroBarRow: {
    gap: 6
  },
  macroBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  macroLabel: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  macroValue: {
    color: colors.ink,
    fontSize: 12.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  macroTrack: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: "hidden"
  },
  macroFill: {
    height: 7,
    borderRadius: radius.pill
  },
  avatarBase: {
    alignItems: "center",
    justifyContent: "center"
  },
  avatarReal: {
    backgroundColor: colors.primarySoft
  },
  avatarAnon: {
    backgroundColor: colors.bg2,
    borderWidth: 1.5,
    borderColor: colors.faint,
    borderStyle: "dashed"
  },
  avatarInitial: {
    color: colors.primaryDeep,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  solidButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.solid,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  solidButtonText: {
    color: colors.solidText,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card
  },
  iconButtonAi: {
    backgroundColor: colors.aiSoft,
    borderColor: hexA(colors.ai, 0.18)
  },
  iconButtonPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.2)
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.soft
  },
  compactIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg2
  },
  compactIconAi: {
    backgroundColor: colors.aiSoft
  },
  compactIconPrimary: {
    backgroundColor: colors.primarySoft
  },
  compactTextWrap: {
    flex: 1,
    gap: 2
  },
  compactTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  compactSubtitle: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.body
  },
  compactValue: {
    color: colors.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  statCard: {
    flex: 1,
    minWidth: 90,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 14,
    gap: 6,
    ...shadows.soft
  },
  statCardAi: {
    backgroundColor: colors.aiSoft,
    borderColor: hexA(colors.ai, 0.18)
  },
  statCardPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.2)
  },
  statCardValue: {
    color: colors.ink,
    fontSize: 20,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  statCardLabel: {
    color: colors.sub,
    fontSize: 11.5,
    fontFamily: fonts.body
  }
});

export { colors as snowColors };
