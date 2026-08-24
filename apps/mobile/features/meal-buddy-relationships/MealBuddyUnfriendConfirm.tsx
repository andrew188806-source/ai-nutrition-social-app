import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { colors } from "../../components/DemoUi";

const copy = zhTW.mobile.mealBuddyRelationships;

// SR-2K-B. Ending a relationship is deliberately a two-step action: the row action only opens this
// sheet, and nothing is sent until the destructive button here is pressed. The body says plainly
// what is lost and states that the counterpart is NOT blocked, so the two authorities cannot be
// confused; the safe choice is the one that keeps the relationship.
export function MealBuddyUnfriendConfirm({ visible, pending, onCancel, onConfirm }: {
  visible: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{copy.unfriendConfirmTitle}</Text>
          <Text style={styles.body}>{copy.unfriendConfirmBody}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.unfriendCancel}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              style={[styles.button, styles.keepButton, pending && styles.disabled]}
              onPress={onCancel}
            >
              <Text style={styles.keepText}>{copy.unfriendCancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.unfriendConfirm}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              style={[styles.button, styles.endButton, pending && styles.disabled]}
              onPress={onConfirm}
            >
              <Text style={styles.endText}>{pending ? copy.unfriending : copy.unfriendConfirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(17,24,28,0.45)", flex: 1, justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: "#fff", borderRadius: 20, gap: 10, maxWidth: 420, padding: 22, width: "100%" },
  title: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 8 },
  button: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  keepButton: { backgroundColor: "#fff", borderColor: colors.line, borderWidth: 1 },
  endButton: { backgroundColor: "#A83B3B" },
  keepText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  endText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.5 }
});
