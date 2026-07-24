import { useEffect, useMemo, useState } from "react";
import {
  createPersonalUnresolvedCandidate,
  type CatalogMealIdentificationCandidate,
  type MealIdentificationCandidate,
  type MealSourceContext
} from "../meal-identification";
import { buildCorrectionSections, buildNutritionSummary } from "./analysisCorrectionData";
import { getAnalysisSession } from "./analysisSessionStore";
import {
  isMealOccurrenceTooFarInFuture,
  isValidDateKey,
  isValidTimeKey,
  zonedWallClockToIsoInstant
} from "./mealOccurrenceTime";
import type {
  CorrectionSectionKey,
  MatchState,
  MealAnalysisMode,
  MealPhotoCaptureMethod,
  MealRecordTimingChoice
} from "./types";

export type ExplicitMealSourceChoice = "dine_in" | "takeout" | "self_cooked";

export function useAnalysisCorrectionState() {
  const session = getAnalysisSession();
  const [matchState, setMatchState] = useState<MatchState>(session.matchState);
  const [mode, setMode] = useState<MealAnalysisMode>(session.mode);
  const [expandedCorrection, setExpandedCorrection] = useState<string | null>(session.expandedCorrection);
  const [addSection, setAddSection] = useState<CorrectionSectionKey | null>(session.addSection);
  const [addedSections, setAddedSections] = useState<Record<CorrectionSectionKey, boolean>>(session.addedSections);
  const [nutritionRefreshed, setNutritionRefreshed] = useState(session.nutritionRefreshed);
  const [correctionCompleted, setCorrectionCompleted] = useState(session.correctionCompleted);
  const [showExternalBreakdown, setShowExternalBreakdown] = useState(session.showExternalBreakdown);
  const [externalBreakdownTriggered, setExternalBreakdownTriggered] = useState(session.externalBreakdownTriggered);
  const [restaurantName, setRestaurantName] = useState<string>(session.restaurantName);
  const [mealName, setMealName] = useState<string>(session.mealName);
  const [sourceContext, setSourceContext] = useState<MealSourceContext>(session.sourceContext);
  const [selectedCandidate, setSelectedCandidate] = useState<MealIdentificationCandidate | null>(
    session.selectedCandidate
  );
  const [correctedRows, setCorrectedRows] = useState<Record<string, boolean>>(session.correctedRows);
  const [captureMethod] = useState<MealPhotoCaptureMethod | null>(session.captureMethod);
  const [recordTiming, setRecordTiming] = useState<MealRecordTimingChoice>(session.recordTiming);
  const [recordTimingConfirmed, setRecordTimingConfirmed] = useState(session.recordTimingConfirmed);
  const [occurredAt, setOccurredAt] = useState<string | null>(session.occurredAt);
  const [postHocDateKey, setPostHocDateKey] = useState<string | null>(session.postHocDateKey);
  const [postHocTimeKey, setPostHocTimeKey] = useState<string | null>(session.postHocTimeKey);

  // Keep the session store in sync so a remount (navigating away and back) restores
  // this exact state instead of starting the correction flow over.
  useEffect(() => {
    session.matchState = matchState;
    session.mode = mode;
    session.expandedCorrection = expandedCorrection;
    session.addSection = addSection;
    session.addedSections = addedSections;
    session.nutritionRefreshed = nutritionRefreshed;
    session.correctionCompleted = correctionCompleted;
    session.showExternalBreakdown = showExternalBreakdown;
    session.externalBreakdownTriggered = externalBreakdownTriggered;
    session.restaurantName = restaurantName;
    session.mealName = mealName;
    session.sourceContext = sourceContext;
    session.selectedCandidate = selectedCandidate;
    session.correctedRows = correctedRows;
    session.recordTiming = recordTiming;
    session.recordTimingConfirmed = recordTimingConfirmed;
    session.occurredAt = occurredAt;
    session.postHocDateKey = postHocDateKey;
    session.postHocTimeKey = postHocTimeKey;
  });

  const isSelfCooked = mode === "selfCooked";
  const correctionSections = useMemo(() => buildCorrectionSections(addedSections), [addedSections]);
  const nutritionSummary = useMemo(
    () => buildNutritionSummary({ addedSections, correctedRows, mealName, nutritionRefreshed, restaurantName }),
    [addedSections, correctedRows, mealName, nutritionRefreshed, restaurantName]
  );

  function refreshNutrition() {
    setNutritionRefreshed(true);
  }

  function updateRestaurantName(value: string) {
    setRestaurantName(value);
    selectPersonalUnresolved("manual", value, mealName);
    setMatchState("editing");
    refreshNutrition();
  }

  function updateMealName(value: string) {
    setMealName(value);
    selectPersonalUnresolved("manual", restaurantName, value);
    setMatchState("editing");
    refreshNutrition();
  }

  function selectPersonalUnresolved(
    source: "manual" | "none_of_the_above" | "self_cooked" | "catalog_unavailable",
    nextRestaurantName = restaurantName,
    nextMealName = mealName
  ) {
    setSelectedCandidate(
      createPersonalUnresolvedCandidate({
        source,
        restaurantName: nextRestaurantName,
        mealItemName: nextMealName
      })
    );
  }

  function selectCatalogCandidate(candidate: CatalogMealIdentificationCandidate) {
    setMode("restaurant");
    if (sourceContext === "self_cooked") setSourceContext("unknown");
    setSelectedCandidate(candidate);
    setRestaurantName(candidate.restaurantName);
    setMealName(candidate.mealItemName);
    setMatchState("pending");
  }

  function confirmCatalogCandidate(candidate?: CatalogMealIdentificationCandidate) {
    const resolved =
      candidate ?? (selectedCandidate?.kind === "catalog_item" ? selectedCandidate : null);
    if (!resolved) return;
    setMode("restaurant");
    if (sourceContext === "self_cooked") setSourceContext("unknown");
    setSelectedCandidate(resolved);
    setRestaurantName(resolved.restaurantName);
    setMealName(resolved.mealItemName);
    setMatchState("confirmed");
  }

  function openUnresolvedFallback(
    source: "none_of_the_above" | "catalog_unavailable"
  ) {
    selectPersonalUnresolved(source);
    setMatchState("editing");
    setShowExternalBreakdown(true);
    setExternalBreakdownTriggered(true);
    setExpandedCorrection(null);
    setAddSection(null);
  }

  function chooseNoneOfTheAbove() {
    openUnresolvedFallback("none_of_the_above");
  }

  function openCatalogUnavailableFallback() {
    openUnresolvedFallback("catalog_unavailable");
  }

  function updateMode(nextMode: MealAnalysisMode) {
    setMode(nextMode);
    setMatchState("pending");
    if (nextMode === "selfCooked") {
      setSourceContext("self_cooked");
      setRestaurantName("");
      selectPersonalUnresolved("self_cooked", "", mealName);
      return;
    }
    setSourceContext("unknown");
    setSelectedCandidate(null);
  }

  // Explicit three-way meal source choice (dine_in / takeout / self_cooked). Never defaults
  // to dine_in — the caller only invokes this from an actual user gesture. Preserves an
  // already-selected/confirmed Catalog candidate when just toggling between dine_in and
  // takeout (only crossing the self_cooked boundary resets candidate-related state).
  function setMealSource(value: ExplicitMealSourceChoice) {
    if (value === "self_cooked") {
      if (mode !== "selfCooked") updateMode("selfCooked");
      return;
    }
    if (mode === "selfCooked") {
      updateMode("restaurant");
    }
    setSourceContext(value);
  }

  // Photo-library "這是現在的餐點": occurredAt is the moment of this explicit confirmation,
  // never the RPC execution time (that distinction is enforced further down the canonical
  // chain, but the intent starts here). Also the safe target when canceling out of an
  // in-progress post-hoc picker — never leaves a half-completed post-hoc intent behind.
  function confirmRecordTimingCurrent() {
    setRecordTiming("current");
    setRecordTimingConfirmed(true);
    setOccurredAt(new Date().toISOString());
    setPostHocDateKey(null);
    setPostHocTimeKey(null);
  }

  // Photo-library "這是之前吃的，現在補登": switches to post_hoc but stays unconfirmed
  // (occurredAt cleared) until setPostHocMealTime succeeds. Camera sessions never call this —
  // the UI never renders the toggle for captureMethod === "camera".
  function beginRecordTimingPostHoc() {
    if (captureMethod === "camera") return;
    setRecordTiming("post_hoc");
    setRecordTimingConfirmed(false);
    setOccurredAt(null);
  }

  // Validates and commits an explicit post-hoc date+time selection. Rejects invalid shapes
  // and meal times that are meaningfully in the future. Returns false (no state change) on
  // any rejection so the picker UI can keep prompting instead of silently accepting bad input.
  function setPostHocMealTime(dateKey: string, timeKey: string, timezone: string): boolean {
    if (captureMethod === "camera") return false;
    if (!isValidDateKey(dateKey) || !isValidTimeKey(timeKey)) return false;
    const iso = zonedWallClockToIsoInstant(dateKey, timeKey, timezone);
    if (!iso || isMealOccurrenceTooFarInFuture(iso)) return false;
    setPostHocDateKey(dateKey);
    setPostHocTimeKey(timeKey);
    setOccurredAt(iso);
    setRecordTiming("post_hoc");
    setRecordTimingConfirmed(true);
    return true;
  }

  function toggleExternalBreakdown() {
    const nextState = !showExternalBreakdown;
    setShowExternalBreakdown(nextState);
    setExternalBreakdownTriggered(nextState);
    setExpandedCorrection(null);
    setAddSection(null);
  }

  function openSupplementalData() {
    setShowExternalBreakdown(true);
    setExternalBreakdownTriggered(true);
    setExpandedCorrection(null);
    setAddSection(null);
    setRestaurantName("");
    setMealName("");
    selectPersonalUnresolved("none_of_the_above", "", "");
    setMatchState("editing");
    refreshNutrition();
  }

  function toggleAddSection(sectionKey: CorrectionSectionKey) {
    setExpandedCorrection(null);
    setAddSection((current) => (current === sectionKey ? null : sectionKey));
  }

  function toggleCorrectionRow(rowKey: string) {
    setAddSection(null);
    setExpandedCorrection((current) => (current === rowKey ? null : rowKey));
  }

  function confirmCorrectionRow(rowKey: string) {
    setExpandedCorrection(null);
    setCorrectedRows((current) => ({ ...current, [rowKey]: true }));
    setNutritionRefreshed(true);
  }

  function confirmAddedSection(sectionKey: CorrectionSectionKey) {
    setAddedSections((current) => ({ ...current, [sectionKey]: true }));
    setAddSection(null);
    setCorrectedRows((current) => ({ ...current, [`${sectionKey}-added`]: true }));
    setNutritionRefreshed(true);
  }

  function completeCorrection() {
    setExpandedCorrection(null);
    setAddSection(null);
    setNutritionRefreshed(true);
    setCorrectionCompleted(true);
  }

  const mealSource: ExplicitMealSourceChoice | null =
    sourceContext === "dine_in" || sourceContext === "takeout" || sourceContext === "self_cooked"
      ? sourceContext
      : null;

  return {
    addSection,
    confirmAddedSection,
    confirmCorrectionRow,
    completeCorrection,
    correctedRows,
    correctionCompleted,
    correctionSections,
    chooseNoneOfTheAbove,
    confirmCatalogCandidate,
    expandedCorrection,
    externalBreakdownTriggered,
    hasRestaurantContext: !isSelfCooked,
    isSelfCooked,
    matchState,
    mealName,
    mode,
    nutritionSummary,
    nutritionRefreshed,
    openCatalogUnavailableFallback,
    openSupplementalData,
    restaurantName,
    selectedCandidate,
    selectCatalogCandidate,
    setMatchState,
    setMealName: updateMealName,
    setMode: updateMode,
    setSourceContext,
    setRestaurantName: updateRestaurantName,
    showExternalBreakdown,
    sourceContext,
    toggleAddSection,
    toggleCorrectionRow,
    toggleExternalBreakdown,
    captureMethod,
    recordTiming,
    recordTimingConfirmed,
    occurredAt,
    postHocDateKey,
    postHocTimeKey,
    mealSource,
    setMealSource,
    confirmRecordTimingCurrent,
    beginRecordTimingPostHoc,
    setPostHocMealTime
  };
}
