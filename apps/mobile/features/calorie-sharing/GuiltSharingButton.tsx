import { Pressable, StyleSheet, Text } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Icon } from "../../theme/icons";
import { fonts, hexA, radius, snowPalette as colors } from "../../theme/tokens";

// 罪惡分擔 entry point shown on the analysis result screen. Tapping this opens
// GuiltSharingModal — it never auto-opens and never asks meal-completion questions.
export function GuiltSharingButton({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Icon name="heart" size={18} color={colors.primaryDeep} />
      <Text style={styles.label}>{label ?? zhTW.mobile.calorieSharing.guiltShareButton}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: hexA(colors.primary, 0.3),
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  label: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  }
});
