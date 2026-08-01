import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createPersonalUnresolvedCandidate,
  type CatalogMealIdentificationCandidate,
  type MealIdentificationCandidate,
  type MealSourceContext
} from "../meal-identification";
import { buildCorrectionSections, buildNutritionSummary } from "./analysisCorrectionData";
import { getAnalysisSession, type AnalysisSessionState } from "./analysisSessionStore";
import { buildMealPhotoAnalysisActorIdentity } from "./mealPhotoAnalysisFlowState";
import { useConsumerRuntime } from "../consumer-runtime";
import { isMealOccurrenceTooFarInFuture } from "./mealOccurrenceTime";
import type {
  CorrectionSectionKey,
  MatchState,
  MealAnalysisMode,
  MealPhotoCaptureMethod,
  MealRecordTimingChoice
} from "./types";

export type ExplicitMealSourceChoice = "dine_in" | "takeout" | "delivery" | "self_cooked";

// MI-E-C5-R5-R3 §五: the caller passes the ownership-SAFE session view. Defaulting to
// getAnalysisSession() keeps every legacy caller working, but /analysis always passes the view
// derived by the pure render-time ownership authority, so a different actor, a signed-out runtime
// or an untrusted legacy session can never seed this hook with the previous actor's values.
export function useAnalysisCorrectionState(initialSession: AnalysisSessionState = getAnalysisSession()) {
  const session = initialSession;
  const consumerRuntimeForOwnership = useConsumerRuntime();
  // MI-E-C5-R5-R4 §十二: this hook mirrors the meal name, restaurant name, match state, corrections,
  // captured photo and meal timing — all actor-sensitive — into local state at mount, so it gets the
  // same actor ownership. Same frozen pair, PURE comparison, no mutation during render.
  const correctionActorIdentity = buildMealPhotoAnalysisActorIdentity({
    actorKey: consumerRuntimeForOwnership.state.actorKey,
    actorGeneration: consumerRuntimeForOwnership.state.actorGeneration
  });
  const stateOwnerIdentityRef = useRef(correctionActorIdentity);
  const isCurrentActorState = stateOwnerIdentityRef.current === correctionActorIdentity;
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
  const [capturedImageUri] = useState<string | null>(session.capturedImageUri);
  const [recordTiming, setRecordTiming] = useState<MealRecordTimingChoice>(session.recordTiming);
  const [recordTimingConfirmed, setRecordTimingConfirmed] = useState(session.recordTimingConfirmed);
  const [occurredAt, setOccurredAt] = useState<string | null>(session.occurredAt);

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
  });

  // ==========================================================================================
  // MI-E-C5-R5-R5 §三: THE single actor-safe derivation authority for this hook.
  //
  // Every public field — primitive or derived — is computed from these values and from nothing
  // else. When the internal state still belongs to a previous actor, each one falls back to the
  // ownership-safe session view, which in exactly that case IS the sanitized empty session. That
  // makes the whole public surface internally consistent: it is no longer possible for one field
  // to report a sanitized value while a derived neighbour still reflects the previous actor.
  //
  // Purely synchronous: comparisons and reads only. No setState, no store mutation, no effect
  // dependency, so the very first committed render after an actor change is already fail-closed.
  // ==========================================================================================
  const publicMode = isCurrentActorState ? mode : session.mode;
  const publicMealName = isCurrentActorState ? mealName : session.mealName;
  const publicRestaurantName = isCurrentActorState ? restaurantName : session.restaurantName;
  const publicCorrectedRows = isCurrentActorState ? correctedRows : session.correctedRows;
  const publicAddedSections = isCurrentActorState ? addedSections : session.addedSections;
  const publicNutritionRefreshed = isCurrentActorState ? nutritionRefreshed : session.nutritionRefreshed;
  const publicSourceContext = isCurrentActorState ? sourceContext : session.sourceContext;
  const publicMatchState = isCurrentActorState ? matchState : session.matchState;
  const publicCorrectionCompleted = isCurrentActorState ? correctionCompleted : session.correctionCompleted;
  const publicSelectedCandidate = isCurrentActorState ? selectedCandidate : session.selectedCandidate;
  const publicExpandedCorrection = isCurrentActorState ? expandedCorrection : session.expandedCorrection;
  const publicAddSection = isCurrentActorState ? addSection : session.addSection;
  const publicShowExternalBreakdown = isCurrentActorState ? showExternalBreakdown : session.showExternalBreakdown;
  const publicExternalBreakdownTriggered = isCurrentActorState ? externalBreakdownTriggered : session.externalBreakdownTriggered;
  const publicCaptureMethod = isCurrentActorState ? captureMethod : session.captureMethod;
  const publicCapturedImageUri = isCurrentActorState ? capturedImageUri : session.capturedImageUri;
  const publicRecordTiming = isCurrentActorState ? recordTiming : session.recordTiming;
  const publicRecordTimingConfirmed = isCurrentActorState ? recordTimingConfirmed : session.recordTimingConfirmed;
  const publicOccurredAt = isCurrentActorState ? occurredAt : session.occurredAt;

  // MI-E-C5-R5-R5 §五: derived from the actor-safe mode, never the raw one. A previous actor's
  // self-cooked mode therefore cannot route the current actor into SelfCookedIntro, and cannot
  // flip the restaurant-context branch either.
  const isSelfCooked = publicMode === "selfCooked";
  // MI-E-C5-R5-R5 §六: derived from the actor-safe added sections, so a previous actor's added
  // correction sections and their ingredient copy are empty for the current actor.
  const correctionSections = useMemo(() => buildCorrectionSections(publicAddedSections), [publicAddedSections]);
  // MI-E-C5-R5-R5 §四: every input is actor-safe. On a mismatch this is the canonical summary of a
  // sanitized empty session — no previous-actor calories, macros, portion, balance score or
  // ingredient text, and no correction- or name-derived adjustment. It is not static fake data:
  // it is what buildNutritionSummary genuinely produces for an empty, unrefreshed session, and it
  // never accompanies a completed/confirmed presentation because matchState is sanitized too.
  const nutritionSummary = useMemo(
    () =>
      buildNutritionSummary({
        addedSections: publicAddedSections,
        correctedRows: publicCorrectedRows,
        mealName: publicMealName,
        nutritionRefreshed: publicNutritionRefreshed,
        restaurantName: publicRestaurantName
      }),
    [publicAddedSections, publicCorrectedRows, publicMealName, publicNutritionRefreshed, publicRestaurantName]
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

  // Canceling/dismissing the native date-time picker mid-edit: never leaves a half-completed
  // post_hoc intent and never silently forces "current" on the user's behalf. Returns to the
  // not-yet-completed confirmation prompt (recordTiming reset to "current" but still
  // unconfirmed) so the next render shows the current/post-hoc choice again.
  function cancelRecordTimingPostHoc() {
    if (captureMethod === "camera") return;
    setRecordTiming("current");
    setRecordTimingConfirmed(false);
    setOccurredAt(null);
  }

  // Validates and commits an explicit post-hoc date+time selection produced by the native
  // date/time picker. A Date returned by that picker already represents an unambiguous
  // absolute instant, so toISOString() is the correct occurredAt with no further timezone
  // arithmetic. Rejects meal times that are meaningfully in the future. Returns false (no
  // state change) on any rejection so the picker UI can keep prompting instead of silently
  // accepting bad input.
  function setPostHocMealTime(occurredAtValue: Date): boolean {
    if (captureMethod === "camera") return false;
    if (!(occurredAtValue instanceof Date) || Number.isNaN(occurredAtValue.getTime())) return false;
    const iso = occurredAtValue.toISOString();
    if (isMealOccurrenceTooFarInFuture(iso)) return false;
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

  // MI-E-C5-R5-R5 §七: derived from the actor-safe source context, not the raw one.
  const mealSource: ExplicitMealSourceChoice | null =
    publicSourceContext === "dine_in" ||
    publicSourceContext === "takeout" ||
    publicSourceContext === "delivery" ||
    publicSourceContext === "self_cooked"
      ? publicSourceContext
      : null;

  // Commit-phase internal clearing back to the ownership-safe session values.
  useLayoutEffect(() => {
    if (stateOwnerIdentityRef.current === correctionActorIdentity) return;
    stateOwnerIdentityRef.current = correctionActorIdentity;
    setMatchState(session.matchState);
    setMode(session.mode);
    setExpandedCorrection(session.expandedCorrection);
    setAddSection(session.addSection);
    setAddedSections(session.addedSections);
    setNutritionRefreshed(session.nutritionRefreshed);
    setCorrectionCompleted(session.correctionCompleted);
    setShowExternalBreakdown(session.showExternalBreakdown);
    setExternalBreakdownTriggered(session.externalBreakdownTriggered);
    setRestaurantName(session.restaurantName);
    setMealName(session.mealName);
    setSourceContext(session.sourceContext);
    setSelectedCandidate(session.selectedCandidate);
    setCorrectedRows(session.correctedRows);
    setRecordTiming(session.recordTiming);
    setRecordTimingConfirmed(session.recordTimingConfirmed);
    setOccurredAt(session.occurredAt);
  }, [correctionActorIdentity, session]);

  // MI-E-C5-R5-R4 §四: synchronous actor-safe public view for every actor-sensitive field. When the
  // internal state still belongs to a previous actor each value falls back to the ownership-safe
  // session view (the sanitized empty session in exactly that case), so Actor A's meal name,
  // restaurant, confirmed match state, corrections, photo and meal timing cannot render for Actor B
  // — including through the legacy confirmed-match hero, which reads matchState and mealName.
  // MI-E-C5-R5-R5 §十: every mutating handler fails closed on an actor mismatch, so a previous
  // actor's stale internal state can never be promoted into the current actor's state, written
  // back to the session, or turned into new derived nutrition. UI hiding is never the authority.
  function actorOwnedHandler<Args extends unknown[], Result>(
    handler: (...args: Args) => Result
  ): (...args: Args) => Result | undefined {
    return (...args: Args) => (isCurrentActorState ? handler(...args) : undefined);
  }
  // setPostHocMealTime reports whether the chosen time was accepted, and its caller renders an
  // error when it is not. A mismatched actor must therefore get an explicit `false` ("not
  // accepted") rather than `undefined`, so the fail-closed path stays type-correct and honest.
  function actorOwnedBooleanHandler<Args extends unknown[]>(
    handler: (...args: Args) => boolean
  ): (...args: Args) => boolean {
    return (...args: Args) => (isCurrentActorState ? handler(...args) : false);
  }

  // MI-E-C5-R5-R5 §七: the complete public surface. Every actor-sensitive field — primitive OR
  // derived — reads from the actor-safe values above; every mutating handler is wrapped.
  return {
    isCurrentActorState,
    addSection: publicAddSection,
    confirmAddedSection: actorOwnedHandler(confirmAddedSection),
    confirmCorrectionRow: actorOwnedHandler(confirmCorrectionRow),
    completeCorrection: actorOwnedHandler(completeCorrection),
    correctedRows: publicCorrectedRows,
    correctionCompleted: publicCorrectionCompleted,
    correctionSections,
    chooseNoneOfTheAbove: actorOwnedHandler(chooseNoneOfTheAbove),
    confirmCatalogCandidate: actorOwnedHandler(confirmCatalogCandidate),
    expandedCorrection: publicExpandedCorrection,
    externalBreakdownTriggered: publicExternalBreakdownTriggered,
    hasRestaurantContext: !isSelfCooked,
    isSelfCooked,
    matchState: publicMatchState,
    mealName: publicMealName,
    mode: publicMode,
    nutritionSummary,
    nutritionRefreshed: publicNutritionRefreshed,
    openCatalogUnavailableFallback: actorOwnedHandler(openCatalogUnavailableFallback),
    openSupplementalData: actorOwnedHandler(openSupplementalData),
    restaurantName: publicRestaurantName,
    selectedCandidate: publicSelectedCandidate,
    selectCatalogCandidate: actorOwnedHandler(selectCatalogCandidate),
    setMatchState: actorOwnedHandler(setMatchState),
    setMealName: actorOwnedHandler(updateMealName),
    setMode: actorOwnedHandler(updateMode),
    setSourceContext: actorOwnedHandler(setSourceContext),
    setRestaurantName: actorOwnedHandler(updateRestaurantName),
    showExternalBreakdown: publicShowExternalBreakdown,
    sourceContext: publicSourceContext,
    toggleAddSection: actorOwnedHandler(toggleAddSection),
    toggleCorrectionRow: actorOwnedHandler(toggleCorrectionRow),
    toggleExternalBreakdown: actorOwnedHandler(toggleExternalBreakdown),
    captureMethod: publicCaptureMethod,
    capturedImageUri: publicCapturedImageUri,
    recordTiming: publicRecordTiming,
    recordTimingConfirmed: publicRecordTimingConfirmed,
    occurredAt: publicOccurredAt,
    mealSource,
    setMealSource: actorOwnedHandler(setMealSource),
    confirmRecordTimingCurrent: actorOwnedHandler(confirmRecordTimingCurrent),
    beginRecordTimingPostHoc: actorOwnedHandler(beginRecordTimingPostHoc),
    cancelRecordTimingPostHoc: actorOwnedHandler(cancelRecordTimingPostHoc),
    setPostHocMealTime: actorOwnedBooleanHandler(setPostHocMealTime)
  };
}
