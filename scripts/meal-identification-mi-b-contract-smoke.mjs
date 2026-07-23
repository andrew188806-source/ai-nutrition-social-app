#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const cache = new Map();

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push(name);
}

function loadTsModule(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.js$/, "");
    const resolved =
      fs.existsSync(base) && fs.statSync(base).isDirectory()
        ? path.join(base, "index.ts")
        : `${base}.ts`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: absolute
  })(localRequire, module, module.exports);
  return module.exports;
}

const resolver = loadTsModule(
  "apps/mobile/features/meal-identification/candidateResolver.ts"
);
const policy = loadTsModule(
  "apps/mobile/features/meal-identification/sourceResolutionPolicy.ts"
);
const writeMapper = loadTsModule(
  "apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts"
);
const nextMealRepositoryModule = loadTsModule(
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts"
);
const nextMealMapper = loadTsModule(
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts"
);

const catalogItem = {
  menuItemId: "menu-item-1",
  branchMenuItemId: "branch-menu-item-1",
  restaurantId: "restaurant-1",
  branchId: "branch-1",
  menuId: "menu-1",
  menuCategoryId: "category-1",
  name: "雞胸高蛋白碗",
  description: "",
  allergens: [],
  calories: 520,
  protein: 38,
  carbs: 54,
  fat: 14,
  price: 180,
  tags: ["高蛋白"],
  source: "restaurant_menu",
  verificationStatus: "ai_estimated",
  availability: "available",
  nutritionSourceLabel: "ai_estimated",
  publishedNutrition: {
    calories: 520,
    protein: 38,
    carbohydrates: 54,
    fat: 14,
    fiber: null,
    sugar: null,
    sodium: null,
    saturatedFat: null,
    servingSize: null,
    source: "ai_estimated",
    updatedAt: "2026-07-23T00:00:00Z"
  }
};
const catalogState = {
  status: "success",
  source: "supabase",
  restaurants: [
    {
      id: "restaurant-1",
      restaurantId: "restaurant-1",
      branchId: "branch-1",
      name: "好初健康碗",
      location: "信義區",
      distanceDisplay: "信義區",
      category: "健康餐",
      tags: [],
      priceRange: "NT$180",
      score: "—",
      menuItems: [catalogItem],
      branches: [
        {
          branchId: "branch-1",
          restaurantId: "restaurant-1",
          name: "信義店",
          district: "信義區",
          address: "測試路 1 號",
          menus: [
            {
              menuId: "menu-1",
              restaurantId: "restaurant-1",
              name: "午餐菜單",
              categories: [
                {
                  menuCategoryId: "category-1",
                  menuId: "menu-1",
                  name: "健康碗",
                  sortOrder: 1,
                  items: [catalogItem]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

try {
  const resolution = resolver.resolveCatalogMealCandidates(catalogState, {
    restaurantName: "好初健康碗",
    mealItemName: "雞胸高蛋白碗"
  });
  const candidate =
    resolution.status === "available" ? resolution.candidates[0] : null;

  expect(
    candidate &&
      Object.values(candidate.identity).every(
        (value) => typeof value === "string" && value.length > 0
      ),
    "Catalog candidate preserves all six canonical identities"
  );
  expect(
    candidate.identity.menuItemId === "menu-item-1" &&
      candidate.identity.branchMenuItemId === "branch-menu-item-1" &&
      candidate.identity.menuItemId !== candidate.identity.branchMenuItemId,
    "menuItemId remains distinct from branchMenuItemId"
  );
  expect(
    candidate.nutritionProvenance === "ai_estimated",
    "AI-estimated public nutrition remains an eligible Catalog candidate"
  );

  const trusted = policy.toTrustedCanonicalIdentity(candidate);
  expect(
    trusted.restaurantId === "restaurant-1" &&
      trusted.branchId === "branch-1" &&
      trusted.menuId === "menu-1" &&
      trusted.menuItemId === "menu-item-1",
    "Confirmed Catalog candidate maps to the existing trusted identity shape"
  );
  const mappedCatalogWrite = writeMapper.mapConsumerAnalysisMealWrite({
    selectedMealPeriod: "午餐",
    mealName: candidate.mealItemName,
    originalDetectedName: "雞胸餐",
    nutrition: { calories: 520 },
    isSelfCooked: false,
    wasUserCorrected: false,
    trustedCanonicalIdentity: trusted,
    timezone: "Asia/Taipei",
    submittedAt: new Date("2026-07-23T04:00:00Z")
  });
  expect(
    mappedCatalogWrite.items[0].restaurantId === "restaurant-1" &&
      mappedCatalogWrite.items[0].branchId === "branch-1" &&
      mappedCatalogWrite.items[0].menuId === "menu-1" &&
      mappedCatalogWrite.items[0].menuItemId === "menu-item-1",
    "Trusted identity reaches the existing atomic meal-write input"
  );

  for (const source of ["none_of_the_above", "manual", "self_cooked"]) {
    const unresolved = policy.createPersonalUnresolvedCandidate({
      source,
      restaurantName: "同名餐廳",
      mealItemName: "同名餐點"
    });
    const unresolvedWrite = writeMapper.mapConsumerAnalysisMealWrite({
      selectedMealPeriod: "午餐",
      mealName: unresolved.mealItemName,
      originalDetectedName: unresolved.mealItemName,
      nutrition: { calories: 500 },
      isSelfCooked: source === "self_cooked",
      wasUserCorrected: source === "manual",
      trustedCanonicalIdentity: policy.toTrustedCanonicalIdentity(unresolved),
      timezone: "Asia/Taipei",
      submittedAt: new Date("2026-07-23T04:00:00Z")
    });
    expect(
      Object.values(unresolved.identity).every((value) => value === null) &&
        unresolvedWrite.items[0].restaurantId === null &&
        unresolvedWrite.items[0].branchId === null &&
        unresolvedWrite.items[0].menuId === null &&
        unresolvedWrite.items[0].menuItemId === null,
      `${source} keeps every Catalog identity null`
    );
  }

  const manualAfterCatalog = policy.createPersonalUnresolvedCandidate({
    source: "manual",
    restaurantName: candidate.restaurantName,
    mealItemName: candidate.mealItemName
  });
  expect(
    policy.toTrustedCanonicalIdentity(candidate) !== null &&
      policy.toTrustedCanonicalIdentity(manualAfterCatalog) === null,
    "Switching from Catalog to manual clears stale canonical identity"
  );
  expect(
    policy.toTrustedCanonicalIdentity(manualAfterCatalog) === null,
    "Matching display text never recreates canonical identity"
  );

  const catalogUnavailableAfterCatalog =
    policy.createPersonalUnresolvedCandidate({
      source: "catalog_unavailable",
      restaurantName: candidate.restaurantName,
      mealItemName: candidate.mealItemName
    });
  expect(
    catalogUnavailableAfterCatalog.source === "catalog_unavailable",
    "Catalog unavailable fallback preserves its distinct reason"
  );
  expect(
    Object.values(catalogUnavailableAfterCatalog.identity).every(
      (value) => value === null
    ) &&
      policy.toTrustedCanonicalIdentity(catalogUnavailableAfterCatalog) === null,
    "Catalog unavailable fallback clears all prior canonical identity"
  );

  const noneAfterCatalog = policy.createPersonalUnresolvedCandidate({
    source: "none_of_the_above",
    restaurantName: candidate.restaurantName,
    mealItemName: candidate.mealItemName
  });
  expect(
    noneAfterCatalog.source === "none_of_the_above",
    "Explicit none-of-the-above preserves its distinct reason"
  );
  expect(
    Object.values(noneAfterCatalog.identity).every((value) => value === null) &&
      policy.toTrustedCanonicalIdentity(noneAfterCatalog) === null,
    "Explicit none-of-the-above clears all prior canonical identity"
  );

  expect(
    resolver.resolveCatalogMealCandidates({
      status: "loading",
      restaurants: [],
      source: "supabase"
    }).status === "loading",
    "Loading state fails safely"
  );
  expect(
    resolver.resolveCatalogMealCandidates({
      status: "empty",
      restaurants: [],
      source: "supabase"
    }).status === "empty",
    "Empty state preserves manual fallback"
  );
  expect(
    resolver.resolveCatalogMealCandidates({
      status: "error",
      restaurants: [],
      source: "supabase",
      message: "safe",
      retryable: true
    }).status === "error",
    "Error state is not disguised as a successful candidate"
  );

  const nextMealRepository =
    new nextMealRepositoryModule.SupabaseConsumerNextMealRecommendationRepository({
      authPort: {
        async getCurrentSession() {
          return { ok: true, value: { accessToken: "not-used" } };
        }
      },
      restaurantMenuClient: {
        from() {
          return {
            select() {
              return {
                async limit() {
                  return {
                    data: [
                      {
                        candidate_id: "branch-menu-item-next-1",
                        restaurant_id: "restaurant-1",
                        branch_id: "branch-1",
                        menu_item_id: "menu-item-next-1",
                        meal_name: "下一餐",
                        restaurant_name: "餐廳",
                        branch_name: "分店",
                        district: "信義區",
                        public_image_url: null,
                        calories: 500,
                        protein: 30,
                        carbohydrates: 50,
                        fat: 12,
                        fiber: 6,
                        nutrition_source_public: "ai_estimated",
                        nutrition_updated_at: "2026-07-23T00:00:00Z",
                        availability: "available"
                      }
                    ],
                    error: null
                  };
                }
              };
            }
          };
        }
      }
    });
  const nextMealRows = await nextMealRepository.getRankedNextMealCandidates({
    referenceCaloriesPerMeal: 500
  });
  const nextCandidate =
    nextMealRows.status === "available" ? nextMealRows.candidates[0] : null;
  expect(
    nextCandidate?.menuItemId === "menu-item-next-1",
    "Next Meal Supabase mapper no longer loses menuItemId"
  );
  expect(
    nextCandidate?.candidateId === nextCandidate?.branchMenuItemId &&
      nextCandidate?.branchMenuItemId === "branch-menu-item-next-1",
    "Next Meal candidateId is explicitly the branch offer identity"
  );
  const presentation = nextMealMapper.mapCanonicalToU1NextMeal(
    {
      status: "available",
      recommendation: {
        source: "supabase",
        dataProvenance: "live",
        candidates: [nextCandidate],
        context: {
          date: "2026-07-23",
          timezone: "Asia/Taipei",
          generatedAt: "2026-07-23T00:00:00Z",
          referenceCaloriesPerMeal: 500,
          recommendationBasis: "calorie_proximity"
        }
      }
    },
    "free",
    1
  );
  expect(
    presentation.status === "success" &&
      presentation.recommendation.candidates[0].menuItemId ===
        "menu-item-next-1" &&
      presentation.recommendation.candidates[0].branchMenuItemId ===
        "branch-menu-item-next-1",
    "Next Meal presentation mapper preserves both item and branch-offer identities"
  );

  const analysisSource = fs.readFileSync(
    path.join(root, "apps/mobile/app/analysis.tsx"),
    "utf8"
  );
  const stateSource = fs.readFileSync(
    path.join(
      root,
      "apps/mobile/features/analysis/useAnalysisCorrectionState.ts"
    ),
    "utf8"
  );
  expect(
    /trustedCanonicalIdentity:\s*toTrustedCanonicalIdentity\(analysis\.selectedCandidate\)/.test(
      analysisSource
    ),
    "Analysis hands the selected typed candidate to trustedCanonicalIdentity"
  );
  expect(
    /selectPersonalUnresolved\("manual"/.test(stateSource) &&
      /selectPersonalUnresolved\("self_cooked"/.test(stateSource) &&
      /openUnresolvedFallback\("none_of_the_above"\)/.test(stateSource) &&
      /openUnresolvedFallback\("catalog_unavailable"\)/.test(stateSource),
    "Manual, self-cooked, and none transitions explicitly replace Catalog identity"
  );
  expect(
    /resolution\.status === "unavailable"\s*\|\|\s*resolution\.status === "error"/.test(
      analysisSource
    ) &&
      /onPress=\{analysis\.openCatalogUnavailableFallback\}/.test(
        analysisSource
      ) &&
      /onPress=\{analysis\.chooseNoneOfTheAbove\}/.test(analysisSource),
    "Catalog failure and explicit none route to distinct unresolved reasons"
  );
  expect(
    !/process\.env|fetch\s*\(|service[_-]?role/i.test(
      fs.readFileSync(new URL(import.meta.url), "utf8")
    ),
    "Smoke uses no remote or credential access"
  );

  for (const name of checks) console.log(`PASS ${name}`);
  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(`RESULT ${checks.length}/${checks.length + 1} FAIL`);
  process.exitCode = 1;
}
