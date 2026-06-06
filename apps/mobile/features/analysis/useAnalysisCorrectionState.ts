import { useMemo, useState } from "react";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { buildCorrectionSections, buildNutritionSummary } from "./analysisCorrectionData";
import type { CorrectionSectionKey, MatchState, MealAnalysisMode } from "./types";

export function useAnalysisCorrectionState() {
  const [matchState, setMatchState] = useState<MatchState>("pending");
  const [mode, setMode] = useState<MealAnalysisMode>("restaurant");
  const [expandedCorrection, setExpandedCorrection] = useState<string | null>(null);
  const [addSection, setAddSection] = useState<CorrectionSectionKey | null>(null);
  const [addedSections, setAddedSections] = useState<Record<CorrectionSectionKey, boolean>>({
    ingredients: false,
    portions: false,
    cooking: false
  });
  const [nutritionRefreshed, setNutritionRefreshed] = useState(false);
  const [correctionCompleted, setCorrectionCompleted] = useState(false);
  const [showExternalBreakdown, setShowExternalBreakdown] = useState(false);
  const [externalBreakdownTriggered, setExternalBreakdownTriggered] = useState(false);
  const [restaurantName, setRestaurantName] = useState<string>(zhTW.mobile.analysis.candidates[0].restaurant);
  const [mealName, setMealName] = useState<string>(zhTW.mobile.analysis.candidates[0].meal);
  const [correctedRows, setCorrectedRows] = useState<Record<string, boolean>>({});

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
    refreshNutrition();
  }

  function updateMealName(value: string) {
    setMealName(value);
    refreshNutrition();
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

  return {
    addSection,
    confirmAddedSection,
    confirmCorrectionRow,
    completeCorrection,
    correctedRows,
    correctionCompleted,
    correctionSections,
    expandedCorrection,
    externalBreakdownTriggered,
    hasRestaurantContext: !isSelfCooked,
    isSelfCooked,
    matchState,
    mealName,
    mode,
    nutritionSummary,
    nutritionRefreshed,
    openSupplementalData,
    restaurantName,
    setMatchState,
    setMealName: updateMealName,
    setMode,
    setRestaurantName: updateRestaurantName,
    showExternalBreakdown,
    toggleAddSection,
    toggleCorrectionRow,
    toggleExternalBreakdown
  };
}
