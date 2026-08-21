import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { useConsumerRuntime } from "../features/consumer-runtime";
import {
  SOCIAL_INTEREST_LIMITS,
  isReady,
  useSocialInterestSettings,
  type SocialInterestNamespace,
  type SocialInterestSettingsReadyState
} from "../features/social-interest-settings";
import { Card, PrimaryButton, SectionHeader } from "../theme/components";
import { fonts, snowPalette as colors } from "../theme/tokens";

export default function SocialInterestSettingsScreen() {
  const router = useRouter();
  const runtime = useConsumerRuntime();
  const copy = zhTW.mobile.socialInterestSettings;
  const controller = useSocialInterestSettings(runtime.state.actorKey, runtime.state.actorGeneration);
  const state = controller.state;

  if (state.phase === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDeep} />
        <Text style={styles.body}>{copy.loading}</Text>
      </View>
    );
  }

  if (state.phase === "signed_out" || state.phase === "load_failed") {
    const signedOut = state.phase === "signed_out";
    return (
      <View style={styles.centered}>
        <Card style={styles.noticeCard}>
          <SectionHeader
            title={signedOut ? copy.signedOutTitle : copy.loadErrorTitle}
            subtitle={signedOut ? copy.signedOutBody : copy.loadErrorBody}
          />
          {!signedOut ? <PrimaryButton label={copy.retry} onPress={() => void controller.retryLoad()} /> : null}
          <BackButton disabled={false} onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  if (!isReady(state)) return null;
  const saving = state.phase === "saving";
  const hasUnavailableSelection = selectedUnavailable(state);
  const saveDisabled = saving || !state.dirty || hasUnavailableSelection;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.disclosure}</Text>
      </View>

      <InterestSection namespace="general" state={state} onToggle={controller.toggle} />
      <InterestSection namespace="food" state={state} onToggle={controller.toggle} />

      {hasUnavailableSelection ? <Text style={styles.errorText}>{copy.unavailableOption}</Text> : null}
      {state.phase === "save_failed" ? (
        <Card tone="blush">
          <SectionHeader title={copy.saveErrorTitle} subtitle={copy.saveErrorBody} />
        </Card>
      ) : null}
      {state.phase === "saved" ? <Text style={styles.successText}>{copy.saved}</Text> : null}

      <PrimaryButton
        label={saving ? copy.saving : state.phase === "save_failed" ? copy.retrySave : copy.save}
        disabled={saveDisabled}
        onPress={() => void controller.save()}
      />
      <BackButton disabled={saving} onPress={() => router.back()} />
    </ScrollView>
  );
}

function InterestSection({
  namespace,
  state,
  onToggle
}: {
  namespace: SocialInterestNamespace;
  state: SocialInterestSettingsReadyState;
  onToggle(namespace: SocialInterestNamespace, tagKey: string): boolean;
}) {
  const copy = zhTW.mobile.socialInterestSettings;
  const title = namespace === "general" ? copy.generalTitle : copy.foodTitle;
  const body = namespace === "general" ? copy.generalBody : copy.foodBody;
  const selected = state.draft[namespace];
  const limitMessage = namespace === "general" ? copy.generalLimit : copy.foodLimit;

  return (
    <Card>
      <SectionHeader title={`${title} ${selected.length}/${SOCIAL_INTEREST_LIMITS[namespace]}`} subtitle={body} />
      {selected.length === 0 ? <Text style={styles.emptyText}>{copy.empty}</Text> : null}
      <View style={styles.categoryList}>
        {state.categories[namespace].map((category) => (
          <View key={category.tagKey} style={styles.category}>
            <Text style={styles.categoryTitle}>{category.label}</Text>
            <View style={styles.chipList}>
              {category.options.map((option) => {
                const active = selected.includes(option.tagKey);
                const disabled = state.phase === "saving" || (!option.active && !active);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active, disabled }}
                    disabled={disabled}
                    key={option.tagKey}
                    onPress={() => onToggle(namespace, option.tagKey)}
                    style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {option.label}{!option.active ? `（${copy.unavailableOption}）` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
      {state.limitError === namespace ? <Text style={styles.errorText}>{limitMessage}</Text> : null}
    </Card>
  );
}

function selectedUnavailable(state: SocialInterestSettingsReadyState): boolean {
  return (["general", "food"] as const).some((namespace) => {
    const selected = new Set(state.draft[namespace]);
    return state.categories[namespace]
      .flatMap((category) => category.options)
      .some((option) => selected.has(option.tagKey) && !option.active);
  });
}

function BackButton({ disabled, onPress }: { disabled: boolean; onPress(): void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.backButton, disabled && styles.backButtonDisabled]}>
      <Text style={styles.backText}>{zhTW.mobile.socialInterestSettings.back}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, gap: 18, padding: 16, paddingBottom: 36 },
  centered: { alignItems: "center", backgroundColor: colors.bg, flex: 1, gap: 12, justifyContent: "center", padding: 20 },
  noticeCard: { gap: 14, maxWidth: 520, width: "100%" },
  header: { gap: 8, paddingTop: 4 },
  title: { color: colors.ink, fontFamily: fonts.black, fontSize: 28, fontWeight: "900" },
  body: { color: colors.sub, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 21 },
  categoryList: { gap: 18, marginTop: 16 },
  category: { gap: 9 },
  categoryTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, fontWeight: "800" },
  chipList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.bg, borderColor: colors.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipDisabled: { opacity: 0.55 },
  chipText: { color: colors.sub, fontFamily: fonts.body, fontSize: 12.5 },
  chipTextActive: { color: colors.primaryDeep, fontFamily: fonts.bold, fontWeight: "800" },
  emptyText: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, marginTop: 10 },
  errorText: { color: colors.primaryDeep, fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 18 },
  successText: { color: colors.green, fontFamily: fonts.bold, fontSize: 13, textAlign: "center" },
  backButton: { alignItems: "center", borderColor: colors.line, borderRadius: 14, borderWidth: 1, padding: 13 },
  backButtonDisabled: { opacity: 0.5 },
  backText: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, fontWeight: "800" }
});
