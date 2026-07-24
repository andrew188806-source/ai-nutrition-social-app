#!/usr/bin/env node

import fs from "node:fs";

const checks = [];
const failures = [];
const allowedReasons = new Set([
  "manual",
  "self_cooked",
  "none_of_the_above",
  "catalog_unavailable"
]);
const identityKeys = [
  "restaurantId",
  "branchId",
  "menuId",
  "menuCategoryId",
  "menuItemId",
  "branchMenuItemId"
];
const correctionTypes = new Set([
  "nutrition_override",
  "ingredient_adjustment",
  "portion_adjustment",
  "cooking_adjustment",
  "name_change",
  "unknown"
]);
const forbiddenKeys = new Set([
  "userId",
  "ownerId",
  "profileId",
  "mealRecordId",
  "mealRecordItemId",
  "mealAnalysisId",
  "user_id",
  "owner_id",
  "profile_id",
  "meal_record_id",
  "meal_record_item_id",
  "meal_analysis_id"
]);

function record(name, condition) {
  const pass = Boolean(condition);
  checks.push({ name, pass });
  if (!pass) failures.push(name);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    stable(Object.keys(value).sort()) === stable([...keys].sort())
  );
}

function nonNegativeNutrition(value, nullable = false) {
  if (nullable && value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([key, nutrient]) =>
      ["calories", "protein", "carbohydrates", "fat", "fiber"].includes(key) &&
      typeof nutrient === "number" &&
      Number.isFinite(nutrient) &&
      nutrient >= 0
  );
}

function containsForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => forbiddenKeys.has(key) || containsForbiddenKey(child)
  );
}

function validateUuidV4(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function validateAnalysis(analysis) {
  if (
    !exactKeys(analysis, [
      "status",
      "detectedItemNames",
      "model",
      "photoReferences",
      "estimatedNutrition",
      "confidence",
      "analyzedAt"
    ]) ||
    !["available", "unavailable"].includes(analysis.status) ||
    !Array.isArray(analysis.detectedItemNames) ||
    !analysis.detectedItemNames.every(
      (name) => typeof name === "string" && name.trim().length > 0
    ) ||
    !Array.isArray(analysis.photoReferences) ||
    !analysis.photoReferences.every(
      (reference) =>
        typeof reference === "string" && reference.trim().length > 0
    ) ||
    !nonNegativeNutrition(analysis.estimatedNutrition, true) ||
    !(
      analysis.confidence === null ||
      (typeof analysis.confidence === "number" &&
        analysis.confidence >= 0 &&
        analysis.confidence <= 1)
    ) ||
    !(
      analysis.model === null ||
      (exactKeys(analysis.model, ["name", "version"]) &&
        typeof analysis.model.name === "string" &&
        analysis.model.name.trim() &&
        typeof analysis.model.version === "string" &&
        analysis.model.version.trim())
    )
  ) {
    fail("ANALYSIS_INVARIANT_VIOLATION");
  }
  if (
    analysis.status === "available" &&
    (!analysis.detectedItemNames.length ||
      typeof analysis.analyzedAt !== "string" ||
      analysis.analyzedAt.trim() !== analysis.analyzedAt ||
      Number.isNaN(Date.parse(analysis.analyzedAt)))
  ) {
    fail("ANALYSIS_INVARIANT_VIOLATION");
  }
  if (
    analysis.status === "unavailable" &&
    (analysis.detectedItemNames.length ||
      analysis.photoReferences.length ||
      analysis.model !== null ||
      analysis.estimatedNutrition !== null ||
      analysis.confidence !== null ||
      analysis.analyzedAt !== null)
  ) {
    fail("ANALYSIS_INVARIANT_VIOLATION");
  }
}

function validateSelection(selection) {
  if (
    !selection ||
    typeof selection !== "object" ||
    ![
      "dine_in",
      "takeout",
      "delivery",
      "self_cooked",
      "post_hoc",
      "unknown"
    ].includes(selection.sourceContext) ||
    !exactKeys(selection.identity, identityKeys)
  ) {
    fail("IDENTITY_INVARIANT_VIOLATION");
  }
  if (selection.kind === "confirmed_catalog") {
    if (
      !exactKeys(selection, [
        "kind",
        "sourceContext",
        "identity",
        "candidateSnapshot",
        "catalogSource",
        "identityClaimStatus"
      ]) ||
      selection.identityClaimStatus !== "pending_server_validation" ||
      !["mock", "supabase"].includes(selection.catalogSource) ||
      !identityKeys.every(
        (key) =>
          typeof selection.identity[key] === "string" &&
          selection.identity[key].length > 0 &&
          selection.identity[key].trim() === selection.identity[key]
      ) ||
      !exactKeys(selection.candidateSnapshot, [
        "kind",
        "identity",
        "source",
        "restaurantName",
        "branchName",
        "branchContext",
        "menuName",
        "menuCategoryName",
        "mealItemName",
        "price",
        "availability",
        "nutritionProvenance",
        "confidence",
        "matchReason",
        "tags"
      ]) ||
      selection.candidateSnapshot?.kind !== "catalog_item" ||
      selection.candidateSnapshot?.source !== selection.catalogSource ||
      stable(selection.candidateSnapshot?.identity) !==
        stable(selection.identity) ||
      !Array.isArray(selection.candidateSnapshot?.tags) ||
      !selection.candidateSnapshot.tags.every(
        (tag) => typeof tag === "string" && tag.trim()
      )
    ) {
      fail("IDENTITY_INVARIANT_VIOLATION");
    }
    return {
      kind: "catalog_item",
      reason: null,
      identity: clone(selection.identity)
    };
  }
  if (
    selection.kind !== "personal_unresolved" ||
    !exactKeys(selection, [
      "kind",
      "sourceContext",
      "reason",
      "identity",
      "restaurantName",
      "mealItemName"
    ]) ||
    !allowedReasons.has(selection.reason) ||
    !identityKeys.every((key) => selection.identity[key] === null) ||
    typeof selection.restaurantName !== "string" ||
    typeof selection.mealItemName !== "string"
  ) {
    fail("IDENTITY_INVARIANT_VIOLATION");
  }
  return {
    kind: "personal_unresolved",
    reason: selection.reason,
    identity: clone(selection.identity)
  };
}

function validateCorrections(corrections) {
  if (!Array.isArray(corrections)) fail("CORRECTION_INVARIANT_VIOLATION");
  corrections.forEach((event, index) => {
    if (
      !exactKeys(event, [
        "ordinal",
        "correctedAt",
        "correctionReason",
        "detail"
      ]) ||
      event.ordinal !== index ||
      typeof event.correctedAt !== "string" ||
      Number.isNaN(Date.parse(event.correctedAt)) ||
      !(
        event.correctionReason === null ||
        typeof event.correctionReason === "string"
      ) ||
      !event.detail ||
      !correctionTypes.has(event.detail.correctionType)
    ) {
      fail("CORRECTION_INVARIANT_VIOLATION");
    }
    if (
      event.detail.correctionType === "unknown" &&
      (typeof event.detail.rawCorrectionType !== "string" ||
        !event.detail.rawCorrectionType.trim() ||
        !("after" in event.detail))
    ) {
      fail("CORRECTION_INVARIANT_VIOLATION");
    }
    if (
      event.detail.correctionType === "nutrition_override" &&
      (!nonNegativeNutrition(event.detail.after) ||
        !nonNegativeNutrition(event.detail.before, true))
    ) {
      fail("CORRECTION_INVARIANT_VIOLATION");
    }
    if (
      event.detail.correctionType !== "unknown" &&
      (!("before" in event.detail) || !("after" in event.detail))
    ) {
      fail("CORRECTION_INVARIANT_VIOLATION");
    }
  });
}

function validateMealWrite(mealWrite, selection) {
  if (
    !exactKeys(mealWrite, [
      "selectedMealPeriod",
      "mealName",
      "portion",
      "nutrition",
      "isSelfCooked",
      "wasUserCorrected"
    ]) ||
    typeof mealWrite.selectedMealPeriod !== "string" ||
    !mealWrite.selectedMealPeriod.trim() ||
    typeof mealWrite.mealName !== "string" ||
    !mealWrite.mealName.trim() ||
    !(mealWrite.portion === null || typeof mealWrite.portion === "string") ||
    !nonNegativeNutrition(mealWrite.nutrition) ||
    typeof mealWrite.isSelfCooked !== "boolean" ||
    typeof mealWrite.wasUserCorrected !== "boolean"
  ) {
    fail("INVALID_FINALIZATION");
  }
  if (
    selection.kind === "catalog_item" &&
    (mealWrite.isSelfCooked || selection.sourceContext === "self_cooked")
  ) {
    fail("IDENTITY_INVARIANT_VIOLATION");
  }
  if (
    selection.kind === "personal_unresolved" &&
    ((selection.reason === "self_cooked" &&
      (!mealWrite.isSelfCooked ||
        selection.sourceContext !== "self_cooked")) ||
      (selection.reason !== "self_cooked" &&
        (mealWrite.isSelfCooked ||
          selection.sourceContext === "self_cooked")))
  ) {
    fail("IDENTITY_INVARIANT_VIOLATION");
  }
}

function validateCommand(command) {
  if (
    !exactKeys(command, [
      "version",
      "originalAnalysis",
      "selection",
      "corrections",
      "mealWrite"
    ]) ||
    command.version !== "meal-identification-finalization-v1"
  ) {
    fail("UNSUPPORTED_CONTRACT_VERSION");
  }
  if (containsForbiddenKey(command)) fail("FORBIDDEN_FIELD");
  validateAnalysis(command.originalAnalysis);
  const selection = validateSelection(command.selection);
  selection.sourceContext = command.selection.sourceContext;
  validateCorrections(command.corrections);
  validateMealWrite(command.mealWrite, selection);
  return selection;
}

function validateCatalog(identity, catalog) {
  const restaurant = catalog.restaurants[identity.restaurantId];
  const branch = catalog.branches[identity.branchId];
  const menu = catalog.menus[identity.menuId];
  const category = catalog.categories[identity.menuCategoryId];
  const item = catalog.items[identity.menuItemId];
  const branchItem = catalog.branchItems[identity.branchMenuItemId];
  if (
    !restaurant ||
    restaurant.status !== "active" ||
    !branch ||
    branch.restaurantId !== identity.restaurantId ||
    branch.status !== "active" ||
    branch.isActive !== true ||
    !menu ||
    menu.restaurantId !== identity.restaurantId ||
    menu.status !== "published" ||
    !category ||
    category.menuId !== identity.menuId ||
    !item ||
    item.restaurantId !== identity.restaurantId ||
    item.menuCategoryId !== identity.menuCategoryId ||
    item.status !== "active" ||
    !branchItem ||
    branchItem.restaurantId !== identity.restaurantId ||
    branchItem.branchId !== identity.branchId ||
    branchItem.menuItemId !== identity.menuItemId ||
    !["available", "limited"].includes(branchItem.availability) ||
    branchItem.soldOut ||
    branchItem.branchSpecificStatus !== "available"
  ) {
    fail("CATALOG_IDENTITY_REJECTED");
  }
}

function createState() {
  return {
    sequence: 0,
    records: new Map(),
    items: new Map(),
    analyses: new Map(),
    corrections: new Map(),
    ledgers: new Map()
  };
}

function stateCounts(state) {
  return [
    state.records.size,
    state.items.size,
    state.analyses.size,
    state.corrections.size,
    state.ledgers.size
  ].join(":");
}

function restoreState(target, source) {
  target.sequence = source.sequence;
  for (const key of [
    "records",
    "items",
    "analyses",
    "corrections",
    "ledgers"
  ]) {
    target[key] = source[key];
  }
}

function transact(state, operation) {
  const snapshot = {
    sequence: state.sequence,
    records: new Map(state.records),
    items: new Map(state.items),
    analyses: new Map(state.analyses),
    corrections: new Map(state.corrections),
    ledgers: new Map(state.ledgers)
  };
  try {
    return operation();
  } catch (error) {
    restoreState(state, snapshot);
    throw error;
  }
}

function finalize({
  actor,
  requestId,
  mealType,
  occurredAt,
  mealDate,
  timezone,
  command,
  catalog,
  state,
  injectFailure
}) {
  if (!actor) fail("AUTHENTICATION_REQUIRED");
  if (!validateUuidV4(requestId)) fail("INVALID_FINALIZATION");
  if (
    !mealType ||
    !occurredAt ||
    !mealDate ||
    typeof timezone !== "string" ||
    !timezone.trim()
  ) {
    fail("INVALID_FINALIZATION");
  }
  const selection = validateCommand(command);
  const fingerprint = stable({
    operation: "finalize_current_user_meal_identification_v1",
    rpcContractVersion: 1,
    mealType,
    occurredAt,
    mealDate,
    timezone: timezone.trim(),
    finalization: command
  });
  const scopedKey = `${actor}:${requestId}`;
  const existing = state.records.get(scopedKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint) fail("IDEMPOTENCY_KEY_CONFLICT");
    const ledger = state.ledgers.get(existing.ledgerId);
    const item = ledger && state.items.get(ledger.itemId);
    const analysis = ledger && state.analyses.get(ledger.analysisId);
    const corrections = ledger
      ? [...state.corrections.values()]
          .filter(
            (entry) =>
              entry.analysisId === ledger.analysisId
          )
          .sort((left, right) => left.ordinal - right.ordinal)
      : [];
    if (
      !ledger ||
      !item ||
      !analysis ||
      ledger.actor !== actor ||
      item.actor !== actor ||
      analysis.actor !== actor ||
      ledger.commandSnapshot !== stable(command) ||
      corrections.length !== command.corrections.length ||
      corrections.some(
        (entry, index) =>
          entry.ordinal !== index ||
          entry.itemId !== ledger.itemId ||
          entry.actor !== actor
      )
    ) {
      fail("DURABLE_STATE_INCONSISTENCY");
    }
    return {
      replayed: true,
      meal_record_id: existing.recordId,
      meal_record_item_id: ledger.itemId,
      meal_analysis_id: ledger.analysisId,
      meal_identification_finalization_id: ledger.id,
      meal_correction_ids: corrections.map((entry) => entry.id)
    };
  }

  return transact(state, () => {
    if (selection.kind === "catalog_item") {
      validateCatalog(selection.identity, catalog);
    } else if (
      identityKeys.some((key) => selection.identity[key] !== null)
    ) {
      fail("IDENTITY_INVARIANT_VIOLATION");
    }
    if (injectFailure === "ownership") fail("OWNERSHIP_OR_AUTHORIZATION_REJECTED");

    state.sequence += 1;
    const suffix = String(state.sequence).padStart(4, "0");
    const recordId = `record-${suffix}`;
    const itemId = `item-${suffix}`;
    const analysisId = `analysis-${suffix}`;
    const ledgerId = `finalization-${suffix}`;
    const projectedIdentity =
      selection.kind === "catalog_item"
        ? {
            restaurantId: selection.identity.restaurantId,
            branchId: selection.identity.branchId,
            menuId: selection.identity.menuId,
            menuItemId: selection.identity.menuItemId
          }
        : {
            restaurantId: null,
            branchId: null,
            menuId: null,
            menuItemId: null
          };

    state.items.set(itemId, {
      id: itemId,
      recordId,
      actor,
      projectedIdentity,
      mealName: command.mealWrite.mealName,
      nutrition: clone(command.mealWrite.nutrition),
      portion: command.mealWrite.portion
    });
    if (injectFailure === "item") fail("INVALID_FINALIZATION");

    state.analyses.set(analysisId, {
      id: analysisId,
      recordId,
      actor,
      snapshot: stable(command.originalAnalysis)
    });
    if (injectFailure === "analysis") fail("ANALYSIS_INVARIANT_VIOLATION");

    const correctionIds = [];
    command.corrections.forEach((event, ordinal) => {
      const id = `correction-${suffix}-${ordinal}`;
      state.corrections.set(id, {
        id,
        recordId,
        itemId,
        analysisId,
        actor,
        ordinal,
        correctedAt: event.correctedAt,
        reason: event.correctionReason,
        detail: clone(event.detail)
      });
      correctionIds.push(id);
      if (injectFailure === `correction-${ordinal}`) {
        fail("CORRECTION_INVARIANT_VIOLATION");
      }
    });

    state.ledgers.set(ledgerId, {
      id: ledgerId,
      recordId,
      itemId,
      analysisId,
      actor,
      commandSnapshot: stable(command),
      sixIdSnapshot: clone(selection.identity)
    });
    if (injectFailure === "ledger") fail("DURABLE_STATE_INCONSISTENCY");

    state.records.set(scopedKey, {
      recordId,
      ledgerId,
      actor,
      fingerprint
    });
    return {
      replayed: false,
      meal_record_id: recordId,
      meal_record_item_id: itemId,
      meal_analysis_id: analysisId,
      meal_identification_finalization_id: ledgerId,
      meal_correction_ids: correctionIds
    };
  });
}

const catalog = {
  restaurants: { "restaurant-a": { status: "active" } },
  branches: {
    "branch-a": {
      restaurantId: "restaurant-a",
      status: "active",
      isActive: true
    }
  },
  menus: {
    "menu-a": { restaurantId: "restaurant-a", status: "published" }
  },
  categories: { "category-a": { menuId: "menu-a" } },
  items: {
    "item-a": {
      restaurantId: "restaurant-a",
      menuCategoryId: "category-a",
      status: "active"
    }
  },
  branchItems: {
    "branch-item-a": {
      restaurantId: "restaurant-a",
      branchId: "branch-a",
      menuItemId: "item-a",
      availability: "available",
      soldOut: false,
      branchSpecificStatus: "available"
    }
  }
};

const identity = {
  restaurantId: "restaurant-a",
  branchId: "branch-a",
  menuId: "menu-a",
  menuCategoryId: "category-a",
  menuItemId: "item-a",
  branchMenuItemId: "branch-item-a"
};
const catalogCandidate = {
  kind: "catalog_item",
  identity: clone(identity),
  source: "supabase",
  restaurantName: "Restaurant A",
  branchName: "Branch A",
  branchContext: "",
  menuName: "Lunch",
  menuCategoryName: "Bowls",
  mealItemName: "Chicken bowl",
  price: 180,
  availability: "available",
  nutritionProvenance: "restaurant_confirmed",
  confidence: 0.9,
  matchReason: "explicit confirmed candidate",
  tags: ["protein"]
};
const availableAnalysis = {
  status: "available",
  detectedItemNames: ["AI chicken bowl"],
  model: { name: "provider-model", version: "v1" },
  photoReferences: ["photo-ref"],
  estimatedNutrition: { calories: 500, protein: 35 },
  confidence: 0.85,
  analyzedAt: "2026-07-24T06:00:00.000Z"
};
const unavailableAnalysis = {
  status: "unavailable",
  detectedItemNames: [],
  model: null,
  photoReferences: [],
  estimatedNutrition: null,
  confidence: null,
  analyzedAt: null
};
const corrections = [
  {
    ordinal: 0,
    correctedAt: "2026-07-24T06:01:00.000Z",
    correctionReason: "name corrected",
    detail: {
      correctionType: "name_change",
      before: "AI chicken bowl",
      after: "Chicken bowl"
    }
  },
  {
    ordinal: 1,
    correctedAt: "2026-07-24T06:02:00.000Z",
    correctionReason: "nutrition corrected",
    detail: {
      correctionType: "nutrition_override",
      before: { calories: 480 },
      after: { calories: 500 }
    }
  }
];
const mealWrite = {
  selectedMealPeriod: "lunch",
  mealName: "Chicken bowl",
  portion: "1 serving",
  nutrition: { calories: 500, protein: 35 },
  isSelfCooked: false,
  wasUserCorrected: true
};
const confirmedCommand = {
  version: "meal-identification-finalization-v1",
  originalAnalysis: clone(availableAnalysis),
  selection: {
    kind: "confirmed_catalog",
    sourceContext: "dine_in",
    identity: clone(identity),
    candidateSnapshot: clone(catalogCandidate),
    catalogSource: "supabase",
    identityClaimStatus: "pending_server_validation"
  },
  corrections: clone(corrections),
  mealWrite: clone(mealWrite)
};
const baseRequest = {
  actor: "actor-a",
  requestId: "10000000-0000-4000-8000-000000000001",
  mealType: "lunch",
  occurredAt: "2026-07-24T06:05:00.000Z",
  mealDate: "2026-07-24",
  timezone: "Asia/Taipei",
  command: confirmedCommand,
  catalog
};

function rejects(name, code, request, state = createState()) {
  const pass = rejectsSilently(code, request, state);
  record(name, pass);
}

function rejectsSilently(code, request, state = createState()) {
  let actual = null;
  const before = stateCounts(state);
  try {
    finalize({ ...request, state });
  } catch (error) {
    actual = error.code;
  }
  return actual === code && stateCounts(state) === before;
}

try {
  const validState = createState();
  const first = finalize({ ...baseRequest, state: validState });
  record(
    "confirmed valid six-table chain is accepted",
    !first.replayed && stateCounts(validState) === "1:1:1:2:1"
  );
  record(
    "confirmed projection stores only existing four meal IDs",
    stable(validState.items.get(first.meal_record_item_id).projectedIdentity) ===
      stable({
        restaurantId: identity.restaurantId,
        branchId: identity.branchId,
        menuId: identity.menuId,
        menuItemId: identity.menuItemId
      })
  );
  record(
    "ledger preserves complete six-ID snapshot",
    stable(
      validState.ledgers.get(first.meal_identification_finalization_id)
        .sixIdSnapshot
    ) === stable(identity)
  );
  record(
    "complete accepted command snapshot is preserved",
    validState.ledgers.get(first.meal_identification_finalization_id)
      .commandSnapshot === stable(confirmedCommand)
  );
  record(
    "original analysis remains separate from corrections",
    validState.analyses.get(first.meal_analysis_id).snapshot ===
      stable(confirmedCommand.originalAnalysis)
  );

  const forged = clone(confirmedCommand);
  forged.selection.identity.menuItemId = "forged";
  forged.selection.candidateSnapshot.identity.menuItemId = "forged";
  rejects(
    "forged Catalog ID is rejected atomically",
    "CATALOG_IDENTITY_REJECTED",
    { ...baseRequest, command: forged }
  );

  const numericIdentity = clone(confirmedCommand);
  numericIdentity.selection.identity.menuItemId = 42;
  numericIdentity.selection.candidateSnapshot.identity.menuItemId = 42;
  rejects(
    "non-string Catalog ID is rejected before Catalog lookup",
    "IDENTITY_INVARIANT_VIOLATION",
    { ...baseRequest, command: numericIdentity }
  );

  const candidateExtraField = clone(confirmedCommand);
  candidateExtraField.selection.candidateSnapshot.userId = "caller-user";
  rejects(
    "candidate snapshot ownership field is rejected",
    "FORBIDDEN_FIELD",
    { ...baseRequest, command: candidateExtraField }
  );

  const mixedMutations = [
    ["branch restaurant", "branches", "branch-a", "restaurantId", "restaurant-b"],
    ["menu restaurant", "menus", "menu-a", "restaurantId", "restaurant-b"],
    ["category menu", "categories", "category-a", "menuId", "menu-b"],
    ["item restaurant", "items", "item-a", "restaurantId", "restaurant-b"],
    ["item category", "items", "item-a", "menuCategoryId", "category-b"],
    [
      "branch item restaurant",
      "branchItems",
      "branch-item-a",
      "restaurantId",
      "restaurant-b"
    ],
    [
      "branch item branch",
      "branchItems",
      "branch-item-a",
      "branchId",
      "branch-b"
    ],
    [
      "branch item menu item",
      "branchItems",
      "branch-item-a",
      "menuItemId",
      "item-b"
    ]
  ];
  for (const [label, table, id, field, value] of mixedMutations) {
    const changedCatalog = clone(catalog);
    changedCatalog[table][id][field] = value;
    rejects(
      `mixed-parent ${label} is rejected`,
      "CATALOG_IDENTITY_REJECTED",
      { ...baseRequest, catalog: changedCatalog }
    );
  }

  for (const [label, table, id, field, value] of [
    ["inactive restaurant", "restaurants", "restaurant-a", "status", "paused"],
    ["inactive branch", "branches", "branch-a", "status", "inactive"],
    ["unpublished menu", "menus", "menu-a", "status", "draft"],
    ["inactive item", "items", "item-a", "status", "archived"],
    [
      "unavailable branch item",
      "branchItems",
      "branch-item-a",
      "availability",
      "unavailable"
    ],
    ["sold-out branch item", "branchItems", "branch-item-a", "soldOut", true]
  ]) {
    const changedCatalog = clone(catalog);
    changedCatalog[table][id][field] = value;
    rejects(label, "CATALOG_IDENTITY_REJECTED", {
      ...baseRequest,
      catalog: changedCatalog
    });
  }

  for (const reason of allowedReasons) {
    const unresolved = {
      version: "meal-identification-finalization-v1",
      originalAnalysis: clone(unavailableAnalysis),
      selection: {
        kind: "personal_unresolved",
        sourceContext: reason === "self_cooked" ? "self_cooked" : "unknown",
        reason,
        identity: Object.fromEntries(identityKeys.map((key) => [key, null])),
        restaurantName: "",
        mealItemName: "Manual meal"
      },
      corrections: [],
      mealWrite: {
        selectedMealPeriod: "lunch",
        mealName: "Manual meal",
        portion: null,
        nutrition: {},
        isSelfCooked: reason === "self_cooked",
        wasUserCorrected: false
      }
    };
    const state = createState();
    const result = finalize({
      ...baseRequest,
      requestId: `20000000-0000-4000-8000-00000000000${[
        ...allowedReasons
      ].indexOf(reason) + 1}`,
      command: unresolved,
      state
    });
    record(
      `unresolved ${reason} persists with null canonical identity`,
      !result.replayed &&
        Object.values(
          state.items.get(result.meal_record_item_id).projectedIdentity
        ).every((value) => value === null)
    );
  }

  const partialUnresolved = {
    ...clone(confirmedCommand),
    originalAnalysis: clone(unavailableAnalysis),
    selection: {
      kind: "personal_unresolved",
      sourceContext: "unknown",
      reason: "manual",
      identity: Object.fromEntries(identityKeys.map((key) => [key, null])),
      restaurantName: "",
      mealItemName: "Manual meal"
    },
    corrections: [],
    mealWrite: {
      ...clone(mealWrite),
      mealName: "Manual meal",
      portion: null,
      nutrition: {},
      wasUserCorrected: false
    }
  };
  partialUnresolved.selection.identity.menuItemId = "item-a";
  rejects(
    "unresolved partial Catalog identity is rejected",
    "IDENTITY_INVARIANT_VIOLATION",
    { ...baseRequest, command: partialUnresolved }
  );

  rejects("invalid request ID is rejected", "INVALID_FINALIZATION", {
    ...baseRequest,
    requestId: "not-a-uuid"
  });
  rejects("non-v4 request UUID is rejected", "INVALID_FINALIZATION", {
    ...baseRequest,
    requestId: "10000000-0000-1000-8000-000000000001"
  });
  rejects("missing actor is rejected", "AUTHENTICATION_REQUIRED", {
    ...baseRequest,
    actor: null
  });

  const availableWithoutModel = clone(confirmedCommand);
  availableWithoutModel.originalAnalysis.model = null;
  const optionalModelState = createState();
  const optionalModelResult = finalize({
    ...baseRequest,
    requestId: "30000000-0000-4000-8000-000000000001",
    command: availableWithoutModel,
    state: optionalModelState
  });
  record(
    "available analysis accepts absent provider provenance",
    Boolean(optionalModelResult.meal_analysis_id)
  );

  const unavailableCommand = clone(partialUnresolved);
  unavailableCommand.selection.identity.menuItemId = null;
  const unavailableState = createState();
  const unavailableResult = finalize({
    ...baseRequest,
    requestId: "30000000-0000-4000-8000-000000000002",
    command: unavailableCommand,
    state: unavailableState
  });
  record(
    "unavailable analysis preserves exact null provenance",
    unavailableState.analyses.get(unavailableResult.meal_analysis_id)
      .snapshot === stable(unavailableAnalysis)
  );

  for (const [label, field, value] of [
    ["model", "model", { name: "fake", version: "v1" }],
    ["nutrition", "estimatedNutrition", { calories: 1 }],
    ["confidence", "confidence", 0.5],
    ["timestamp", "analyzedAt", "2026-07-24T06:00:00.000Z"],
    ["photo", "photoReferences", ["fake-photo"]]
  ]) {
    const fake = clone(unavailableCommand);
    fake.originalAnalysis[field] = value;
    rejects(
      `unavailable analysis rejects fake ${label} provenance`,
      "ANALYSIS_INVARIANT_VIOLATION",
      { ...baseRequest, command: fake }
    );
  }

  for (const count of [0, 1, 2]) {
    const changed = clone(confirmedCommand);
    changed.corrections = clone(corrections.slice(0, count));
    const state = createState();
    const result = finalize({
      ...baseRequest,
      requestId: `40000000-0000-4000-8000-00000000000${count + 1}`,
      command: changed,
      state
    });
    record(
      `correction count ${count} preserves append order`,
      result.meal_correction_ids.length === count &&
        result.meal_correction_ids.every((id, ordinal) =>
          id.endsWith(`-${ordinal}`)
        )
    );
  }

  for (const [label, mutate] of [
    ["gap", (events) => (events[1].ordinal = 2)],
    ["duplicate", (events) => (events[1].ordinal = 0)],
    ["tampering", (events) => events.reverse()]
  ]) {
    const changed = clone(confirmedCommand);
    mutate(changed.corrections);
    rejects(
      `correction ordinal ${label} is rejected`,
      "CORRECTION_INVARIANT_VIOLATION",
      { ...baseRequest, command: changed }
    );
  }

  const invalidCorrectionNutrition = clone(confirmedCommand);
  invalidCorrectionNutrition.corrections[1].detail.after = { calories: -1 };
  rejects(
    "correction nutrition snapshot rejects negative values",
    "CORRECTION_INVARIANT_VIOLATION",
    { ...baseRequest, command: invalidCorrectionNutrition }
  );

  for (const forbidden of [
    "userId",
    "mealRecordId",
    "mealRecordItemId",
    "mealAnalysisId"
  ]) {
    const changed = clone(confirmedCommand);
    changed[forbidden] = "caller-value";
    rejects(`caller ${forbidden} field is rejected`, "UNSUPPORTED_CONTRACT_VERSION", {
      ...baseRequest,
      command: changed
    });
  }
  const nestedOwner = clone(confirmedCommand);
  nestedOwner.selection.ownerId = "caller-owner";
  rejects("nested ownership field is rejected", "FORBIDDEN_FIELD", {
    ...baseRequest,
    command: nestedOwner
  });

  const replay = finalize({ ...baseRequest, state: validState });
  record(
    "identical replay returns the same stable IDs",
    replay.replayed &&
      replay.meal_record_id === first.meal_record_id &&
      replay.meal_record_item_id === first.meal_record_item_id &&
      replay.meal_analysis_id === first.meal_analysis_id &&
      replay.meal_identification_finalization_id ===
        first.meal_identification_finalization_id &&
      stable(replay.meal_correction_ids) ===
        stable(first.meal_correction_ids) &&
      stateCounts(validState) === "1:1:1:2:1"
  );

  const conflictCommand = clone(confirmedCommand);
  conflictCommand.mealWrite.portion = "2 servings";
  rejects(
    "same actor key with different payload conflicts without mutation",
    "IDEMPOTENCY_KEY_CONFLICT",
    { ...baseRequest, command: conflictCommand },
    validState
  );

  const missingLedgerState = createState();
  const createdBeforeDamage = finalize({
    ...baseRequest,
    requestId: "50000000-0000-4000-8000-000000000001",
    state: missingLedgerState
  });
  missingLedgerState.ledgers.delete(
    createdBeforeDamage.meal_identification_finalization_id
  );
  const missingLedgerRejected = rejectsSilently(
    "DURABLE_STATE_INCONSISTENCY",
    {
      ...baseRequest,
      requestId: "50000000-0000-4000-8000-000000000001"
    },
    missingLedgerState
  );
  const anomalousCorrectionState = createState();
  const createdBeforeAnomaly = finalize({
    ...baseRequest,
    requestId: "50000000-0000-4000-8000-000000000002",
    state: anomalousCorrectionState
  });
  anomalousCorrectionState.corrections.set("anomalous-correction", {
    id: "anomalous-correction",
    analysisId: createdBeforeAnomaly.meal_analysis_id,
    itemId: "other-item",
    actor: "other-actor",
    ordinal: null
  });
  const anomalousCorrectionRejected = rejectsSilently(
    "DURABLE_STATE_INCONSISTENCY",
    {
      ...baseRequest,
      requestId: "50000000-0000-4000-8000-000000000002"
    },
    anomalousCorrectionState
  );
  record(
    "same fingerprint with missing or anomalous durable linkage fails closed",
    missingLedgerRejected && anomalousCorrectionRejected
  );

  const concurrentState = createState();
  const concurrentRequest = {
    ...baseRequest,
    requestId: "60000000-0000-4000-8000-000000000001"
  };
  const concurrentFirst = finalize({
    ...concurrentRequest,
    state: concurrentState
  });
  const concurrentReplay = finalize({
    ...concurrentRequest,
    state: concurrentState
  });
  record(
    "serialized concurrent replay contract creates one durable graph",
    !concurrentFirst.replayed &&
      concurrentReplay.replayed &&
      concurrentFirst.meal_record_id === concurrentReplay.meal_record_id &&
      stateCounts(concurrentState) === "1:1:1:2:1"
  );

  for (const failurePoint of [
    "ownership",
    "item",
    "analysis",
    "correction-0",
    "ledger"
  ]) {
    rejects(
      `${failurePoint} failure rolls back the complete graph`,
      failurePoint === "ownership"
        ? "OWNERSHIP_OR_AUTHORIZATION_REJECTED"
        : failurePoint === "item"
          ? "INVALID_FINALIZATION"
          : failurePoint === "analysis"
            ? "ANALYSIS_INVARIANT_VIOLATION"
            : failurePoint === "correction-0"
              ? "CORRECTION_INVARIANT_VIOLATION"
              : "DURABLE_STATE_INCONSISTENCY",
      { ...baseRequest, injectFailure: failurePoint }
    );
  }

  const actorIsolationState = createState();
  const actorAResult = finalize({
    ...baseRequest,
    requestId: "70000000-0000-4000-8000-000000000001",
    state: actorIsolationState
  });
  const actorBResult = finalize({
    ...baseRequest,
    actor: "actor-b",
    requestId: "70000000-0000-4000-8000-000000000001",
    state: actorIsolationState
  });
  record(
    "same key is actor-scoped and cannot cross-link users",
    actorAResult.meal_record_id !== actorBResult.meal_record_id &&
      stateCounts(actorIsolationState) === "2:2:2:4:2"
  );

  const source = fs.readFileSync(new URL(import.meta.url), "utf8");
  const prohibitedRuntimeTokens = [
    "process." + "env",
    "fe" + "tch(",
    "http" + "://",
    "https" + "://",
    "node:" + "child_process",
    "local" + "Storage",
    "Async" + "Storage",
    "write" + "File(",
    "append" + "File("
  ];
  record(
    "contract smoke has no database network credential or storage writes",
    prohibitedRuntimeTokens.every((token) => !source.includes(token)) &&
      !source.includes("service_" + "role")
  );

  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
  }
  console.log(
    `RESULT ${checks.length - failures.length}/${checks.length} ${
      failures.length ? "FAIL" : "PASS"
    }`
  );
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.log(
    `RESULT ${checks.length - failures.length}/${checks.length + 1} FAIL`
  );
  process.exitCode = 1;
}
