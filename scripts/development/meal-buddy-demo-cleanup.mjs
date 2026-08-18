#!/usr/bin/env node
// =============================================================================================
// DEVELOPMENT ONLY — Supabase project msbgnnoorsoefuiwluye ONLY.
//
// Every tool in this directory hard-fails before any write if pointed at another project, so
// Production is unreachable through normal invocation. SUPABASE_ACCESS_TOKEN must be present in
// the environment; no credential is stored in these files. The fixture password lives only in
// gitignored tmp/meal-buddy-demo-credentials.json, and every report is written to gitignored tmp/.
//
// Run from the repository root, in this order:
//   1. node scripts/development/meal-buddy-demo-seed.mjs      create or reconcile the fixtures
//   2. node scripts/development/meal-buddy-demo-report.mjs    verify through the real endpoints
//   3. node scripts/development/meal-buddy-demo-cleanup.mjs   dry run; add --execute to remove
// =============================================================================================
// Cleanup for the Meal Buddy demo fixture. DRY RUN BY DEFAULT.
//
// Selector: auth.users.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1'. That marker is set only
// by the seed script, is admin-only (a user cannot write app_metadata), and never appears in any
// public profile column, so it cannot reach the SR-2C projection. The deterministic e-mail pattern
// and uuid prefix are asserted as corroborating evidence, never as the sole selector.
//
// Deleting the auth user cascades to consumer_profiles, social_participation,
// social_profile_interest_selection, meal_buddy_cards, taste_profiles and subscription_entitlements
// through their existing ON DELETE CASCADE foreign keys; the counts below are reported first so the
// blast radius is visible before anything is removed. Restaurants are NEVER touched: the seed reused
// canonical Development rows and created none.
//
// Run `node tmp/meal-buddy-demo-cleanup.mjs` to preview, `--execute` to actually delete.
const DEV_REF = "msbgnnoorsoefuiwluye";
if ((process.env.TASTKIND_SEED_PROJECT_REF ?? DEV_REF) !== DEV_REF) throw new Error("wrong project");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");
const EXECUTE = process.argv.includes("--execute");
const FIXTURE = "meal-buddy-demo-v1";
const SELECTOR = `raw_app_meta_data->>'fixture' = '${FIXTURE}'`;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const scope = (await sql(`
with fixture as (select id from auth.users where ${SELECTOR})
select
  (select count(*)::int from fixture) as auth_users,
  (select count(*)::int from auth.users where ${SELECTOR} and email like 'mealbuddy.demo.%@development.invalid') as candidate_emails,
  (select count(*)::int from auth.users where ${SELECTOR} and email = 'mealbuddy.viewer@development.invalid') as viewer_email,
  (select count(*)::int from auth.users where ${SELECTOR} and id::text not like 'de300001-%') as unexpected_uuid_prefix,
  (select count(*)::int from public.consumer_profiles where user_id in (select id from fixture)) as consumer_profiles,
  (select count(*)::int from public.social_participation where user_id in (select id from fixture)) as social_participation,
  (select count(*)::int from public.social_profile_interest_selection where user_id in (select id from fixture)) as interest_selections,
  (select count(*)::int from public.meal_buddy_cards where owner_user_id in (select id from fixture)) as meal_buddy_cards,
  (select count(*)::int from public.taste_profiles where user_id in (select id from fixture)) as taste_profiles,
  (select count(*)::int from public.subscription_entitlements where user_id in (select id from fixture) or entitlement_source = '${FIXTURE}') as entitlements,
  (select count(*)::int from public.social_blocks where blocker_user_id in (select id from fixture) or blocked_user_id in (select id from fixture)) as social_blocks,
  (select count(*)::int from auth.users where not (${SELECTOR}) or raw_app_meta_data->>'fixture' is null) as users_outside_selector,
  (select count(*)::int from public.restaurants) as restaurants_total;`))[0];

console.log(JSON.stringify({ mode: EXECUTE ? "EXECUTE" : "DRY RUN", selector: SELECTOR, scope }, null, 2));

if (scope.unexpected_uuid_prefix !== 0) throw new Error("selector matched a user outside the deterministic uuid prefix; refusing");
if (scope.auth_users !== scope.candidate_emails + scope.viewer_email) {
  throw new Error("selector matched a user outside the deterministic e-mail pattern; refusing");
}

// The dry run returns by falling off the end rather than calling process.exit: forcing the process
// down while a fetch handle is still closing trips a libuv assertion on Windows and reports a
// non-zero status for a run that actually succeeded.
if (!EXECUTE) {
  console.log("\nDRY RUN — nothing deleted. Re-run with --execute to remove exactly the rows above.");
  console.log(`Users NOT matched by the selector and therefore never touched: ${scope.users_outside_selector}`);
  console.log(`Restaurants are never deleted (the seed created none): ${scope.restaurants_total} rows left intact.`);
} else {
  await sql(`
begin;
delete from public.subscription_entitlements where entitlement_source = '${FIXTURE}';
delete from auth.users where ${SELECTOR};
commit;`);
  const residue = (await sql(`
select
  (select count(*)::int from auth.users where ${SELECTOR}) as auth_users,
  (select count(*)::int from auth.users where email like '%@development.invalid') as invalid_domain_users,
  (select count(*)::int from public.subscription_entitlements where entitlement_source = '${FIXTURE}') as entitlements;`))[0];
  console.log(JSON.stringify({ mode: "EXECUTED", residue }, null, 2));
}
