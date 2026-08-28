import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import {
  isConsumerAllergySettingsReady,
  useConsumerAllergySettings
} from "../features/consumer-allergy-settings";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { Card, PrimaryButton, SectionHeader } from "../theme/components";
import { fonts, snowPalette as colors } from "../theme/tokens";

export default function AllergySettingsScreen() {
  const router = useRouter();
  const runtime = useConsumerRuntime();
  const copy = zhTW.mobile.allergySettings;
  const controller = useConsumerAllergySettings(runtime.state.actorKey, runtime.state.actorGeneration);
  const state = controller.state;

  if (state.phase === "loading") {
    return <View style={styles.centered}><ActivityIndicator color={colors.primaryDeep} /><Text style={styles.body}>{copy.loading}</Text></View>;
  }
  if (state.phase === "signed_out" || state.phase === "load_failed") {
    const signedOut = state.phase === "signed_out";
    return (
      <View style={styles.centered}>
        <Card style={styles.noticeCard}>
          <SectionHeader title={signedOut ? copy.signedOutTitle : copy.loadErrorTitle}
            subtitle={signedOut ? copy.signedOutBody : copy.loadErrorBody} />
          {!signedOut ? <PrimaryButton label={copy.retry} onPress={() => void controller.retryLoad()} /> : null}
          <BackButton disabled={false} onPress={() => router.back()} />
        </Card>
      </View>
    );
  }
  if (!isConsumerAllergySettingsReady(state)) return null;
  const saving = state.phase === "saving";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.description}</Text>
      </View>
      <Card>
        <SectionHeader title={copy.title} subtitle={state.draft.length === 0 ? copy.empty : undefined} />
        <View style={styles.optionList}>
          {state.options.map((option) => {
            const selected = state.draft.includes(option.key);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: saving }}
                disabled={saving} key={option.key} onPress={() => controller.toggle(option.key)}
                style={[styles.option, selected && styles.optionSelected]}>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  <Text style={styles.checkmark}>{selected ? "✓" : ""}</Text>
                </View>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {state.unresolvedSelectionCount > 0 ? (
        <Card tone="blush"><SectionHeader title={copy.unresolvedTitle} subtitle={copy.unresolvedBody} /></Card>
      ) : null}
      <Card tone="ai"><Text style={styles.disclaimer}>{copy.disclaimer}</Text></Card>
      {state.phase === "save_failed" ? (
        <Card tone="blush"><SectionHeader title={copy.saveErrorTitle} subtitle={copy.saveErrorBody} /></Card>
      ) : null}
      {state.phase === "saved" ? <Text style={styles.success}>{copy.saved}</Text> : null}
      <PrimaryButton label={saving ? copy.saving : state.phase === "save_failed" ? copy.retrySave : copy.save}
        disabled={saving || !state.dirty || state.unresolvedSelectionCount > 0} onPress={() => void controller.save()} />
      <BackButton disabled={saving} onPress={() => router.back()} />
    </ScrollView>
  );
}

function BackButton({ disabled, onPress }: { disabled: boolean; onPress(): void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={styles.backButton}>
    <Text style={styles.backText}>{zhTW.mobile.allergySettings.back}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20, backgroundColor: colors.bg },
  noticeCard: { width: "100%", maxWidth: 520 },
  container: { padding: 16, paddingBottom: 32, gap: 16, backgroundColor: colors.bg },
  header: { gap: 7 },
  title: { color: colors.ink, fontSize: 28, fontFamily: fonts.black, fontWeight: "900" },
  body: { color: colors.sub, fontSize: 13.5, lineHeight: 21, fontFamily: fonts.body },
  optionList: { gap: 10, marginTop: 12 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.card },
  optionSelected: { borderColor: colors.primaryDeep, backgroundColor: colors.primarySoft },
  checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  checkboxSelected: { borderColor: colors.primaryDeep, backgroundColor: colors.primaryDeep },
  checkmark: { color: colors.card, fontSize: 14, fontFamily: fonts.bold, fontWeight: "900" },
  optionLabel: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: "700" },
  optionLabelSelected: { color: colors.primaryDeep },
  disclaimer: { color: colors.sub, fontSize: 12.5, lineHeight: 19, fontFamily: fonts.body },
  success: { color: colors.primaryDeep, textAlign: "center", fontFamily: fonts.bold, fontWeight: "800" },
  backButton: { alignItems: "center", paddingVertical: 12 },
  backText: { color: colors.sub, fontFamily: fonts.bold, fontWeight: "700" }
});
