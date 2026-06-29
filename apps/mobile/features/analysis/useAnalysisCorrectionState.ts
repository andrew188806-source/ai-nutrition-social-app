import { useEffect, useMemo, useState } from "react";
import { buildCorrectionSections, buildNutritionSummary } from "./analysisCorrectionData";
import { getAnalysisSession } from "./analysisSessionStore";
import type { CorrectionSectionKey, MatchState, MealAnalysisMode } from "./types";

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
  const [correctedRows, setCorrectedRows] = useState<Record<string, boolean>>(session.correctedRows);

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
    session.correctedRows = correctedRows;
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
