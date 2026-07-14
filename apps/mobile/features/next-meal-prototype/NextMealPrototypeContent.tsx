import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, Chip, SectionHeader } from "../../theme/components";
import { Icon } from "../../theme/icons";
import { fonts, hexA, radius, snowPalette as colors } from "../../theme/tokens";
import { presentU1NextMealResult } from "./nextMealPrototypePresenter";
import type { U1NextMealCandidateViewModel, U1NextMealPrototypeProvider, U1NextMealPrototypeScenario, U1NextMealScreenViewModel } from "./types";

export function NextMealPrototypeContent({
  entitlement,
  onReturnHome,
  onUseForMealBuddy,
  preferredPrototypeId,
  provider,
  scenario
}: {
  entitlement?: unknown;
  onReturnHome: () => void;
  onUseForMealBuddy: (candidate: U1NextMealCandidateViewModel) => void;
  preferredPrototypeId?: string;
  provider: U1NextMealPrototypeProvider;
  scenario?: U1NextMealPrototypeScenario;
}) {
  const copy = zhTW.mobile.nextMealPrototype;
  const [retryCount, setRetryCount] = useState(0);
  const [model, setModel] = useState<U1NextMealScreenViewModel>({ status: "loading" });

  const load = useCallback(() => {
    let active = true;
    setModel({ status: "loading" });
    provider
      .getRecommendation({ entitlement, preferredPrototypeId, scenario })
      .then((result) => {
        if (active) setModel(presentU1NextMealResult(result));
      })
      .catch(() => {
        if (active) setModel({ status: "error", message: copy.errorBody, retryable: true });
      });
    return () => {
      active = false;
    };
  }, [copy.errorBody, entitlement, preferredPrototypeId, provider, retryCount, scenario]);

  useEffect(load, [load]);

  if (model.status === "loading") {
    return <NextMealStateCard icon="spark" title={copy.loadingTitle} body={copy.loadingBody} />;
  }

  if (model.status === "disabled") {
    return (
      <NextMealStateCard icon="lock" title={copy.disabledTitle} body={model.message}>
        <StateAction label={copy.returnHome} onPress={onReturnHome} />
      </NextMealStateCard>
    );
  }

  if (model.status === "empty") {
    return (
      <NextMealStateCard icon="plate" title={copy.emptyTitle} body={model.message}>
        <StateAction label={copy.returnHome} onPress={onReturnHome} />
      </NextMealStateCard>
    );
  }

  if (model.status === "error") {
    return (
      <NextMealStateCard icon="spark" title={copy.errorTitle} body={model.message}>
        <View style={styles.stateActionRow}>
          {model.retryable ? <StateAction label={copy.retry} onPress={() => setRetryCount((count) => count + 1)} /> : null}
          <StateAction label={copy.returnHome} onPress={onReturnHome} />
        </View>
      </NextMealStateCard>
    );
  }

  const selectedCandidate = model.recommendation.candidates.find((candidate) => candidate.prototypeId === model.selectedCandidateId) ?? null;
  const confirmed = Boolean(selectedCandidate && model.confirmedCandidateId === selectedCandidate.prototypeId);
  const candidateCountLabel = model.recommendation.entitlement === "premium"
    ? copy.premiumCandidateCount.replace("{count}", String(model.recommendation.visibleCandidateCount))
    : copy.freeCandidateCount.replace("{count}", String(model.recommendation.visibleCandidateCount));

  function selectCandidate(candidate: U1NextMealCandidateViewModel) {
    if (model.status !== "success") return;
    setModel(presentU1NextMealResult({ status: "success", recommendation: model.recommendation }, candidate.prototypeId));
  }

  function confirmSelectedCandidate() {
    if (model.status !== "success" || !model.selectedCandidateId) return;
    setModel(presentU1NextMealResult({ status: "success", recommendation: model.recommendation }, model.selectedCandidateId, model.selectedCandidateId));
  }

  return (
    <Card tone="primary" style={styles.resultCard}>
      <View style={styles.badgeRow}>
        <View style={styles.sampleBadge}>
          <Text style={styles.sampleBadgeText}>{copy.sampleBadge}</Text>
        </View>
        <Text style={styles.sourceText}>{copy.presentationOnly}</Text>
      </View>
      <SectionHeader title={model.recommendation.headline} subtitle={copy.successSubtitle} />
      <Text style={styles.entitlementText}>{candidateCountLabel}</Text>

      <View style={styles.candidateList}>
        {model.recommendation.candidates.map((candidate) => {
          const selected = candidate.prototypeId === model.selectedCandidateId;
          return (
            <Pressable
              accessibilityHint={copy.selectCandidateHint}
              accessibilityRole="button"
              key={candidate.prototypeId}
              onPress={() => selectCandidate(candidate)}
              style={({ pressed }) => [styles.candidateCard, selected && styles.candidateCardSelected, pressed && styles.actionPressed]}
            >
              <View style={styles.candidateTopRow}>
                <View style={styles.mealIcon}>
                  <Text style={styles.mealEmoji}>{candidate.emoji ?? "TK"}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.candidateLabelRow}>
                    <Text style={styles.orderLabel}>{candidate.isBestRecommendation ? copy.bestBadge : copy.alternativeBadge.replace("{index}", String(candidate.ordinal))}</Text>
                    {selected ? <Text style={styles.selectedBadge}>{copy.selectedBadge}</Text> : null}
                  </View>
                  <Text style={styles.mealName}>{candidate.mealName}</Text>
                  <Text style={styles.mealMeta}>{[candidate.restaurantName, candidate.areaLabel, candidate.calorieLabel].filter(Boolean).join(" · ")}</Text>
                </View>
                <Icon name={selected ? "check" : "chevron"} size={18} color={selected ? colors.primaryDeep : colors.faint} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedCandidate ? (
        <View style={styles.selectedDetail}>
          <View style={styles.chipRow}>
            {selectedCandidate.tags.map((tag) => <Chip key={tag} label={tag} />)}
          </View>
          <View style={styles.reasonBox}>
            <Text style={styles.reasonTitle}>{copy.reasonTitle}</Text>
            <Text style={styles.reasonSummary}>{selectedCandidate.reasonSummary}</Text>
            {selectedCandidate.reasonDetails.map((detail) => <Text key={detail} style={styles.reasonDetail}>· {detail}</Text>)}
          </View>
        </View>
      ) : (
        <View style={styles.selectionPrompt}>
          <Icon name="plate" size={17} color={colors.primaryDeep} />
          <Text style={styles.selectionPromptText}>{copy.selectionRequired}</Text>
        </View>
      )}

      {confirmed ? (
        <View style={styles.confirmationBox}>
          <Icon name="check" size={16} color={colors.green} />
          <Text style={styles.confirmationText}>{copy.confirmedBody}</Text>
        </View>
      ) : null}

      <View style={styles.actionStack}>
        <Pressable
          accessibilityRole="button"
          disabled={!selectedCandidate}
          style={({ pressed }) => [styles.primaryAction, !selectedCandidate && styles.actionDisabled, pressed && selectedCandidate && styles.actionPressed]}
          onPress={confirmSelectedCandidate}
        >
          <Icon name="check" size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>{copy.confirmMeal}</Text>
        </Pressable>
        <Pressable
          accessibilityHint={copy.buddyHint}
          accessibilityRole="button"
          disabled={!selectedCandidate}
          style={({ pressed }) => [styles.secondaryAction, !selectedCandidate && styles.actionDisabled, pressed && selectedCandidate && styles.actionPressed]}
          onPress={() => {
            if (selectedCandidate) onUseForMealBuddy(selectedCandidate);
          }}
        >
          <Icon name="buddies" size={18} color={colors.primaryDeep} />
          <Text style={styles.secondaryActionText}>{copy.findBuddy}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function NextMealStateCard({ body, children, icon, title }: { body: string; children?: ReactNode; icon: "lock" | "plate" | "spark"; title: string }) {
  return (
    <Card style={styles.stateCard}>
      <View style={styles.stateIcon}><Icon name={icon} size={20} color={colors.primaryDeep} /></View>
      <SectionHeader title={title} subtitle={body} />
      {children}
    </Card>
  );
}

function StateAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.stateButton} onPress={onPress}>
      <Text style={styles.stateButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  resultCard: { gap: 16 },
  badgeRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sampleBadge: { backgroundColor: colors.aiSoft, borderColor: hexA(colors.ai, 0.2), borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  sampleBadgeText: { color: colors.ai, fontFamily: fonts.bold, fontSize: 11, fontWeight: "900" },
  sourceText: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11 },
  entitlementText: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  candidateList: { gap: 10 },
  candidateCard: { backgroundColor: colors.card, borderColor: colors.line, borderRadius: radius.base, borderWidth: 1, padding: 13 },
  candidateCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 },
  candidateTopRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  mealIcon: { alignItems: "center", backgroundColor: colors.bg2, borderRadius: radius.base, height: 52, justifyContent: "center", width: 52 },
  mealEmoji: { color: colors.primaryDeep, fontFamily: fonts.black, fontSize: 17, fontWeight: "900" },
  flex: { flex: 1, gap: 4 },
  candidateLabelRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 7 },
  orderLabel: { color: colors.primaryDeep, fontFamily: fonts.bold, fontSize: 11, fontWeight: "900" },
  selectedBadge: { backgroundColor: colors.primary, borderRadius: 999, color: "#FFFFFF", fontFamily: fonts.bold, fontSize: 10.5, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3 },
  mealName: { color: colors.ink, fontFamily: fonts.black, fontSize: 17, fontWeight: "900" },
  mealMeta: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  selectedDetail: { gap: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonBox: { backgroundColor: colors.card, borderColor: colors.line, borderRadius: radius.base, borderWidth: 1, gap: 7, padding: 14 },
  reasonTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, fontWeight: "900" },
  reasonSummary: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  reasonDetail: { color: colors.sub, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  selectionPrompt: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.line, borderRadius: radius.base, borderWidth: 1, flexDirection: "row", gap: 8, padding: 13 },
  selectionPromptText: { color: colors.sub, flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  confirmationBox: { alignItems: "center", backgroundColor: hexA(colors.green, 0.14), borderRadius: radius.base, flexDirection: "row", gap: 8, padding: 12 },
  confirmationText: { color: colors.ink, flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  actionStack: { gap: 10 },
  primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.base, flexDirection: "row", gap: 8, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 14 },
  primaryActionText: { color: "#FFFFFF", fontFamily: fonts.bold, fontSize: 14, fontWeight: "900" },
  secondaryAction: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primary, borderRadius: radius.base, borderWidth: 1, flexDirection: "row", gap: 8, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 14 },
  secondaryActionText: { color: colors.primaryDeep, fontFamily: fonts.bold, fontSize: 14, fontWeight: "900" },
  actionDisabled: { opacity: 0.42 },
  actionPressed: { opacity: 0.78 },
  stateCard: { alignItems: "stretch", gap: 14 },
  stateIcon: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: radius.base, height: 42, justifyContent: "center", width: 42 },
  stateActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stateButton: { alignItems: "center", alignSelf: "flex-start", borderColor: colors.primary, borderRadius: radius.base, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  stateButtonText: { color: colors.primaryDeep, fontFamily: fonts.bold, fontSize: 13, fontWeight: "900" }
});
