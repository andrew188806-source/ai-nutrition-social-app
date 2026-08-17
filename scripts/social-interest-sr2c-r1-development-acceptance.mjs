#!/usr/bin/env node
// SR-2C-R1 Development acceptance: catalog, settings write authority, additive public projection,
// category aggregation, compact-card derivation, and the decisive no-snapshot invariant.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2C_R1_DEVELOPMENT_ACCEPTANCE=1.
//
// Every fixture lives inside one transaction that is ROLLED BACK, so residue is zero by
// construction. Writes are executed as the real `authenticated` role with a JWT claim, because the
// settings authority derives ownership from auth.uid() and nothing else.
import {
  aggregateInterestCategories, collectProfileInterests, deriveCompactInterests
} from "../supabase/functions/_shared/social-interest/aggregate.ts";

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2C_R1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-interest-sr2c-r1-development-acceptance";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(condition ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only acceptance` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const t = await res.text();
  if (!res.ok) return { error: `${res.status}: ${t.slice(0, 300)}` };
  return JSON.parse(t);
}

// Hex-only marker; a non-hex character would make every fixture insert fail as a malformed uuid.
const M = "5c2c0d01";
const U = (s) => `${M}-0000-4000-8000-${s.padStart(12, "0")}`;
const ACTOR = U("a");
const B = U("b");          // the decisive no-snapshot subject
const WIDE = U("c");       // >3 top categories, for the compact contract
const EMPTY = U("d");      // no selections at all
const CARD = U("e1");
const INSTANT = "2026-08-20T04:00:00Z";

const person = (id) => `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${id}'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','${id}@example.com','',now(),now());
insert into public.consumer_profiles (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status, public_bio, willing_to_chat)
values ('${id}'::uuid,'sr2cr1_${id}','N ${id}','Anon ${id}','PB','active','bio ${id}',true);
insert into public.social_participation (user_id, state, opted_in_at)
values ('${id}'::uuid,'opted_in', timestamptz '2026-01-01T00:00:00Z');`;

// Runs a statement as the real authenticated role with the given actor's JWT claim.
const asUser = (id, stmt) => `
set local role authenticated;
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
${stmt}
reset role;`;

const G = (t) => `general.${t}`;
const F = (t) => `food.${t}`;
const proj = (actor, ids) =>
  `select coalesce(json_agg(json_build_object('ord',exposure_ordinal,'ns',namespace,'tag',tag_key,'cat',category_key,'ord2',display_order) order by exposure_ordinal, namespace, display_order, tag_key),'[]'::json)
   from social_internal.project_public_social_interests('${actor}'::uuid, array[${ids.map((i) => `'${i}'::uuid`).join(",")}])`;

try {
  // ---- catalog authority (read-only, no fixtures) -------------------------------------------------
  const cat = (await sql(`
    select
      (select count(*) from public.social_interest_catalog where namespace='general' and depth=1 and selectable) as general_tags,
      (select count(*) from public.social_interest_catalog where namespace='food' and depth=1 and selectable) as food_tags,
      (select count(*) from public.social_interest_catalog where depth=0) as categories,
      (select count(*) from public.social_interest_catalog where depth=0 and selectable) as selectable_categories,
      (select count(*) from public.social_interest_catalog c where c.depth=1 and not exists
         (select 1 from public.social_interest_catalog p where p.tag_key=c.parent_key and p.namespace=c.namespace)) as orphan_or_cross_namespace,
      (select parent_key from public.social_interest_catalog where tag_key='general.entertainment.movie') as movie_parent,
      (select parent_key from public.social_interest_catalog where tag_key='food.japanese.sushi') as sushi_parent,
      (select label from public.social_interest_catalog_label where tag_key='general.entertainment.movie' and locale='zh-TW') as movie_label,
      (select count(*) from pg_type where typtype='e' and typname ilike '%interest%') as interest_enums,
      (select count(*) from public.social_interest_catalog where active and selectable and tag_key like 'general.%') as active_general`))[0];

  check("01 general stable keys resolve", Number(cat.general_tags) > 0, cat.general_tags);
  check("02 food stable keys resolve", Number(cat.food_tags) > 0, cat.food_tags);
  check("03 hierarchy resolves with no orphan or cross-namespace parent", Number(cat.orphan_or_cross_namespace) === 0, cat.orphan_or_cross_namespace);
  check("04 top-level parents resolve", cat.movie_parent === "general.entertainment" && cat.sushi_parent === "food.japanese", { movie: cat.movie_parent, sushi: cat.sushi_parent });
  check("05 both namespaces carry exactly eight top categories", Number(cat.categories) === 16, cat.categories);
  check("06 namespaces stay separate and categories are not selectable", Number(cat.selectable_categories) === 0, cat.selectable_categories);
  check("07 the localized label is not identity", cat.movie_label === "電影" && cat.movie_label !== "general.entertainment.movie");
  check("08 no PostgreSQL enum models interest options", Number(cat.interest_enums) === 0, cat.interest_enums);

  const order = await sql(`select tag_key from public.social_interest_catalog where namespace='general' and depth=0 order by display_order, tag_key`);
  const order2 = await sql(`select tag_key from public.social_interest_catalog where namespace='general' and depth=0 order by display_order, tag_key`);
  check("09 deterministic display ordering", JSON.stringify(order) === JSON.stringify(order2) && order[0].tag_key === "general.entertainment");

  // ---- everything else runs inside one rolled-back transaction ------------------------------------
  const script = `
begin;
${person(ACTOR)}${person(B)}${person(WIDE)}${person(EMPTY)}
insert into public.meal_buddy_cards
  (id, owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period, preferred_time, created_at, expires_at, cancelled_at)
values ('${CARD}'::uuid,'${B}'::uuid,'general','chat_first',null,null,date '2026-08-21','dinner',null,
        timestamptz '2026-08-19T00:00:00Z', timestamptz '2026-08-22T00:00:00Z', null);

${asUser(B, `select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}']);
select public.replace_authenticated_social_interests('food', array['${F("japanese.sushi")}']);`)}

${asUser(WIDE, `select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}','${G("entertainment.anime")}','${G("gaming.console_gaming")}','${G("fitness_sports.fitness")}','${G("fitness_sports.running")}','${G("creative.photography")}']);
select public.replace_authenticated_social_interests('food', array['${F("japanese.sushi")}','${F("japanese.ramen")}','${F("dessert_drinks.coffee")}','${F("dessert_drinks.dessert")}']);`)}

-- snapshot of the card row BEFORE the settings change, for the decisive invariant
create temporary table sr2cr1_card_before on commit drop as
  select * from public.meal_buddy_cards where id='${CARD}'::uuid;

grant social_runtime_executor to postgres with inherit false, set true;
set local role social_runtime_executor;
select
  (${proj(ACTOR, [B])}) as before_change,
  (${proj(ACTOR, [WIDE])}) as wide,
  (${proj(ACTOR, [EMPTY])}) as empty_profile
into temporary sr2cr1_first;
set local role postgres;

-- SETTINGS CHANGE ONLY. The Meal Buddy card is never touched, recreated or re-read for writing.
${asUser(B, `select public.replace_authenticated_social_interests('general', array['${G("creative.photography")}']);
select public.replace_authenticated_social_interests('food', array['${F("japanese.ramen")}']);`)}

set local role social_runtime_executor;
select (${proj(ACTOR, [B])}) as after_change into temporary sr2cr1_second;
set local role postgres;

select
  (select before_change from sr2cr1_first) as before_change,
  (select wide from sr2cr1_first) as wide,
  (select empty_profile from sr2cr1_first) as empty_profile,
  (select after_change from sr2cr1_second) as after_change,
  (select count(*) from public.social_profile_interest_selection where user_id='${B}'::uuid) as b_selection_rows,
  (select to_jsonb(c.*) from public.meal_buddy_cards c where c.id='${CARD}'::uuid) as card_after,
  (select to_jsonb(c.*) from sr2cr1_card_before c) as card_before;
rollback;`;

  const live = await sql(script);
  if (live.error) throw new Error(`live script failed: ${live.error}`);
  const row = live[0];
  const rows = (v) => (row[v] ?? []).map((e) => ({ exposure_ordinal: e.ord, namespace: e.ns, tag_key: e.tag, category_key: e.cat, display_order: e.ord2 }));

  const before = collectProfileInterests(rows("before_change"));
  const after = collectProfileInterests(rows("after_change"));
  const wide = collectProfileInterests(rows("wide"));
  const empty = collectProfileInterests(rows("empty_profile"));

  // ---- projection ------------------------------------------------------------------------------
  check("10 complete general fine tags are returned", before.publicInterestTags.map((t) => t.tagKey).join() === G("entertainment.movie"), before.publicInterestTags);
  check("11 complete food fine tags are returned", before.foodInterestTags.map((t) => t.tagKey).join() === F("japanese.sushi"), before.foodInterestTags);
  check("12 an empty profile yields [] and [] rather than null", Array.isArray(empty.publicInterestTags) && empty.publicInterestTags.length === 0 && empty.foodInterestTags.length === 0);
  check("13 a user with no interests still projects (does not disappear)", row.empty_profile !== null && row.empty_profile !== undefined);
  const raw = JSON.stringify(row.before_change);
  check("14 no raw user uuid is exposed", !raw.includes(B) && !raw.includes(ACTOR));
  check("15 no internal selection row id or catalog surrogate id is exposed", !/"id"|selection_id|catalog_id/i.test(raw));
  check("16 no Taste, inference, confidence or health metadata is exposed", !/taste|confidence|score|similarity|nutrition|allerg|restriction/i.test(raw));
  check("17 the projection returns the parent category explicitly", before.publicInterestTags.every((t) => t.categoryKey === "general.entertainment"));

  // ---- aggregation + compact -------------------------------------------------------------------
  const wideCats = aggregateInterestCategories(wide);
  check("18 general fine tags aggregate to unique top categories",
    JSON.stringify(wideCats.publicInterestCategories) === JSON.stringify(["general.entertainment", "general.gaming", "general.fitness_sports", "general.creative"]), wideCats.publicInterestCategories);
  check("19 food fine tags aggregate to unique top categories",
    JSON.stringify(wideCats.foodInterestCategories) === JSON.stringify(["food.japanese", "food.dessert_drinks"]), wideCats.foodInterestCategories);
  check("20 no duplicate top category appears",
    new Set(wideCats.publicInterestCategories).size === wideCats.publicInterestCategories.length);
  const compact = deriveCompactInterests(wideCats);
  check("21 the compact general line shows at most three categories", compact.publicInterests.visibleCategories.length === 3);
  check("22 the compact general overflow count is derived correctly", compact.publicInterests.overflowCount === 1, compact.publicInterests);
  check("23 the compact food line does not overflow when under the limit", compact.foodInterests.visibleCategories.length === 2 && compact.foodInterests.overflowCount === 0);
  check("24 canonical fine selections are NOT truncated to three", wide.publicInterestTags.length === 6, wide.publicInterestTags.length);
  check("25 the complete category set remains available alongside the compact line", wideCats.publicInterestCategories.length === 4);
  check("26 no '+N' is persisted anywhere", !/\+\d/.test(JSON.stringify(row.wide)));

  // ---- the decisive no-snapshot invariant (contract section 31) ---------------------------------
  check("27 before the settings change the projection showed movie and sushi",
    before.publicInterestTags[0]?.tagKey === G("entertainment.movie") && before.foodInterestTags[0]?.tagKey === F("japanese.sushi"));
  check("28 after the settings change the SAME card projects photography and ramen",
    after.publicInterestTags[0]?.tagKey === G("creative.photography") && after.foodInterestTags[0]?.tagKey === F("japanese.ramen"), after);
  check("29 the Meal Buddy card row is byte-identical before and after the settings change",
    JSON.stringify(row.card_before) === JSON.stringify(row.card_after), { before: row.card_before, after: row.card_after });
  check("30 the card carries no interest column of any kind",
    !/interest|tag_key|hobby/i.test(JSON.stringify(row.card_after)), Object.keys(row.card_after ?? {}));
  check("31 replacement is atomic: exactly one general and one food row remain for the subject",
    Number(row.b_selection_rows) === 2, row.b_selection_rows);

  // ---- settings write authority (negative paths, each in its own rolled-back transaction) --------
  const attempt = async (actor, stmt) => {
    const r = await sql(`begin;\n${person(actor)}\n${asUser(actor, stmt)}\nrollback;`);
    return r.error ?? null;
  };
  const nine = Array.from({ length: 9 }, (_, i) => `'${["entertainment.movie","entertainment.anime","gaming.esports","fitness_sports.yoga","music.singing","creative.design","learning_culture.reading","lifestyle_social.pets","gaming.board_games"][i]}'`)
    .map((k) => k.replace("'", "'general.")).join(",");

  check("32 general max 8 is enforced server-side",
    (await attempt(U("f1"), `select public.replace_authenticated_social_interests('general', array[${nine}]);`))?.includes("LIMIT_EXCEEDED"));
  check("33 food max 5 is enforced server-side",
    (await attempt(U("f2"), `select public.replace_authenticated_social_interests('food', array['${F("japanese.sushi")}','${F("japanese.ramen")}','${F("japanese.izakaya")}','${F("korean.korean_bbq")}','${F("western.pizza")}','${F("dessert_drinks.coffee")}']);`))?.includes("LIMIT_EXCEEDED"));
  check("34 an unknown key is rejected",
    (await attempt(U("f3"), `select public.replace_authenticated_social_interests('general', array['general.entertainment.not_a_real_tag']);`))?.includes("NOT_SELECTABLE"));
  check("35 arbitrary free-form text cannot become a selection",
    (await attempt(U("f4"), `select public.replace_authenticated_social_interests('general', array['我喜歡看電影']);`))?.includes("NOT_SELECTABLE"));
  check("36 a namespace mismatch is rejected",
    (await attempt(U("f5"), `select public.replace_authenticated_social_interests('general', array['${F("japanese.sushi")}']);`))?.includes("NOT_SELECTABLE"));
  check("37 a non-selectable top category is rejected",
    (await attempt(U("f6"), `select public.replace_authenticated_social_interests('general', array['general.entertainment']);`))?.includes("NOT_SELECTABLE"));
  check("38 an invalid namespace is rejected",
    (await attempt(U("f7"), `select public.replace_authenticated_social_interests('taste', array['${G("entertainment.movie")}']);`))?.includes("NAMESPACE_INVALID"));
  check("39 an unauthenticated caller is rejected",
    (await sql(`begin; set local role authenticated; select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}']); rollback;`)).error?.includes("AUTHENTICATION_REQUIRED"));

  const dedupe = await sql(`begin;\n${person(U("f8"))}\n${asUser(U("f8"), `select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}','${G("entertainment.movie")}','${G("entertainment.movie")}']);`)}
    select (select count(*) from public.social_profile_interest_selection where user_id='${U("f8")}'::uuid) as rows;\nrollback;`);
  check("40 duplicate request inputs cannot create duplicate canonical rows", Number(dedupe[0]?.rows) === 1, dedupe[0]);

  const cleared = await sql(`begin;\n${person(U("f9"))}\n${asUser(U("f9"), `select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}']);
    select public.replace_authenticated_social_interests('general', array[]::text[]);`)}
    select (select count(*) from public.social_profile_interest_selection where user_id='${U("f9")}'::uuid) as rows;\nrollback;`);
  check("41 clearing a namespace leaves zero rows, yielding [] not null", Number(cleared[0]?.rows) === 0, cleared[0]);

  const cross = await sql(`begin;\n${person(U("fa"))}${person(U("fb"))}\n${asUser(U("fa"), `select public.replace_authenticated_social_interests('general', array['${G("entertainment.movie")}']);`)}
    select (select count(*) from public.social_profile_interest_selection where user_id='${U("fb")}'::uuid) as victim_rows;\nrollback;`);
  check("42 a caller cannot modify another user's interests (no identity parameter exists)", Number(cross[0]?.victim_rows) === 0, cross[0]);

  // ---- direct table writes stay closed ----------------------------------------------------------
  const direct = await sql(`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"${B}","role":"authenticated"}';
    insert into public.social_profile_interest_selection (user_id, tag_key, namespace) values ('${B}'::uuid,'${G("entertainment.movie")}','general'); rollback;`);
  check("43 direct INSERT into the selection table is denied for authenticated", Boolean(direct.error), direct.error);

  // ---- residue ----------------------------------------------------------------------------------
  const residue = (await sql(`
    select (select count(*) from auth.users where id::text like '${M}%') as users,
           (select count(*) from public.consumer_profiles where user_id::text like '${M}%') as profiles,
           (select count(*) from public.social_profile_interest_selection where user_id::text like '${M}%') as selections,
           (select count(*) from public.meal_buddy_cards where id::text like '${M}%') as cards,
           (select count(*) from public.social_participation where user_id::text like '${M}%') as participation`))[0];
  check("44 zero fixture residue remains", Object.values(residue).every((n) => Number(n) === 0), residue);

  const summary = Object.freeze({
    suite: SUITE, projectRef: DEV_REF, environment: "development", productionTouched: false,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message }, null, 2));
  process.exit(1);
}
