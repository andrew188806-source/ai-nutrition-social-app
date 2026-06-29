import { ReactNode } from "react";
import { Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

export function PersonAvatar({ type = "real", initial = "?", size = 44, mascotId }: { type?: "real" | "anon"; initial?: string; size?: number; mascotId?: string }) {
  if (mascotId) {
    const source = getMascotSource(mascotId);
    if (source) {
      return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }} resizeMode="cover" />;
    }
  }
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

export function StatCard({ icon, label, value, tone = "default" }: { icon?: IconName; label: string; value: string; tone?: "default" | "ai" | "primary" | "amber" }) {
  return (
    <View style={[styles.statCard, tone === "ai" && styles.statCardAi, tone === "primary" && styles.statCardPrimary, tone === "amber" && styles.statCardAmber]}>
      {icon ? (
        <View style={[styles.compactIcon, iconTone(tone)]}>
          <Icon name={icon} size={16} color={tone === "ai" ? colors.ai : tone === "primary" ? colors.primaryDeep : tone === "amber" ? colors.amber : colors.sub} />
        </View>
      ) : null}
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

function iconTone(tone: "default" | "ai" | "primary" | "amber") {
  return tone === "ai" ? styles.compactIconAi : tone === "primary" ? styles.compactIconPrimary : tone === "amber" ? styles.compactIconAmber : undefined;
}

export type FeastCoverVariant = "warm" | "dawn" | "fresh" | "night";

const COVER_GRADIENTS: Record<FeastCoverVariant, [string, string]> = {
  warm: [colors.primary, colors.primaryDeep],
  dawn: [colors.amber, colors.primary],
  fresh: [colors.green, colors.ai],
  night: [colors.ai, colors.primaryDeep]
};

export function FeastCoverCard({
  variant = "warm",
  timeLabel,
  badgeLabel,
  badgeUrgent = false,
  title,
  subtitle
}: {
  variant?: FeastCoverVariant;
  timeLabel: string;
  badgeLabel?: string;
  badgeUrgent?: boolean;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.feastCover}>
      <LinearGradient colors={COVER_GRADIENTS[variant]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.feastCoverStripe} />
      <View style={styles.feastCoverTopRow}>
        <View style={styles.feastTimePill}>
          <Icon name="clock" size={13} color="#FFFFFF" />
          <Text style={styles.feastTimePillText}>{timeLabel}</Text>
        </View>
        {badgeLabel ? (
          <View style={[styles.feastBadge, badgeUrgent && styles.feastBadgeUrgent]}>
            <Text style={[styles.feastBadgeText, badgeUrgent && styles.feastBadgeTextUrgent]}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.feastCoverBottom}>
        <Text style={styles.feastCoverTitle}>{title}</Text>
        {subtitle ? <Text style={styles.feastCoverSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function SeatLine({
  joined,
  openCount,
  size = 32
}: {
  joined: Array<{ type: "real" | "anon"; initial?: string }>;
  openCount: number;
  size?: number;
}) {
  const visibleOpen = Math.max(0, Math.min(openCount, 4 - joined.length));
  const overflow = openCount - visibleOpen;

  return (
    <View style={styles.seatLine}>
      {joined.map((person, index) => (
        <View
          key={`joined-${index}`}
          style={[styles.seatLineAvatar, { width: size, height: size, borderRadius: size / 2 }, index > 0 && { marginLeft: -size * 0.32 }]}
        >
          <PersonAvatar type={person.type} initial={person.initial} size={size - 4} />
        </View>
      ))}
      {Array.from({ length: visibleOpen }).map((_, index) => (
        <View
          key={`open-${index}`}
          style={[
            styles.seatLineOpen,
            { width: size, height: size, borderRadius: size / 2 },
            (joined.length > 0 || index > 0) && { marginLeft: -size * 0.32 }
          ]}
        >
          <Icon name="plus" size={size * 0.4} color={colors.faint} />
        </View>
      ))}
      {overflow > 0 ? <Text style={styles.seatLineMore}>+{overflow} 空位</Text> : null}
    </View>
  );
}

export function FillBar({ joined, size, height = 6 }: { joined: number; size: number; height?: number }) {
  const progress = size > 0 ? Math.max(0, Math.min(1, joined / size)) : 0;

  return (
    <View style={[styles.fillBarTrack, { height, borderRadius: height / 2 }]}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fillBarFill, { width: `${progress * 100}%`, height, borderRadius: height / 2 }]}
      />
    </View>
  );
}

export type BadgeTone = "coral" | "green" | "amber" | "ai" | "sub" | "solid";

function badgeToneStyle(tone: BadgeTone) {
  switch (tone) {
    case "coral":
      return styles.badgeCoral;
    case "green":
      return styles.badgeGreen;
    case "amber":
      return styles.badgeAmber;
    case "ai":
      return styles.badgeAi;
    case "solid":
      return styles.badgeSolid;
    default:
      return styles.badgeSub;
  }
}

function badgeTextToneStyle(tone: BadgeTone) {
  switch (tone) {
    case "coral":
      return styles.badgeTextCoral;
    case "green":
      return styles.badgeTextGreen;
    case "amber":
      return styles.badgeTextAmber;
    case "ai":
      return styles.badgeTextAi;
    case "solid":
      return styles.badgeTextSolid;
    default:
      return styles.badgeTextSub;
  }
}

export function Badge({ label, tone = "sub" }: { label: string; tone?: BadgeTone }) {
  return (
    <View style={[styles.badge, badgeToneStyle(tone)]}>
      <Text style={[styles.badgeText, badgeTextToneStyle(tone)]}>{label}</Text>
    </View>
  );
}

export type SeatTileProps = {
  state: "filled" | "open";
  name?: string;
  type?: "real" | "anon";
  initial?: string;
  roleLabel?: string;
  roleTone?: BadgeTone;
  openLabel?: string;
  onPress?: () => void;
};

export function SeatTile({ state, name, type = "real", initial, roleLabel, roleTone = "coral", openLabel = "空位", onPress }: SeatTileProps) {
  if (state === "open") {
    return (
      <Pressable style={styles.seatTileOpen} onPress={onPress}>
        <View style={styles.seatTileOpenIcon}>
          <Icon name="plus" size={18} color={colors.faint} />
        </View>
        <Text style={styles.seatTileOpenLabel}>{openLabel}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.seatTileFilled}>
      <PersonAvatar type={type} initial={initial ?? name?.slice(0, 1)} size={40} />
      <Text style={styles.seatTileName} numberOfLines={1}>
        {name}
      </Text>
      {roleLabel ? <Badge label={roleLabel} tone={roleTone} /> : null}
    </View>
  );
}

export function SeatGrid({ seats }: { seats: SeatTileProps[] }) {
  return (
    <View style={styles.seatGrid}>
      {seats.map((seat, index) => (
        <SeatTile key={index} {...seat} />
      ))}
    </View>
  );
}

export function StepsIndicator({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <View style={styles.stepsRow}>
      {steps.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <View key={step} style={styles.stepItem}>
            <View style={styles.stepDotRow}>
              <View style={[styles.stepDot, active && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>{index + 1}</Text>
              </View>
              {index < steps.length - 1 ? <View style={[styles.stepLine, index < activeIndex && styles.stepLineActive]} /> : null}
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function AiNoteBox({ label, text, tone = "ai" }: { label: string; text: string; tone?: "ai" | "green" }) {
  return (
    <View style={[styles.aiNote, tone === "green" && styles.aiNoteGreen]}>
      <Icon name="spark" size={16} color={tone === "green" ? colors.green : colors.ai} filled />
      <Text style={styles.aiNoteText}>
        <Text style={[styles.aiNoteLabel, tone === "green" && styles.aiNoteLabelGreen]}>{label} </Text>
        {text}
      </Text>
    </View>
  );
}

export function Segmented({
  options,
  activeId,
  onChange
}: {
  options: Array<{ id: string; label: string; count?: number }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.id === activeId;
        return (
          <Pressable key={option.id} style={[styles.segmentedItem, active && styles.segmentedItemActive]} onPress={() => onChange(option.id)}>
            <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{option.label}</Text>
            {option.count !== undefined ? (
              <View style={[styles.segmentedCount, active && styles.segmentedCountActive]}>
                <Text style={[styles.segmentedCountText, active && styles.segmentedCountTextActive]}>{option.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function MatchScore({ value, label = "合拍" }: { value: number; label?: string }) {
  return (
    <View style={styles.matchScore}>
      <Text style={styles.matchScoreValue}>{value}%</Text>
      <Text style={styles.matchScoreLabel}>{label}</Text>
    </View>
  );
}

const MASCOTS = {
  balance: require("../assets/mascots/balance.png"),
  dessert: require("../assets/mascots/dessert.png"),
  explorer: require("../assets/mascots/explorer.png"),
  fastfood: require("../assets/mascots/fastfood.png"),
  latenight: require("../assets/mascots/latenight.png"),
  lowcarb: require("../assets/mascots/lowcarb.png"),
  protein: require("../assets/mascots/protein.png"),
  veggie: require("../assets/mascots/veggie.jpg")
} as const;

export type MascotName = keyof typeof MASCOTS;

const MASCOT_ID_MAP: Record<string, MascotName> = {
  "protein-believer": "protein",
  "vegetarian-believer": "veggie",
  "fast-food-hero": "fastfood",
  "dessert-healer": "dessert",
  "balance-guardian": "balance",
  "midnight-diner": "latenight",
  "low-carb-ninja": "lowcarb",
  "taste-explorer": "explorer"
};

export function getMascotSource(mascotId?: string | null) {
  if (!mascotId) return null;
  const key = MASCOT_ID_MAP[mascotId] as MascotName | undefined;
  return key ? MASCOTS[key] : null;
}

export function EmptyState({
  mascot,
  icon = "spark",
  title,
  body,
  primaryAction,
  secondaryAction
}: {
  mascot?: MascotName;
  icon?: IconName;
  title: string;
  body: string;
  primaryAction?: { label: string; icon?: IconName; onPress?: () => void };
  secondaryAction?: { label: string; icon?: IconName; onPress?: () => void };
}) {
  return (
    <View style={styles.emptyState}>
      {mascot ? (
        <Image source={MASCOTS[mascot]} style={styles.emptyStateMascot} resizeMode="contain" />
      ) : (
        <View style={styles.emptyStateIconWrap}>
          <Icon name={icon} size={28} color={colors.primaryDeep} />
        </View>
      )}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateBody}>{body}</Text>
      {primaryAction ? (
        <View style={styles.emptyStateAction}>
          <PrimaryButton label={primaryAction.label} icon={primaryAction.icon} onPress={primaryAction.onPress} />
        </View>
      ) : null}
      {secondaryAction ? (
        <Pressable style={styles.emptyStateGhost} onPress={secondaryAction.onPress}>
          {secondaryAction.icon ? <Icon name={secondaryAction.icon} size={16} color={colors.sub} /> : null}
          <Text style={styles.emptyStateGhostText}>{secondaryAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
    backgroundColor: hexA(colors.primary, 0.22)
  },
  compactIconAmber: {
    backgroundColor: hexA(colors.amber, 0.22)
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
    borderColor: hexA(colors.ai, 0.25)
  },
  statCardPrimary: {
    backgroundColor: hexA(colors.primary, 0.22),
    borderColor: hexA(colors.primary, 0.42)
  },
  statCardAmber: {
    backgroundColor: hexA(colors.amber, 0.20),
    borderColor: hexA(colors.amber, 0.40)
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
  },
  feastCover: {
    borderRadius: radius.base,
    overflow: "hidden",
    padding: 16,
    minHeight: 132,
    justifyContent: "space-between",
    ...shadows.card
  },
  feastCoverStripe: {
    position: "absolute",
    top: -40,
    right: -60,
    width: 160,
    height: 220,
    backgroundColor: "rgba(255,255,255,0.10)",
    transform: [{ rotate: "25deg" }]
  },
  feastCoverTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  feastTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  feastTimePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  feastBadge: {
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  feastBadgeUrgent: {
    backgroundColor: "#FFFFFF"
  },
  feastBadgeText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  feastBadgeTextUrgent: {
    color: colors.primaryDeep
  },
  feastCoverBottom: {
    gap: 2
  },
  feastCoverTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  feastCoverSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12.5,
    fontFamily: fonts.body
  },
  seatLine: {
    flexDirection: "row",
    alignItems: "center"
  },
  seatLineAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: colors.card
  },
  seatLineOpen: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg2,
    borderWidth: 1.5,
    borderColor: colors.faint,
    borderStyle: "dashed"
  },
  seatLineMore: {
    marginLeft: 8,
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  fillBarTrack: {
    width: "100%",
    backgroundColor: colors.track,
    overflow: "hidden"
  },
  fillBarFill: {},
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  badgeCoral: {
    backgroundColor: colors.primarySoft
  },
  badgeTextCoral: {
    color: colors.primaryDeep
  },
  badgeGreen: {
    backgroundColor: hexA(colors.green, 0.16)
  },
  badgeTextGreen: {
    color: colors.green
  },
  badgeAmber: {
    backgroundColor: hexA(colors.amber, 0.18)
  },
  badgeTextAmber: {
    color: colors.amber
  },
  badgeAi: {
    backgroundColor: colors.aiSoft
  },
  badgeTextAi: {
    color: colors.ai
  },
  badgeSub: {
    backgroundColor: colors.bg2
  },
  badgeTextSub: {
    color: colors.sub
  },
  badgeSolid: {
    backgroundColor: colors.solid
  },
  badgeTextSolid: {
    color: colors.solidText
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  seatTileFilled: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 10
  },
  seatTileOpen: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.faint,
    borderStyle: "dashed",
    backgroundColor: colors.bg2,
    padding: 10
  },
  seatTileOpenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line
  },
  seatTileOpenLabel: {
    color: colors.faint,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  seatTileName: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  stepDotRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%"
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  stepDotText: {
    color: colors.faint,
    fontSize: 12,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  stepDotTextActive: {
    color: "#FFFFFF"
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    marginHorizontal: 4
  },
  stepLineActive: {
    backgroundColor: colors.primary
  },
  stepLabel: {
    color: colors.faint,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700",
    textAlign: "center"
  },
  stepLabelActive: {
    color: colors.ink
  },
  aiNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.aiSoft,
    padding: 12
  },
  aiNoteGreen: {
    backgroundColor: hexA(colors.green, 0.14)
  },
  aiNoteText: {
    flex: 1,
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body
  },
  aiNoteLabel: {
    color: colors.ai,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  aiNoteLabelGreen: {
    color: colors.green
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bg2,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4
  },
  segmentedItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 9
  },
  segmentedItemActive: {
    backgroundColor: colors.card,
    ...shadows.soft
  },
  segmentedText: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  segmentedTextActive: {
    color: colors.ink
  },
  segmentedCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    backgroundColor: colors.line
  },
  segmentedCountActive: {
    backgroundColor: colors.primarySoft
  },
  segmentedCountText: {
    color: colors.sub,
    fontSize: 10.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  segmentedCountTextActive: {
    color: colors.primaryDeep
  },
  matchScore: {
    alignItems: "center"
  },
  matchScoreValue: {
    color: colors.primaryDeep,
    fontSize: 22,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  matchScoreLabel: {
    color: colors.faint,
    fontSize: 10.5,
    fontFamily: fonts.body
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6
  },
  emptyStateMascot: {
    width: 104,
    height: 104,
    marginBottom: 6
  },
  emptyStateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: 6
  },
  emptyStateTitle: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyStateBody: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: fonts.body,
    maxWidth: 260
  },
  emptyStateAction: {
    width: "100%",
    marginTop: 10
  },
  emptyStateGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6
  },
  emptyStateGhostText: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  }
});

export { colors as snowColors };
