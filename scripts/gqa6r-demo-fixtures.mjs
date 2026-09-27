// GQA-6R Stable Demo fixtures — deterministic, pure specification (no I/O).
//
// Every entity here is REAL Development backend data once applied by the ensure-* utilities: it lives in
// the canonical tables, passes their checks and triggers, and is read back only through the canonical
// consumer views / social primitives. Nothing here is ever imported by an app runtime.
//
// Identification: every user-facing name carries the visible "[DEMO]" prefix and every id is a stable,
// repository-recorded value (scripts/gqa6r-demo-fixture-manifest.json). Nutrition values are fictional
// demo estimates and are therefore stored ONLY as source 'ai_estimated' (public label "ai_estimated") —
// never as restaurant-confirmed facts. No medical claim is made anywhere.

export const GQA6R_DEMO_FIXTURE_VERSION = "gqa6r-demo-fixtures-v1";
export const DEVELOPMENT_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const DEVELOPMENT_PROJECT_NAME = "tastkind-development";
export const DEMO_PREFIX = "[DEMO]";

export const CATALOGUE_TARGET = Object.freeze({ restaurants: 20, itemsPerRestaurant: 3 });
export const MEAL_BUDDY_TARGET = Object.freeze({ eligibleCards: 20 });

const pad = (n, width = 2) => String(n).padStart(width, "0");
// Deterministic RFC 4122 v4-shaped ids for uuid columns (fixed prefix marks GQA-6R Demo identities).
export const demoIdentityId = (ordinal) => `6a06d0e0-0000-4000-8000-${pad(ordinal, 12)}`;

const DISTRICTS = ["大安區", "信義區", "中山區", "松山區", "中正區", "內湖區", "士林區", "萬華區", "文山區", "南港區"];
const CUISINES = [
  { category: "健康餐盒", tags: ["高蛋白", "均衡"], food: "food.taiwanese_chinese.stir_fry" },
  { category: "日式料理", tags: ["日式", "魚類"], food: "food.japanese.japanese_cuisine" },
  { category: "蔬食", tags: ["蔬食選項", "高纖"], food: "food.ingredient_style.vegetarian_food" },
  { category: "韓式料理", tags: ["韓式"], food: "food.korean.korean_cuisine" },
  { category: "義式料理", tags: ["西式"], food: "food.western.italian" },
  { category: "東南亞料理", tags: ["東南亞"], food: "food.international.southeast_asian" },
  { category: "海鮮料理", tags: ["海鮮"], food: "food.ingredient_style.seafood" },
  { category: "台式小吃", tags: ["台式"], food: "food.taiwanese_chinese.taiwanese_snacks" },
  { category: "早午餐", tags: ["輕食"], food: "food.dining_style.brunch" },
  { category: "拉麵", tags: ["日式", "湯麵"], food: "food.japanese.ramen" }
];
// Three item archetypes per restaurant, deterministically varied so the pool is not uniform under the
// recommendation's calorie / protein / fibre rules. Allergen values are canonical allowed keys.
const DISHES = [
  { name: "香煎雞胸能量碗", category: "能量餐", base: { calories: 520, protein: 42, carbohydrates: 48, fat: 14, fiber: 6 }, allergens: [] , price: 180 },
  { name: "豆腐蔬菜餐", category: "輕食", base: { calories: 410, protein: 22, carbohydrates: 44, fat: 13, fiber: 11 }, allergens: ["soy"], price: 150 },
  { name: "烤魚均衡餐", category: "能量餐", base: { calories: 610, protein: 36, carbohydrates: 58, fat: 22, fiber: 5 }, allergens: ["fish"], price: 230 }
];

function vary(value, restaurantIndex, itemIndex, spread) {
  // Deterministic, bounded offset in [-spread, +spread] (no randomness: reruns produce identical rows).
  const k = ((restaurantIndex * 7 + itemIndex * 13) % 9) - 4;
  return Math.max(0, Math.round(value + (k * spread) / 4));
}

export function buildCatalogueFixtures() {
  return Array.from({ length: CATALOGUE_TARGET.restaurants }, (_, r) => {
    const n = r + 1;
    const cuisine = CUISINES[r % CUISINES.length];
    const rid = `gqa6r-demo-restaurant-${pad(n)}`;
    const menuId = `gqa6r-demo-menu-${pad(n)}`;
    const categories = [...new Set(DISHES.map((d) => d.category))].map((name, c) => ({
      kind: "DEMO_CATEGORY", id: `gqa6r-demo-category-${pad(n)}-${c + 1}`, label: `${DEMO_PREFIX} ${name}`, sort_order: c
    }));
    const items = DISHES.map((dish, i) => {
      const itemId = `gqa6r-demo-item-${pad(n)}-${i + 1}`;
      const nutrition = {
        calories: vary(dish.base.calories, r, i, 160),
        protein: vary(dish.base.protein, r, i, 12),
        carbohydrates: vary(dish.base.carbohydrates, r, i, 16),
        fat: vary(dish.base.fat, r, i, 8),
        fiber: vary(dish.base.fiber, r, i, 4)
      };
      return {
        kind: "DEMO_MENU_ITEM", id: itemId, label: `${DEMO_PREFIX} ${dish.name}`,
        category_id: categories.find((c) => c.label === `${DEMO_PREFIX} ${dish.category}`).id,
        branch_menu_item_id: `gqa6r-demo-bmi-${pad(n)}-${i + 1}`,
        nutrition_id: `gqa6r-demo-nutrition-${pad(n)}-${i + 1}`,
        nutrition, price: (dish.price + ((r * 10 + i * 20) % 90)).toFixed(2),
        allergens: dish.allergens, food_context_tag_key: cuisine.food
      };
    });
    return {
      kind: "DEMO_RESTAURANT", id: rid, label: `${DEMO_PREFIX} 好廚測試餐館 ${pad(n)}`,
      category: cuisine.category, tags: cuisine.tags, city: "台北市", lifecycle: "persistent",
      branch: { kind: "DEMO_BRANCH", id: `gqa6r-demo-branch-${pad(n)}`, label: `${DEMO_PREFIX} 示範分店 ${pad(n)}`, district: DISTRICTS[r % DISTRICTS.length], timezone_name: "Asia/Taipei" },
      menu: { kind: "DEMO_MENU", id: menuId, label: `${DEMO_PREFIX} 主菜單` },
      categories, items
    };
  });
}

const MASCOTS = ["BG", "DH", "FF", "LC", "MD", "PB", "TE", "VG"];
// Every Demo 飯友 card is a RESTAURANT card derived from a real Demo catalogue item (Planner addendum): the
// card is created from that item's canonical recommendation identity, and its food context is derived
// server-side from meal_buddy_menu_item_food_context_mapping — never a free-form string. The 20 cards are
// spread over 10 restaurants (two different items each) so ten food contexts are represented and every
// one of those restaurants has discoverable buddies. Ordinals 21+ (top-ups) continue the same rotation.
export const MEAL_BUDDY_POOL_RESTAURANTS = 10;
export function mealBuddyCatalogueBinding(ordinal) {
  const restaurant = buildCatalogueFixtures()[(ordinal - 1) % MEAL_BUDDY_POOL_RESTAURANTS];
  const item = restaurant.items[Math.floor((ordinal - 1) / MEAL_BUDDY_POOL_RESTAURANTS) % restaurant.items.length];
  return {
    restaurant_id: restaurant.id, restaurant_label: restaurant.label, branch_id: restaurant.branch.id, menu_id: restaurant.menu.id,
    menu_item_id: item.id, menu_item_label: item.label, branch_menu_item_id: item.branch_menu_item_id,
    expected_food_context_tag_key: item.food_context_tag_key
  };
}

export function buildMealBuddyIdentity(ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 99) throw new Error("demo identity ordinal must be 1..99");
  const id = demoIdentityId(ordinal);
  return {
    kind: "DEMO_MEAL_BUDDY_IDENTITY", id, label: `${DEMO_PREFIX} 飯友 ${pad(ordinal)}`, ordinal,
    email: `gqa6r-demo-buddy-${pad(ordinal)}@example.com`,
    profile_id: `gqa6r_demo_buddy_${pad(ordinal)}`, anonymous_display_name: `${DEMO_PREFIX} 匿名飯友 ${pad(ordinal)}`,
    mascot_avatar_key: MASCOTS[(ordinal - 1) % MASCOTS.length], login_capable: false,
    card: { kind: "DEMO_MEAL_BUDDY_CARD", card_type: "restaurant", intention_type: ordinal % 2 ? "chat_first" : "eat_together",
      recommendation: mealBuddyCatalogueBinding(ordinal), food_context_derivation: "server: meal_buddy_menu_item_food_context_mapping", lifecycle: "expiring_replaceable" }
  };
}

export function buildMealBuddyFixtures(count = MEAL_BUDDY_TARGET.eligibleCards) {
  return Array.from({ length: count }, (_, i) => buildMealBuddyIdentity(i + 1));
}

// The one login-capable Demo identity. It is NOT created by any repository utility: its account and
// credential are created by the Planner/user through the normal Auth sign-up, and the credential is typed
// by the user at login. The repository records only this non-secret identity metadata.
export const SECONDARY_INTERACTION_IDENTITY = Object.freeze({
  kind: "SECONDARY_INTERACTION_TEST_IDENTITY", id: demoIdentityId(90), label: `${DEMO_PREFIX} Secondary Interaction Test`,
  email: "gqa6r-demo-secondary@example.com", profile_id: "gqa6r_demo_secondary", anonymous_display_name: `${DEMO_PREFIX} 測試帳號`,
  mascot_avatar_key: "PB", login_capable: true, credential_location: "user-held only (never stored by the repository)"
});

// The repository manifest: non-secret metadata only (ids, labels, kinds, parents, lifecycle).
export function buildManifest({ mealBuddyCount = MEAL_BUDDY_TARGET.eligibleCards } = {}) {
  const restaurants = buildCatalogueFixtures();
  return {
    version: 1,
    target_project: DEVELOPMENT_PROJECT_REF,
    target_project_name: DEVELOPMENT_PROJECT_NAME,
    created_by_fixture_version: GQA6R_DEMO_FIXTURE_VERSION,
    demo_restaurants: restaurants.map((r) => ({
      kind: r.kind, id: r.id, label: r.label, lifecycle: r.lifecycle,
      branch: { kind: r.branch.kind, id: r.branch.id, label: r.branch.label, parent_id: r.id },
      menu: { kind: r.menu.kind, id: r.menu.id, label: r.menu.label, parent_id: r.id },
      categories: r.categories.map((c) => ({ kind: c.kind, id: c.id, label: c.label, parent_id: r.menu.id }))
    })),
    demo_menu_items: restaurants.flatMap((r) => r.items.map((i) => ({
      kind: i.kind, id: i.id, label: i.label, parent_restaurant_id: r.id, parent_category_id: i.category_id,
      branch_menu_item_id: i.branch_menu_item_id, branch_id: r.branch.id, nutrition_id: i.nutrition_id, lifecycle: "persistent"
    }))),
    demo_meal_buddy_identities: buildMealBuddyFixtures(mealBuddyCount).map((b) => ({ kind: b.kind, id: b.id, label: b.label, profile_id: b.profile_id, login_capable: false, lifecycle: "persistent" })),
    demo_meal_buddy_cards: buildMealBuddyFixtures(mealBuddyCount).map((b) => ({ kind: b.card.kind, owner_id: b.id, owner_label: b.label, card_type: b.card.card_type, intention_type: b.card.intention_type,
      recommendation: b.card.recommendation, food_context_derivation: b.card.food_context_derivation, lifecycle: b.card.lifecycle, id: null,
      note: "created per target slot AS the owning identity through the canonical recommendation card path (meal-buddy-card-create with selectedRecommendation); ids are not stable across top-ups" })),
    secondary_interaction_identity: { kind: SECONDARY_INTERACTION_IDENTITY.kind, id: SECONDARY_INTERACTION_IDENTITY.id, label: SECONDARY_INTERACTION_IDENTITY.label, login_capable: true, lifecycle: "on_request" }
  };
}

// Hard stop: every write path calls this with the Management API's own answer about the target.
export function assertDevelopmentTarget({ ref, projectName }) {
  if (ref !== DEVELOPMENT_PROJECT_REF) throw new Error(`refusing: target project ref is not the Development project (${String(ref).slice(0, 4)}…)`);
  if (projectName !== DEVELOPMENT_PROJECT_NAME) throw new Error("refusing: target project name is not tastkind-development");
  return true;
}

const q = (value) => value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`;
const arr = (values) => `array[${values.map(q).join(",")}]::text[]`;

// Idempotent SQL for ONE restaurant (single transaction): canonical parents first, then children.
// `on conflict (id) do nothing` preserves anything already present; nothing here updates or deletes.
export function catalogueRestaurantSql(r) {
  const s = [];
  s.push("begin;");
  s.push(`insert into public.restaurants (id, name, city, category, tags, status) values (${q(r.id)}, ${q(r.label)}, ${q(r.city)}, ${q(r.category)}, ${arr(r.tags)}, 'active') on conflict (id) do nothing;`);
  // is_active is a generated column (derived from status) and is never written.
  s.push(`insert into public.restaurant_branches (id, restaurant_id, name, district, status, timezone_name) values (${q(r.branch.id)}, ${q(r.id)}, ${q(r.branch.label)}, ${q(r.branch.district)}, 'active', ${q(r.branch.timezone_name)}) on conflict (id) do nothing;`);
  s.push(`insert into public.menus (id, restaurant_id, name, status) values (${q(r.menu.id)}, ${q(r.id)}, ${q(r.menu.label)}, 'published') on conflict (id) do nothing;`);
  for (const c of r.categories) s.push(`insert into public.menu_categories (id, menu_id, name, sort_order) values (${q(c.id)}, ${q(r.menu.id)}, ${q(c.label)}, ${c.sort_order}) on conflict (id) do nothing;`);
  for (const i of r.items) {
    s.push(`insert into public.menu_items (id, restaurant_id, menu_category_id, name, description, allergens, status, nutrition_badge_status) values (${q(i.id)}, ${q(r.id)}, ${q(i.category_id)}, ${q(i.label)}, ${q(`${DEMO_PREFIX} 示範資料，非真實餐點。`)}, ${arr(i.allergens)}, 'active', 'ai_estimated') on conflict (id) do nothing;`);
    s.push(`insert into public.menu_item_nutrition (id, menu_item_id, calories, protein, carbohydrates, fat, fiber, serving_size, source, verified_status, is_current) values (${q(i.nutrition_id)}, ${q(i.id)}, ${i.nutrition.calories}, ${i.nutrition.protein}, ${i.nutrition.carbohydrates}, ${i.nutrition.fat}, ${i.nutrition.fiber}, '1 份', 'ai_estimated', 'ai_estimated', true) on conflict (id) do nothing;`);
    s.push(`update public.menu_items set nutrition_id = ${q(i.nutrition_id)} where id = ${q(i.id)} and nutrition_id is null;`);
    s.push(`insert into public.branch_menu_items (id, restaurant_id, branch_id, menu_item_id, price, availability) values (${q(i.branch_menu_item_id)}, ${q(r.id)}, ${q(r.branch.id)}, ${q(i.id)}, ${i.price}, 'available') on conflict (id) do nothing;`);
    s.push(`insert into public.meal_buddy_menu_item_food_context_mapping (menu_item_id, food_context_tag_key, food_context_namespace, active) select ${q(i.id)}, ${q(i.food_context_tag_key)}, 'food', true where not exists (select 1 from public.meal_buddy_menu_item_food_context_mapping m where m.menu_item_id = ${q(i.id)});`);
  }
  s.push("commit;");
  return s.join("\n");
}
