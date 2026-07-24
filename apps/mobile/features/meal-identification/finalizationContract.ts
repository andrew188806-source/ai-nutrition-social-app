import type {
  ConsumerMealCorrectionDetail,
  ConsumerNutritionSnapshot
} from "../consumer-meals/types";
import type { ConsumerAnalysisMealWriteDraft } from "../consumer-runtime/consumerMealWriteMapper";
import type {
  CatalogMealCandidateIdentity,
  CatalogMealIdentificationCandidate,
  MealSourceContext,
  PersonalUnresolvedMealCandidate,
  PersonalUnresolvedMealIdentity,
  PersonalUnresolvedReason
} from "./types";

export const MEAL_IDENTIFICATION_FINALIZATION_VERSION =
  "meal-identification-finalization-v1" as const;

export type MealIdentificationFinalizationVersion =
  typeof MEAL_IDENTIFICATION_FINALIZATION_VERSION;

export type MealIdentificationOriginalAnalysisSnapshot = Readonly<{
  status: "available" | "unavailable";
  detectedItemNames: readonly string[];
  model: Readonly<{ name: string; version: string }> | null;
  photoReferences: readonly string[];
  estimatedNutrition: Readonly<ConsumerNutritionSnapshot> | null;
  confidence: number | null;
  analyzedAt: string | null;
}>;

export type MealIdentificationCorrectionEventInput = Readonly<{
  correctedAt: string;
  correctionReason: string | null;
  detail: ConsumerMealCorrectionDetail;
}>;

export type MealIdentificationCorrectionEvent = Readonly<{
  ordinal: number;
  correctedAt: string;
  correctionReason: string | null;
  detail: ConsumerMealCorrectionDetail;
}>;

export type MealIdentificationCatalogSelectionInput = Readonly<{
  kind: "catalog_selection";
  confirmationStatus: "confirmed" | "pending";
  sourceContext: MealSourceContext;
  candidate: CatalogMealIdentificationCandidate;
}>;

export type MealIdentificationUnresolvedSelectionInput = Readonly<{
  kind: "personal_unresolved_selection";
  sourceContext: MealSourceContext;
  candidate: PersonalUnresolvedMealCandidate;
}>;

export type MealIdentificationFinalSelectionInput =
  | MealIdentificationCatalogSelectionInput
  | MealIdentificationUnresolvedSelectionInput;

export type MealIdentificationConfirmedCatalogSelection = Readonly<{
  kind: "confirmed_catalog";
  sourceContext: MealSourceContext;
  identity: Readonly<CatalogMealCandidateIdentity>;
  candidateSnapshot: Readonly<CatalogMealIdentificationCandidate>;
  catalogSource: CatalogMealIdentificationCandidate["source"];
  identityClaimStatus: "pending_server_validation";
}>;

export type MealIdentificationPersonalUnresolvedSelection = Readonly<{
  kind: "personal_unresolved";
  sourceContext: MealSourceContext;
  reason: PersonalUnresolvedReason;
  identity: Readonly<PersonalUnresolvedMealIdentity>;
  restaurantName: string;
  mealItemName: string;
}>;

export type MealIdentificationFinalSelection =
  | MealIdentificationConfirmedCatalogSelection
  | MealIdentificationPersonalUnresolvedSelection;

export type MealIdentificationMealWriteProjectionInput = Readonly<{
  selectedMealPeriod: string;
  mealName: string;
  portion: string | null;
  nutrition: ConsumerNutritionSnapshot;
  isSelfCooked: boolean;
  wasUserCorrected: boolean;
}>;

export type MealIdentificationFinalizationInput = Readonly<{
  version: MealIdentificationFinalizationVersion;
  originalAnalysis: MealIdentificationOriginalAnalysisSnapshot;
  selection: MealIdentificationFinalSelectionInput;
  corrections: readonly MealIdentificationCorrectionEventInput[];
  mealWrite: MealIdentificationMealWriteProjectionInput;
}>;

export type MealIdentificationFinalizationCommand = Readonly<{
  version: MealIdentificationFinalizationVersion;
  originalAnalysis: MealIdentificationOriginalAnalysisSnapshot;
  selection: MealIdentificationFinalSelection;
  corrections: readonly MealIdentificationCorrectionEvent[];
  mealWrite: MealIdentificationMealWriteProjectionInput;
}>;

export type MealIdentificationFinalizationErrorCode =
  | "unsupported_version"
  | "invalid_original_analysis"
  | "invalid_selection"
  | "catalog_not_confirmed"
  | "invalid_catalog_identity"
  | "invalid_unresolved_reason"
  | "unresolved_identity_present"
  | "invalid_correction_event"
  | "invalid_meal_write_projection"
  | "semantic_conflict";

export type MealIdentificationFinalizationError = Readonly<{
  code: MealIdentificationFinalizationErrorCode;
  message: string;
}>;

export type MealIdentificationFinalizationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: MealIdentificationFinalizationError }>;

const catalogIdentityKeys = [
  "restaurantId",
  "branchId",
  "menuId",
  "menuCategoryId",
  "menuItemId",
  "branchMenuItemId"
] as const;

const sourceContexts = new Set<MealSourceContext>([
  "dine_in",
  "takeout",
  "delivery",
  "self_cooked",
  "post_hoc",
  "unknown"
]);

const unresolvedReasons = new Set<PersonalUnresolvedReason>([
  "manual",
  "self_cooked",
  "none_of_the_above",
  "catalog_unavailable"
]);

const catalogSources = new Set(["mock", "supabase"]);
const availabilities = new Set(["available", "limited"]);
const nutritionProvenances = new Set([
  "ai_estimated",
  "restaurant_confirmed",
  "platform_reviewed",
  "missing"
]);
const nutritionKeys = new Set([
  "calories",
  "protein",
  "carbohydrates",
  "fat",
  "fiber"
]);

export function buildMealIdentificationFinalization(
  input: unknown
): MealIdentificationFinalizationResult<MealIdentificationFinalizationCommand> {
  if (!isRecord(input)) {
    return failure("unsupported_version", "Finalization input must include a supported contract version.");
  }
  if (input.version !== MEAL_IDENTIFICATION_FINALIZATION_VERSION) {
    return failure("unsupported_version", "Finalization contract version is missing or unsupported.");
  }

  const originalAnalysis = parseOriginalAnalysis(input.originalAnalysis);
  if (!originalAnalysis.ok) return originalAnalysis;

  const selection = parseSelectionInput(input.selection);
  if (!selection.ok) return selection;

  const corrections = parseCorrectionEvents(input.corrections);
  if (!corrections.ok) return corrections;

  const mealWrite = parseMealWriteProjectionInput(input.mealWrite);
  if (!mealWrite.ok) return mealWrite;

  const semanticError = validateSelectionSemantics(
    selection.value,
    mealWrite.value
  );
  if (semanticError) return semanticError;

  return success(
    deepFreeze({
      version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
      originalAnalysis: originalAnalysis.value,
      selection: selection.value,
      corrections: corrections.value,
      mealWrite: mealWrite.value
    })
  );
}

export function validateMealIdentificationFinalizationCommand(
  command: unknown
): MealIdentificationFinalizationResult<MealIdentificationFinalizationCommand> {
  if (!isRecord(command)) {
    return failure("unsupported_version", "Finalization command must include a supported contract version.");
  }
  if (command.version !== MEAL_IDENTIFICATION_FINALIZATION_VERSION) {
    return failure("unsupported_version", "Finalization command version is missing or unsupported.");
  }

  const originalAnalysis = parseOriginalAnalysis(command.originalAnalysis);
  if (!originalAnalysis.ok) return originalAnalysis;

  const selection = parseFinalSelection(command.selection);
  if (!selection.ok) return selection;

  const corrections = parseFinalCorrectionEvents(command.corrections);
  if (!corrections.ok) return corrections;

  const mealWrite = parseMealWriteProjectionInput(command.mealWrite);
  if (!mealWrite.ok) return mealWrite;

  const semanticError = validateSelectionSemantics(
    selection.value,
    mealWrite.value
  );
  if (semanticError) return semanticError;

  return success(
    deepFreeze({
      version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
      originalAnalysis: originalAnalysis.value,
      selection: selection.value,
      corrections: corrections.value,
      mealWrite: mealWrite.value
    })
  );
}

export function projectMealIdentificationFinalizationToMealWrite(
  command: unknown
): MealIdentificationFinalizationResult<ConsumerAnalysisMealWriteDraft> {
  const validated = validateMealIdentificationFinalizationCommand(command);
  if (!validated.ok) return validated;

  const { originalAnalysis, selection, mealWrite } = validated.value;
  const trustedCanonicalIdentity =
    selection.kind === "confirmed_catalog"
      ? {
          restaurantId: selection.identity.restaurantId,
          branchId: selection.identity.branchId,
          menuId: selection.identity.menuId,
          menuItemId: selection.identity.menuItemId
        }
      : null;

  return success(
    deepFreeze({
      selectedMealPeriod: mealWrite.selectedMealPeriod,
      mealName: mealWrite.mealName,
      originalDetectedName: originalAnalysis.detectedItemNames[0] ?? null,
      portion: mealWrite.portion,
      nutrition: { ...mealWrite.nutrition },
      isSelfCooked: mealWrite.isSelfCooked,
      wasUserCorrected: mealWrite.wasUserCorrected,
      trustedCanonicalIdentity
    })
  );
}

function parseOriginalAnalysis(
  value: unknown
): MealIdentificationFinalizationResult<MealIdentificationOriginalAnalysisSnapshot> {
  if (!isRecord(value) || (value.status !== "available" && value.status !== "unavailable")) {
    return failure("invalid_original_analysis", "Original analysis status is invalid.");
  }

  const names = parseStringArray(value.detectedItemNames);
  const photos = parseStringArray(value.photoReferences);
  const model = parseModel(value.model);
  const nutrition = parseNullableNutrition(value.estimatedNutrition);
  const confidence = parseNullableConfidence(value.confidence);
  const analyzedAt = parseNullableTimestamp(value.analyzedAt);
  if (!names || !photos || model === undefined || nutrition === undefined || confidence === undefined || analyzedAt === undefined) {
    return failure("invalid_original_analysis", "Original analysis snapshot is incomplete or malformed.");
  }

  if (
    value.status === "available" &&
    (!names.length || analyzedAt === null)
  ) {
    return failure("invalid_original_analysis", "Available original analysis requires detected names and a caller-provided timestamp.");
  }
  if (
    value.status === "unavailable" &&
    (names.length > 0 ||
      photos.length > 0 ||
      model !== null ||
      nutrition !== null ||
      confidence !== null ||
      analyzedAt !== null)
  ) {
    return failure("invalid_original_analysis", "Unavailable original analysis cannot claim provider evidence.");
  }

  return success(
    deepFreeze({
      status: value.status,
      detectedItemNames: names,
      model,
      photoReferences: photos,
      estimatedNutrition: nutrition,
      confidence,
      analyzedAt
    })
  );
}

function parseSelectionInput(
  value: unknown
): MealIdentificationFinalizationResult<MealIdentificationFinalSelection> {
  if (!isRecord(value)) {
    return failure("invalid_selection", "Final selection is missing or malformed.");
  }
  if (value.kind === "catalog_selection") {
    if (value.confirmationStatus !== "confirmed") {
      return failure("catalog_not_confirmed", "Catalog candidate must be explicitly confirmed.");
    }
    if (!isSourceContext(value.sourceContext)) {
      return failure("invalid_selection", "Catalog selection source context is invalid.");
    }
    const candidate = parseCatalogCandidate(value.candidate);
    if (!candidate.ok) return candidate;
    return success(
      deepFreeze({
        kind: "confirmed_catalog",
        sourceContext: value.sourceContext,
        identity: candidate.value.identity,
        candidateSnapshot: candidate.value,
        catalogSource: candidate.value.source,
        identityClaimStatus: "pending_server_validation"
      })
    );
  }
  if (value.kind === "personal_unresolved_selection") {
    if (!isSourceContext(value.sourceContext)) {
      return failure("invalid_selection", "Unresolved selection source context is invalid.");
    }
    const candidate = parseUnresolvedCandidate(value.candidate);
    if (!candidate.ok) return candidate;
    return success(
      deepFreeze({
        kind: "personal_unresolved",
        sourceContext: value.sourceContext,
        reason: candidate.value.source,
        identity: candidate.value.identity,
        restaurantName: candidate.value.restaurantName,
        mealItemName: candidate.value.mealItemName
      })
    );
  }
  return failure("invalid_selection", "Only confirmed Catalog or personal unresolved selections are supported.");
}

function parseFinalSelection(
  value: unknown
): MealIdentificationFinalizationResult<MealIdentificationFinalSelection> {
  if (!isRecord(value)) {
    return failure("invalid_selection", "Final selection is missing or malformed.");
  }
  if (value.kind === "confirmed_catalog") {
    if (
      !isSourceContext(value.sourceContext) ||
      value.identityClaimStatus !== "pending_server_validation"
    ) {
      return failure("invalid_selection", "Catalog identity claim status or source context is invalid.");
    }
    const identity = parseCatalogIdentity(value.identity);
    if (!identity.ok) return identity;
    const candidate = parseCatalogCandidate(value.candidateSnapshot);
    if (!candidate.ok) return candidate;
    if (
      value.catalogSource !== candidate.value.source ||
      !sameCatalogIdentity(identity.value, candidate.value.identity)
    ) {
      return failure("invalid_catalog_identity", "Catalog selection identity conflicts with its candidate snapshot.");
    }
    return success(
      deepFreeze({
        kind: "confirmed_catalog",
        sourceContext: value.sourceContext,
        identity: identity.value,
        candidateSnapshot: candidate.value,
        catalogSource: candidate.value.source,
        identityClaimStatus: "pending_server_validation"
      })
    );
  }
  if (value.kind === "personal_unresolved") {
    if (!isSourceContext(value.sourceContext)) {
      return failure("invalid_selection", "Unresolved source context is invalid.");
    }
    if (!isUnresolvedReason(value.reason)) {
      return failure("invalid_unresolved_reason", "Unresolved reason is unsupported.");
    }
    const identity = parseNullIdentity(value.identity);
    if (!identity.ok) return identity;
    const restaurantName = parseDisplayText(value.restaurantName);
    const mealItemName = parseDisplayText(value.mealItemName);
    if (restaurantName === null || mealItemName === null) {
      return failure("invalid_selection", "Unresolved display names must be strings.");
    }
    return success(
      deepFreeze({
        kind: "personal_unresolved",
        sourceContext: value.sourceContext,
        reason: value.reason,
        identity: identity.value,
        restaurantName,
        mealItemName
      })
    );
  }
  return failure("invalid_selection", "Final selection discriminant is unsupported.");
}

function parseCatalogCandidate(
  value: unknown
): MealIdentificationFinalizationResult<Readonly<CatalogMealIdentificationCandidate>> {
  if (!isRecord(value) || value.kind !== "catalog_item") {
    return failure("invalid_selection", "Catalog selection must contain a Catalog candidate.");
  }
  const identity = parseCatalogIdentity(value.identity);
  if (!identity.ok) return identity;
  if (
    !catalogSources.has(String(value.source)) ||
    !availabilities.has(String(value.availability)) ||
    !nutritionProvenances.has(String(value.nutritionProvenance))
  ) {
    return failure("invalid_selection", "Catalog candidate source or status is invalid.");
  }
  const restaurantName = parseRequiredText(value.restaurantName);
  const branchName = parseRequiredText(value.branchName);
  const branchContext = parseDisplayText(value.branchContext);
  const menuName = parseRequiredText(value.menuName);
  const menuCategoryName = parseRequiredText(value.menuCategoryName);
  const mealItemName = parseRequiredText(value.mealItemName);
  const matchReason = parseRequiredText(value.matchReason);
  const tags = parseStringArray(value.tags);
  const confidence = parseNullableConfidence(value.confidence);
  if (
    !restaurantName ||
    !branchName ||
    branchContext === null ||
    !menuName ||
    !menuCategoryName ||
    !mealItemName ||
    !matchReason ||
    !tags ||
    confidence === undefined ||
    typeof value.price !== "number" ||
    !Number.isFinite(value.price) ||
    value.price < 0
  ) {
    return failure("invalid_selection", "Catalog candidate snapshot is incomplete or malformed.");
  }

  return success(
    deepFreeze({
      kind: "catalog_item",
      identity: identity.value,
      source: value.source as CatalogMealIdentificationCandidate["source"],
      restaurantName,
      branchName,
      branchContext,
      menuName,
      menuCategoryName,
      mealItemName,
      price: value.price,
      availability: value.availability as CatalogMealIdentificationCandidate["availability"],
      nutritionProvenance:
        value.nutritionProvenance as CatalogMealIdentificationCandidate["nutritionProvenance"],
      confidence,
      matchReason,
      tags
    })
  );
}

function parseUnresolvedCandidate(
  value: unknown
): MealIdentificationFinalizationResult<Readonly<PersonalUnresolvedMealCandidate>> {
  if (!isRecord(value) || value.kind !== "personal_unresolved") {
    return failure("invalid_selection", "Unresolved selection must contain a personal unresolved candidate.");
  }
  if (!isUnresolvedReason(value.source)) {
    return failure("invalid_unresolved_reason", "Unresolved reason is unsupported.");
  }
  const identity = parseNullIdentity(value.identity);
  if (!identity.ok) return identity;
  const restaurantName = parseDisplayText(value.restaurantName);
  const mealItemName = parseDisplayText(value.mealItemName);
  if (restaurantName === null || mealItemName === null) {
    return failure("invalid_selection", "Unresolved display names must be strings.");
  }
  return success(
    deepFreeze({
      kind: "personal_unresolved",
      identity: identity.value,
      source: value.source,
      restaurantName,
      mealItemName
    })
  );
}

function parseCatalogIdentity(
  value: unknown
): MealIdentificationFinalizationResult<Readonly<CatalogMealCandidateIdentity>> {
  if (!isRecord(value)) {
    return failure("invalid_catalog_identity", "Catalog identity claim is missing.");
  }
  const parsed: Partial<CatalogMealCandidateIdentity> = {};
  for (const key of catalogIdentityKeys) {
    const id = parseCanonicalId(value[key]);
    if (!id) {
      return failure("invalid_catalog_identity", `Catalog identity ${key} must be a non-empty exact string.`);
    }
    parsed[key] = id;
  }
  return success(deepFreeze(parsed as CatalogMealCandidateIdentity));
}

function parseNullIdentity(
  value: unknown
): MealIdentificationFinalizationResult<Readonly<PersonalUnresolvedMealIdentity>> {
  if (!isRecord(value)) {
    return failure("unresolved_identity_present", "Unresolved selection must declare all six Catalog IDs as null.");
  }
  for (const key of catalogIdentityKeys) {
    if (!(key in value) || value[key] !== null) {
      return failure("unresolved_identity_present", `Unresolved Catalog identity ${key} must be null.`);
    }
  }
  return success(
    deepFreeze({
      restaurantId: null,
      branchId: null,
      menuId: null,
      menuCategoryId: null,
      menuItemId: null,
      branchMenuItemId: null
    })
  );
}

function parseCorrectionEvents(
  value: unknown
): MealIdentificationFinalizationResult<readonly MealIdentificationCorrectionEvent[]> {
  if (!Array.isArray(value)) {
    return failure("invalid_correction_event", "Correction events must be an append-ordered array.");
  }
  const parsed: MealIdentificationCorrectionEvent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const event = parseCorrectionEvent(value[index], index);
    if (!event.ok) return event;
    parsed.push(event.value);
  }
  return success(deepFreeze(parsed));
}

function parseFinalCorrectionEvents(
  value: unknown
): MealIdentificationFinalizationResult<readonly MealIdentificationCorrectionEvent[]> {
  if (!Array.isArray(value)) {
    return failure("invalid_correction_event", "Final correction events must be an append-ordered array.");
  }
  const parsed: MealIdentificationCorrectionEvent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!isRecord(value[index]) || value[index].ordinal !== index) {
      return failure("invalid_correction_event", "Correction event ordinal must preserve caller-provided append order.");
    }
    const event = parseCorrectionEvent(value[index], index);
    if (!event.ok) return event;
    parsed.push(event.value);
  }
  return success(deepFreeze(parsed));
}

function parseCorrectionEvent(
  value: unknown,
  ordinal: number
): MealIdentificationFinalizationResult<MealIdentificationCorrectionEvent> {
  if (!isRecord(value)) {
    return failure("invalid_correction_event", "Correction event is malformed.");
  }
  const correctedAt = parseNullableTimestamp(value.correctedAt);
  const correctionReason = parseNullableDisplayText(value.correctionReason);
  const detail = parseCorrectionDetail(value.detail);
  if (!correctedAt || correctionReason === undefined || !detail.ok) {
    return failure("invalid_correction_event", "Correction event timestamp, reason, or detail is invalid.");
  }
  return success(
    deepFreeze({
      ordinal,
      correctedAt,
      correctionReason,
      detail: detail.value
    })
  );
}

function parseCorrectionDetail(
  value: unknown
): MealIdentificationFinalizationResult<ConsumerMealCorrectionDetail> {
  if (!isRecord(value) || typeof value.correctionType !== "string") {
    return failure("invalid_correction_event", "Correction detail is malformed.");
  }
  if (value.correctionType === "nutrition_override") {
    const before = parseNullableNutrition(value.before);
    const after = parseNutrition(value.after);
    if (before === undefined || !after) {
      return failure("invalid_correction_event", "Nutrition correction before/after value is invalid.");
    }
    return success(deepFreeze({ correctionType: "nutrition_override", before, after }));
  }
  if (
    value.correctionType === "ingredient_adjustment" ||
    value.correctionType === "portion_adjustment" ||
    value.correctionType === "cooking_adjustment" ||
    value.correctionType === "name_change"
  ) {
    const before = parseNullableDisplayText(value.before);
    const after = parseRequiredText(value.after);
    if (before === undefined || !after) {
      return failure("invalid_correction_event", "Text correction before/after value is invalid.");
    }
    return success(
      deepFreeze({
        correctionType: value.correctionType,
        before,
        after
      })
    );
  }
  if (value.correctionType === "unknown") {
    const rawCorrectionType = parseRequiredText(value.rawCorrectionType);
    if (!rawCorrectionType || !isJsonValue(value.after)) {
      return failure("invalid_correction_event", "Unknown correction detail must preserve a JSON-compatible after value.");
    }
    return success(
      deepFreeze({
        correctionType: "unknown",
        rawCorrectionType,
        after: cloneJsonValue(value.after)
      })
    );
  }
  return failure("invalid_correction_event", "Correction type is unsupported.");
}

function parseMealWriteProjectionInput(
  value: unknown
): MealIdentificationFinalizationResult<MealIdentificationMealWriteProjectionInput> {
  if (!isRecord(value)) {
    return failure("invalid_meal_write_projection", "Meal-write projection input is missing.");
  }
  const selectedMealPeriod = parseRequiredText(value.selectedMealPeriod);
  const mealName = parseRequiredText(value.mealName);
  const portion = parseNullableDisplayText(value.portion);
  const nutrition = parseNutrition(value.nutrition);
  if (
    !selectedMealPeriod ||
    !mealName ||
    portion === undefined ||
    !nutrition ||
    typeof value.isSelfCooked !== "boolean" ||
    typeof value.wasUserCorrected !== "boolean"
  ) {
    return failure("invalid_meal_write_projection", "Meal-write projection input is incomplete or malformed.");
  }
  return success(
    deepFreeze({
      selectedMealPeriod,
      mealName,
      portion,
      nutrition,
      isSelfCooked: value.isSelfCooked,
      wasUserCorrected: value.wasUserCorrected
    })
  );
}

function validateSelectionSemantics(
  selection: MealIdentificationFinalSelection,
  mealWrite: MealIdentificationMealWriteProjectionInput
): MealIdentificationFinalizationResult<never> | null {
  if (
    selection.kind === "confirmed_catalog" &&
    (selection.sourceContext === "self_cooked" || mealWrite.isSelfCooked)
  ) {
    return failure("semantic_conflict", "Confirmed Catalog selection cannot claim self-cooked context.");
  }
  if (
    selection.kind === "personal_unresolved" &&
    selection.reason === "self_cooked" &&
    (selection.sourceContext !== "self_cooked" || !mealWrite.isSelfCooked)
  ) {
    return failure("semantic_conflict", "Self-cooked unresolved selection requires self-cooked context and projection.");
  }
  if (
    selection.kind === "personal_unresolved" &&
    selection.reason !== "self_cooked" &&
    (selection.sourceContext === "self_cooked" || mealWrite.isSelfCooked)
  ) {
    return failure("semantic_conflict", "Non-self-cooked unresolved selection conflicts with self-cooked context.");
  }
  return null;
}

function parseModel(value: unknown): Readonly<{ name: string; version: string }> | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const name = parseRequiredText(value.name);
  const version = parseRequiredText(value.version);
  return name && version ? deepFreeze({ name, version }) : undefined;
}

function parseNullableNutrition(
  value: unknown
): Readonly<ConsumerNutritionSnapshot> | null | undefined {
  if (value === null) return null;
  return parseNutrition(value) ?? undefined;
}

function parseNutrition(value: unknown): Readonly<ConsumerNutritionSnapshot> | null {
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (!nutritionKeys.has(key)) return null;
  }
  const result: ConsumerNutritionSnapshot = {};
  for (const key of nutritionKeys) {
    const nutrient = value[key];
    if (nutrient === undefined) continue;
    if (typeof nutrient !== "number" || !Number.isFinite(nutrient) || nutrient < 0) {
      return null;
    }
    result[key as keyof ConsumerNutritionSnapshot] = nutrient;
  }
  return deepFreeze(result);
}

function parseNullableConfidence(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

function parseNullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.trim() === value && value.length > 0 && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function parseStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const entry of value) {
    const parsed = parseRequiredText(entry);
    if (!parsed) return null;
    result.push(parsed);
  }
  return deepFreeze(result);
}

function parseCanonicalId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function parseRequiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDisplayText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function parseNullableDisplayText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function isSourceContext(value: unknown): value is MealSourceContext {
  return typeof value === "string" && sourceContexts.has(value as MealSourceContext);
}

function isUnresolvedReason(value: unknown): value is PersonalUnresolvedReason {
  return typeof value === "string" && unresolvedReasons.has(value as PersonalUnresolvedReason);
}

function sameCatalogIdentity(
  left: CatalogMealCandidateIdentity,
  right: CatalogMealCandidateIdentity
): boolean {
  return catalogIdentityKeys.every((key) => left[key] === right[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)])
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function success<T>(value: T): MealIdentificationFinalizationResult<T> {
  return Object.freeze({ ok: true, value });
}

function failure(
  code: MealIdentificationFinalizationErrorCode,
  message: string
): MealIdentificationFinalizationResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message })
  });
}
