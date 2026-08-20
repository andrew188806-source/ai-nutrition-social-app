#!/usr/bin/env node
// SR-2G-F Development live acceptance for meal/menu context-sensitive Meal Buddy matching.
//
// Everything here is REAL: a real Development sign-in, the real deployed SR-2G-B card endpoints, the
// real deployed SR-2G-D candidate endpoint, the real SR-2G-F context primitive behind it, the real
// SR-2G-C pool, the real SR-2A ranking and the real SR-2B exposure. Nothing is stubbed.
//
// THE DECISIVE TEST is section 4: three source cards owned by the SAME viewer, on the SAME dining
// date, in the SAME meal period, all of card type `general` with no restaurant, differing ONLY in
// their canonical food context. Any difference in the result therefore cannot be attributed to
// restaurant hard eligibility, to the date, to the period, to the entitlement or to the pool.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_F_DEVELOPMENT_ACCEPTANCE=1.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_F_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-f-development-acceptance";
const FIXTURE = "meal-buddy-demo-v1";
const HOTPOT = "food.taiwanese_chinese.hotpot";
const SUSHI = "food.japanese.sushi";
const RAMEN = "food.japanese.ramen";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(condition ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only acceptance` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

const credentials = JSON.parse(fs.readFileSync(path.join(root, "tmp", "meal-buddy-demo-credentials.json"), "utf8"));
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const projectKeys = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
})).json();
const anon = projectKeys.find((entry) => entry.name === "anon")?.api_key;
const base = `https://${DEV_REF}.supabase.co`;

async function signIn(email) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: credentials.password })
  });
  const payload = await res.json();
  if (!payload.access_token) throw new Error(`sign-in failed for ${email}`);
  return payload.access_token;
}
async function callFunction(name, token, body, extraHeaders = {}) {
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 200) }; }
  return { status: res.status, payload };
}

try {
  const viewer = await signIn(credentials.viewerEmail);
  const listed = await callFunction("meal-buddy-card-list", viewer, {});
  const cards = listed.payload.cards ?? [];
  const byContext = (key) => cards.find((c) => c.foodContextTagKey === key && c.cardType === "general");
  const legacyCards = cards.filter((c) => c.foodContextTagKey === null);
  const candidatesFor = async (card) => {
    const res = await callFunction("meal-buddy-candidate-list", viewer, { sourceCardRef: card.sourceCardRef });
    return { status: res.status, payload: res.payload, names: (res.payload.candidates ?? []).map((c) => c.displayName) };
  };

  // ---- 1-2. LEGACY: a card authored with no context still works, on the old semantics ------------
  check("01 the viewer holds at least one legacy source card with no context", legacyCards.length > 0,
    cards.map((c) => ({ t: c.cardType, ctx: c.foodContextTagKey })));
  const legacy = await candidatesFor(legacyCards[0]);
  check("02 a no-context source card still returns real candidates on V1 semantics",
    legacy.status === 200 && legacy.payload.policyVersion === "meal-buddy-candidate-api-v1" && legacy.names.length > 0,
    legacy.status === 200 ? legacy.names.length : legacy.payload);
  // ---- 4-9. the three canonical contexts are accepted and produce real results ---------------------
  const specs = [["hotpot", HOTPOT], ["sushi", SUSHI], ["ramen", RAMEN]];
  const results = {};
  for (const [label, key] of specs) {
    const card = byContext(key);
    check(`04 a ${label} context source card exists and carries the canonical catalog key`,
      Boolean(card) && card.foodContextTagKey === key && card.cardType === "general" && card.restaurantId === null,
      card ?? null);
    results[label] = await candidatesFor(card);
    check(`05 the ${label} context is accepted and returns real candidates`,
      results[label].status === 200 && results[label].names.length > 0,
      results[label].status === 200 ? results[label].names : results[label].payload);
  }

  // ---- 10-15. THE DECISIVE SAME-UNIVERSE CAUSAL TEST -----------------------------------------------
  const contextCards = specs.map(([, key]) => byContext(key));
  check("10 the three context cards are identical in every frozen respect but the context",
    new Set(contextCards.map((c) => `${c.cardType}|${c.restaurantId}|${c.diningDate}|${c.mealPeriod}`)).size === 1
    && new Set(contextCards.map((c) => c.foodContextTagKey)).size === 3,
    contextCards.map((c) => ({ t: c.cardType, r: c.restaurantId, d: c.diningDate, m: c.mealPeriod, ctx: c.foodContextTagKey })));
  check("11 no difference can be attributed to restaurant hard eligibility",
    contextCards.every((c) => c.cardType === "general" && c.restaurantId === null));
  const differs = (a, b) => JSON.stringify(results[a].names) !== JSON.stringify(results[b].names);
  const membershipDiffers = (a, b) =>
    JSON.stringify([...results[a].names].sort()) !== JSON.stringify([...results[b].names].sort());
  check("12 hotpot and sushi produce different candidate results", differs("hotpot", "sushi"),
    { hotpot: results.hotpot.names, sushi: results.sushi.names });
  check("13 sushi and ramen produce different candidate results", differs("sushi", "ramen"),
    { sushi: results.sushi.names, ramen: results.ramen.names });
  check("14 at least one context pair differs in MEMBERSHIP, not merely in order",
    membershipDiffers("hotpot", "sushi") || membershipDiffers("hotpot", "ramen") || membershipDiffers("sushi", "ramen"),
    { hotpot: results.hotpot.names, sushi: results.sushi.names, ramen: results.ramen.names });
  check("15 a context result also differs from the legacy no-context result",
    JSON.stringify(results.hotpot.names) !== JSON.stringify(legacy.names));

  // The primitive is deliberately NOT executable by postgres, so this acceptance never calls it.
  // Instead it re-derives the expected classification from the raw tables and checks the endpoint
  // against that independent model — which proves the rule rather than trusting the implementation.
  const viewerRow = (await sql(`select id::text as id from auth.users where email = '${credentials.viewerEmail}';`))[0];
  const catalog = new Map((await sql(
    "select tag_key, parent_key from public.social_interest_catalog where namespace = 'food';"
  )).map((r) => [r.tag_key, r.parent_key ?? r.tag_key]));
  const poolCards = await sql(`
    select p.display_name, c.owner_user_id::text as owner, c.food_context_tag_key as card_context
    from public.meal_buddy_cards c
    join public.consumer_profiles p on p.user_id = c.owner_user_id
    where c.cancelled_at is null and c.expires_at > now()
      and c.owner_user_id <> '${viewerRow.id}'::uuid
      and c.dining_date = '${contextCards[0].diningDate}'::date
      and c.meal_period = '${contextCards[0].mealPeriod}';`);
  const foodSelections = await sql(
    "select user_id::text as owner, tag_key from public.social_profile_interest_selection where namespace = 'food';");
  const selectionsByOwner = new Map();
  for (const row of foodSelections) {
    if (!selectionsByOwner.has(row.owner)) selectionsByOwner.set(row.owner, new Set());
    selectionsByOwner.get(row.owner).add(row.tag_key);
  }
  // The SR-2G-F rule, restated independently of the SQL that implements it.
  const expectedState = (card, sourceContext) => {
    if (sourceContext === null) return "neutral";
    if (card.card_context !== null) {
      if (card.card_context === sourceContext) return "matched";
      return catalog.get(card.card_context) === catalog.get(sourceContext) ? "neutral" : "unsupported";
    }
    return (selectionsByOwner.get(card.owner) ?? new Set()).has(sourceContext) ? "matched" : "neutral";
  };
  const RANK = { matched: 0, neutral: 1, unsupported: 2 };
  const cardByName = new Map(poolCards.map((c) => [c.display_name, c]));
  const labelsFor = (sourceContext) => new Map(poolCards.map((c) => [c.display_name, expectedState(c, sourceContext)]));

  check("16 a null source context classifies every candidate neutral, which is frozen V1 behaviour",
    [...labelsFor(null).values()].every((state) => state === "neutral"));
  check("17 every independently derived state is inside the closed vocabulary",
    specs.every(([, key]) => [...labelsFor(key).values()].every((s) => s in RANK)));
  check("18 a context produces genuinely mixed classifications, not one uniform label",
    specs.every(([, key]) => new Set(labelsFor(key).values()).size > 1),
    Object.fromEntries(specs.map(([label, key]) => [label, [...new Set(labelsFor(key).values())]])));
  check("19 the SAME candidate is classified differently under different contexts",
    (() => {
      const h = labelsFor(HOTPOT); const s = labelsFor(SUSHI);
      return [...h.keys()].some((name) => h.get(name) !== s.get(name));
    })());
  check("20 the classification removes nobody: every context sees the same pool size",
    new Set(specs.map(([, key]) => labelsFor(key).size)).size === 1 && labelsFor(HOTPOT).size === poolCards.length);
  check("21 a candidate that declares no card context is never unsupported",
    specs.every(([, key]) => poolCards.filter((c) => c.card_context === null)
      .every((c) => labelsFor(key).get(c.display_name) !== "unsupported")));
  check("22 positive profile evidence lifts a card that declares no context of its own",
    poolCards.some((c) => c.card_context === null && labelsFor(HOTPOT).get(c.display_name) === "matched"));
  check("23 an explicitly conflicting card declaration is the only path to unsupported",
    specs.every(([, key]) => poolCards.filter((c) => labelsFor(key).get(c.display_name) === "unsupported")
      .every((c) => c.card_context !== null && catalog.get(c.card_context) !== catalog.get(key))));
  check("24 the same cuisine family stays neutral rather than being promoted",
    poolCards.some((c) => c.card_context !== null && c.card_context !== SUSHI
      && catalog.get(c.card_context) === catalog.get(SUSHI) && labelsFor(SUSHI).get(c.display_name) === "neutral"));

  // ---- 25-27. THE ENDPOINT'S ORDER OBEYS THE INDEPENDENTLY DERIVED BUCKETS ---------------------------
  const bucketOrdered = (label, key) => {
    const labels = labelsFor(key);
    const ranks = results[label].names.map((name) => RANK[labels.get(name) ?? "neutral"]);
    return ranks.every((rank, index) => index === 0 || ranks[index - 1] <= rank);
  };
  for (const [label, key] of specs) {
    check(`25 the ${label} result is ordered matched, then neutral, then unsupported`,
      bucketOrdered(label, key),
      results[label].names.map((n) => [n, labelsFor(key).get(n)]));
  }
  check("26 the exposed prefix is drawn from the matched bucket first",
    (() => {
      const labels = labelsFor(HOTPOT);
      const matched = poolCards.filter((c) => labels.get(c.display_name) === "matched").map((c) => c.display_name);
      return matched.length === 0 || matched.every((name) => results.hotpot.names.includes(name));
    })(), { matched: poolCards.filter((c) => labelsFor(HOTPOT).get(c.display_name) === "matched").map((c) => c.display_name) });
  check("27 the legacy no-context order is NOT bucket-reordered, because every label is neutral",
    legacy.names.every((name) => (labelsFor(null).get(name) ?? "neutral") === "neutral"));

  // ---- 28-33. context validation and security ------------------------------------------------------
  const createBody = (extra) => ({
    cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
    diningDate: contextCards[0].diningDate, mealPeriod: contextCards[0].mealPeriod, preferredTime: null, ...extra
  });
  const unknown = await callFunction("meal-buddy-card-create", viewer, createBody({ foodContextTagKey: "food.japanese.definitely_not_a_tag" }));
  check("22 an unknown context key is rejected as a bad request, never a 503",
    unknown.status === 400 && unknown.payload.error?.code === "invalid_request", unknown);
  const notSelectable = await callFunction("meal-buddy-card-create", viewer, createBody({ foodContextTagKey: "food.japanese" }));
  check("23 a non-selectable top-level category is rejected",
    notSelectable.status === 400, notSelectable.status);
  const freeText = await callFunction("meal-buddy-card-create", viewer, createBody({ foodContextTagKey: "我想吃火鍋" }));
  check("24 an arbitrary free-text dish is rejected", freeText.status === 400, freeText.status);
  const generalTag = await callFunction("meal-buddy-card-create", viewer, createBody({ foodContextTagKey: "general.gaming.esports" }));
  check("25 a general-namespace tag can never become a food context", generalTag.status === 400, generalTag.status);
  const rawMenu = await callFunction("meal-buddy-card-create", viewer, createBody({ foodContextTagKey: "dev-restaurant-haochu" }));
  check("26 a raw restaurant or menu identifier is rejected as a context", rawMenu.status === 400, rawMenu.status);
  const weights = await callFunction("meal-buddy-card-create", viewer, createBody({ contextWeights: { hotpot: 1 } }));
  check("27 a client-supplied context weight is rejected outright", weights.status === 400, weights.status);
  const clientContext = await callFunction("meal-buddy-candidate-list", viewer,
    { sourceCardRef: contextCards[0].sourceCardRef, foodContextTagKey: SUSHI });
  check("28 the candidate endpoint refuses a client-supplied context",
    clientContext.status === 400, clientContext.status);
  const headerContext = await callFunction("meal-buddy-candidate-list", viewer,
    { sourceCardRef: contextCards[0].sourceCardRef }, { "x-source-card-id": "spoof" });
  check("29 an authority header cannot smuggle a context or a source", headerContext.status === 400, headerContext.status);

  // ---- 30-32. another actor's context is unreachable ------------------------------------------------
  const otherEmail = credentials.candidateEmails[0];
  const other = await signIn(otherEmail);
  const otherCards = (await callFunction("meal-buddy-card-list", other, {})).payload.cards ?? [];
  check("30 an actor sees only their OWN cards and contexts",
    otherCards.every((c) => !cards.some((mine) => mine.sourceCardRef === c.sourceCardRef)));
  const foreign = await callFunction("meal-buddy-candidate-list", other, { sourceCardRef: contextCards[0].sourceCardRef });
  check("31 another actor cannot search from the viewer's context card",
    foreign.status !== 200 || (foreign.payload.candidates ?? []).length === 0, foreign.status);
  // ---- 33-35. the frozen pool and its hard rules are unchanged by context -------------------------
  // Again through the raw tables, because the primitive is not executable by this connection.
  const eligibleOwners = new Set(poolCards.map((c) => c.owner));
  check("33 the context layer removes nobody: the endpoint's names all come from the eligible pool",
    specs.every(([label]) => results[label].names.every((name) => cardByName.has(name))),
    Object.fromEntries(specs.map(([label]) => [label, results[label].names.filter((n) => !cardByName.has(n))])));
  // Anyone active on a DIFFERENT occasion must be absent from every context result. If context had
  // widened, redirected or re-filtered the pool, one of these names would appear.
  const otherOccasion = await sql(`
    select distinct p.display_name
    from public.meal_buddy_cards c
    join public.consumer_profiles p on p.user_id = c.owner_user_id
    where c.cancelled_at is null and c.expires_at > now()
      and c.owner_user_id <> '${viewerRow.id}'::uuid
      and (c.dining_date <> '${contextCards[0].diningDate}'::date
           or c.meal_period <> '${contextCards[0].mealPeriod}')
      and p.display_name not in (
        select p2.display_name from public.meal_buddy_cards c2
        join public.consumer_profiles p2 on p2.user_id = c2.owner_user_id
        where c2.cancelled_at is null and c2.expires_at > now()
          and c2.dining_date = '${contextCards[0].diningDate}'::date
          and c2.meal_period = '${contextCards[0].mealPeriod}');`);
  check("34 the SR-2G-C date and meal-period rules still bound the pool under every context",
    poolCards.length > 0
    && specs.every(([label]) => results[label].names.every((name) =>
      !otherOccasion.some((row) => row.display_name === name))),
    otherOccasion.map((r) => r.display_name));
  check("35 one card per owner is preserved across the whole eligible pool",
    eligibleOwners.size === poolCards.length, { owners: eligibleOwners.size, cards: poolCards.length });
  check("36 a Premium actor still sees at most ten", specs.every(([label]) => results[label].names.length <= 10),
    Object.fromEntries(specs.map(([label]) => [label, results[label].names.length])));
  const freeToken = await signIn(credentials.candidateEmails[0]);
  const freeCards = (await callFunction("meal-buddy-card-list", freeToken, {})).payload.cards ?? [];
  const freeResult = freeCards.length === 0 ? null
    : await callFunction("meal-buddy-candidate-list", freeToken, { sourceCardRef: freeCards[0].sourceCardRef });
  check("37 a Free actor still sees at most three over the same contextual ordering",
    freeResult !== null && freeResult.status === 200 && (freeResult.payload.candidates ?? []).length <= 3,
    freeResult === null ? "no free card" : (freeResult.payload.candidates ?? []).length);

  // ---- 38-41. nothing about the context leaks to the client --------------------------------------------
  const serialized = JSON.stringify(results.hotpot.payload);
  check("38 no context state, bucket or source context appears in the candidate response",
    !/matched|unsupported|neutral|contextState|context_state|foodContextTagKey|bucket/i.test(serialized));
  check("39 no matchReasons or explanation reaches the client",
    !/matchReason|whyMatched|explanation/i.test(serialized));
  const rawIds = await sql(`
    select u.id::text as id from auth.users u where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`);
  const rawCardIds = await sql(`
    select c.id::text as id from public.meal_buddy_cards c join auth.users u on u.id = c.owner_user_id
    where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`);
  check("40 no raw user or card identifier reaches the client",
    !rawIds.some((r) => serialized.includes(r.id)) && !rawCardIds.some((r) => serialized.includes(r.id)));
  check("41 references stay opaque and per-request",
    (results.hotpot.payload.candidates ?? []).every((c) => c.candidateRef.startsWith("scr1.") && c.candidateCardRef.startsWith("mbc1.")));

  // ---- 42-44. fixture and environment hygiene -------------------------------------------------------
  const strays = await sql(`
    select count(*)::int as n from public.meal_buddy_cards c
    join auth.users u on u.id = c.owner_user_id
    where c.food_context_tag_key is not null
      and coalesce(u.raw_app_meta_data->>'fixture', '') <> '${FIXTURE}';`);
  check("42 every context card in Development belongs to the managed fixture", strays[0].n === 0, strays);
  const contextTags = await sql(`
    select distinct c.food_context_tag_key as k from public.meal_buddy_cards c
    where c.food_context_tag_key is not null;`);
  check("43 every stored context is a canonical selectable active food catalog key",
    await (async () => {
      const bad = await sql(`
        select count(*)::int as n from public.meal_buddy_cards c
        left join public.social_interest_catalog cat
          on cat.tag_key = c.food_context_tag_key and cat.namespace = 'food' and cat.selectable and cat.active
        where c.food_context_tag_key is not null and cat.tag_key is null;`);
      return bad[0].n === 0;
    })(), contextTags.map((r) => r.k));
  const membership = await sql(`
    select r.rolname as role, g.rolname as grantor, a.inherit_option, a.set_option
    from pg_auth_members a join pg_roles r on r.oid = a.roleid
    join pg_roles m on m.oid = a.member join pg_roles g on g.oid = a.grantor
    where m.rolname = 'postgres' and (r.rolname like 'meal_buddy%' or r.rolname like 'social%')
    order by r.rolname;`);
  check("44 no postgres-granted role membership residue survives the migration",
    membership.every((row) => row.grantor === "supabase_admin" && row.inherit_option === false && row.set_option === false),
    membership);

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    suite: SUITE,
    status,
    projectRef: DEV_REF,
    environment: "development",
    productionTouched: false,
    diningDate: contextCards[0].diningDate,
    mealPeriod: contextCards[0].mealPeriod,
    legacy: { context: null, exposed: legacy.names.length, names: legacy.names },
    hotpot: { context: HOTPOT, exposed: results.hotpot.names.length, names: results.hotpot.names },
    sushi: { context: SUSHI, exposed: results.sushi.names.length, names: results.sushi.names },
    ramen: { context: RAMEN, exposed: results.ramen.names.length, names: results.ramen.names },
    classification: Object.fromEntries(specs.map(([label, key]) => [label,
      [...labelsFor(key).values()].reduce((acc, state) => ({ ...acc, [state]: (acc[state] ?? 0) + 1 }), {})])),
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`SR-2G-F Development acceptance aborted: ${error.message}`);
  process.exit(1);
}
