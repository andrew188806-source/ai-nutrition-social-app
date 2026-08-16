#!/usr/bin/env node
// SR-2G-A Development acceptance for the canonical Meal Buddy card authority.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_A_DEVELOPMENT_ACCEPTANCE=1.
//
// Every fixture assertion runs inside its own `begin … rollback`, so the acceptance leaves no row
// behind at all — there is no cleanup phase to forget and no residue to sweep. The migration itself
// is applied for real, because a schema authority that has never met a real PostgreSQL is not an
// authority. No Edge function is deployed and no Production secret is set.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2GA_MIGRATION, SR2GA_REF_ROOT } from "./social-candidate-sr2g-a-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_A_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-a-development-acceptance";

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
const MANAGEMENT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!MANAGEMENT_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}
// Runs a statement inside a transaction that is always rolled back, and reports whether PostgreSQL
// accepted it. Nothing it writes can survive, whichever way the assertion goes.
async function attempt(statements) {
  try {
    await sql(`begin;\n${statements}\nrollback;`);
    return { accepted: true, error: null };
  } catch (error) {
    return { accepted: false, error: error.message };
  }
}

// --- the real card-reference primitive, transpiled in memory --------------------------------------
const refCache = new Map();
function loadRef(absolute) {
  if (refCache.has(absolute)) return refCache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
  });
  const module = { exports: {} };
  refCache.set(absolute, module);
  new Function("require", "module", "exports", outputText)(
    (spec) => loadRef(path.resolve(path.dirname(absolute), spec)), module, module.exports);
  return module.exports;
}
const ref = loadRef(path.join(root, SR2GA_REF_ROOT, "index.ts"));

// Hex-only. A non-hex character here would make every negative assertion below pass for the wrong
// reason: PostgreSQL would reject the seed as a malformed uuid before the constraint under test was
// ever reached, and a rejection is what those checks are looking for.
const ACTOR_A = "5a2f0a01-0000-4000-8000-00000000000a";
const ACTOR_B = "5a2f0a01-0000-4000-8000-00000000000b";
const RESTAURANT = "sr2ga-acceptance-restaurant";

try {
  // --- 0. preflight -------------------------------------------------------------------------------
  const project = await sql("select current_database() as db, current_user as who;");
  check("00 the acceptance is pointed at the Development project", Array.isArray(project) && project.length === 1, { DEV_REF });

  const before = await sql(`select to_regclass('public.meal_buddy_cards') is not null as present;`);
  const alreadyApplied = before[0].present === true;
  console.log(`     (table already present: ${alreadyApplied})`);

  // --- 1. apply the migration ---------------------------------------------------------------------
  if (!alreadyApplied) {
    const migrationSql = fs.readFileSync(path.join(root, SR2GA_MIGRATION), "utf8");
    await sql(migrationSql);
  }
  const after = await sql(`select to_regclass('public.meal_buddy_cards') is not null as present;`);
  check("01 the canonical card table exists in Development", after[0].present === true);

  // --- 2. schema posture ---------------------------------------------------------------------------
  const columns = await sql(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_buddy_cards'
    order by column_name;`);
  const columnNames = columns.map((row) => row.column_name).sort();
  check("02 the column set is exactly the declared minimum",
    JSON.stringify(columnNames) === JSON.stringify(["area", "cancelled_at", "card_type", "created_at", "dining_date", "expires_at", "id", "intention_type", "meal_period", "owner_user_id", "preferred_time", "restaurant_id"]),
    columnNames);
  check("03 dining_date is a date, not a timestamp",
    columns.find((c) => c.column_name === "dining_date")?.data_type === "date");
  check("04 no status column exists, so lifecycle has a single authority",
    !columnNames.includes("status"));
  check("05 area and cancelled_at are nullable",
    columns.find((c) => c.column_name === "area")?.is_nullable === "YES" &&
    columns.find((c) => c.column_name === "cancelled_at")?.is_nullable === "YES");

  const constraints = await sql(`
    select conname, contype from pg_constraint
    where conrelid = 'public.meal_buddy_cards'::regclass order by conname;`);
  const names = constraints.map((row) => row.conname);
  check("06 the primary key exists", constraints.some((c) => c.contype === "p"));
  check("07 both foreign keys exist", constraints.filter((c) => c.contype === "f").length === 2);
  check("08 the enum and invariant checks exist",
    ["meal_buddy_cards_card_type_valid", "meal_buddy_cards_intention_type_valid", "meal_buddy_cards_meal_period_valid",
     "meal_buddy_cards_restaurant_card_requires_restaurant", "meal_buddy_cards_expiry_after_creation"]
      .every((n) => names.includes(n)), names);
  check("09 no uniqueness constraint other than the primary key exists, so Premium multiplicity survives",
    constraints.filter((c) => c.contype === "u").length === 0);

  const indexes = await sql(`select indexname from pg_indexes where schemaname='public' and tablename='meal_buddy_cards' order by indexname;`);
  check("10 exactly the three declared indexes plus the primary key exist",
    indexes.length === 4, indexes.map((i) => i.indexname));

  const rls = await sql(`select relrowsecurity from pg_class where oid='public.meal_buddy_cards'::regclass;`);
  check("11 row level security is enabled", rls[0].relrowsecurity === true);

  const policies = await sql(`select policyname, cmd, roles::text from pg_policies where schemaname='public' and tablename='meal_buddy_cards';`);
  check("12 exactly one owner-scoped select policy exists",
    policies.length === 1 && policies[0].cmd === "SELECT" && policies[0].policyname === "meal_buddy_cards_owner_read",
    policies);

  // Grant posture is asserted against the frozen social_participation precedent rather than against
  // a hand-written list. Supabase applies a platform-level default grant of Dxtm (TRUNCATE,
  // REFERENCES, TRIGGER, MAINTAIN) to service_role on every new public table — no read and no write.
  // Comparing to the precedent proves the new table is exactly as closed as an already-frozen one,
  // and cannot drift if the platform default changes.
  const grantsFor = async (table) => (await sql(`
    select grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='${table}' order by grantee, privilege_type;`))
    .map((row) => `${row.grantee}:${row.privilege_type}`);
  const cardGrants = await grantsFor("meal_buddy_cards");
  const precedentGrants = await grantsFor("social_participation");
  check("13 the grant posture is identical to the frozen social_participation precedent",
    JSON.stringify(cardGrants) === JSON.stringify(precedentGrants), { cardGrants, precedentGrants });

  const readWrite = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
  const dmlHolders = cardGrants
    .map((entry) => entry.split(":"))
    .filter(([, privilege]) => readWrite.has(privilege))
    .filter(([grantee]) => grantee !== "postgres");
  check("14 the only non-owner DML privilege in existence is SELECT for authenticated",
    dmlHolders.every(([grantee, privilege]) => grantee === "authenticated" && privilege === "SELECT"), { dmlHolders });
  check("14b anon, public, authenticator and the runtime executor hold nothing at all",
    !cardGrants.some((entry) => /^(anon|PUBLIC|authenticator|social_runtime_executor):/.test(entry)), { cardGrants });

  // --- 3. constraint behaviour, every case rolled back ----------------------------------------------
  const seedUsers = `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${ACTOR_A}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'sr2ga-a@example.com', '', now(), now()),
       ('${ACTOR_B}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'sr2ga-b@example.com', '', now(), now());
insert into public.restaurants (id, name, status) values ('${RESTAURANT}', 'SR-2G-A acceptance', 'active');`;

  const card = (overrides = {}) => {
    const values = {
      owner: `'${ACTOR_A}'::uuid`, card_type: `'general'`, intention_type: `'chat_first'`,
      restaurant_id: "null", dining_date: `date '2026-08-20'`, meal_period: `'dinner'`,
      expires_at: "now() + interval '6 hours'", ...overrides
    };
    return `insert into public.meal_buddy_cards
      (owner_user_id, card_type, intention_type, restaurant_id, dining_date, meal_period, expires_at)
      values (${values.owner}, ${values.card_type}, ${values.intention_type}, ${values.restaurant_id}, ${values.dining_date}, ${values.meal_period}, ${values.expires_at});`;
  };

  check("15 a valid general card is accepted", (await attempt(`${seedUsers}\n${card()}`)).accepted);
  check("16 a valid restaurant card with a restaurant is accepted",
    (await attempt(`${seedUsers}\n${card({ card_type: `'restaurant'`, restaurant_id: `'${RESTAURANT}'` })}`)).accepted);
  check("17 a restaurant card WITHOUT a restaurant is rejected",
    !(await attempt(`${seedUsers}\n${card({ card_type: `'restaurant'` })}`)).accepted);
  check("18 an invalid card_type is rejected",
    !(await attempt(`${seedUsers}\n${card({ card_type: `'group'` })}`)).accepted);
  check("19 an invalid intention_type is rejected",
    !(await attempt(`${seedUsers}\n${card({ intention_type: `'maybe'` })}`)).accepted);
  check("20 an invalid meal_period is rejected",
    !(await attempt(`${seedUsers}\n${card({ meal_period: `'brunch'` })}`)).accepted);
  check("21 an unknown owner is rejected by the foreign key",
    !(await attempt(card({ owner: `'00000000-0000-4000-8000-000000000999'::uuid` }))).accepted);
  check("22 an unknown restaurant is rejected by the foreign key",
    !(await attempt(`${seedUsers}\n${card({ card_type: `'restaurant'`, restaurant_id: `'no-such-restaurant'` })}`)).accepted);
  check("23 an expiry at or before creation is rejected",
    !(await attempt(`${seedUsers}\n${card({ expires_at: "now() - interval '1 hour'" })}`)).accepted);
  check("24 a cancelled_at before creation is rejected",
    !(await attempt(`${seedUsers}\ninsert into public.meal_buddy_cards
      (owner_user_id, card_type, intention_type, dining_date, meal_period, expires_at, cancelled_at)
      values ('${ACTOR_A}'::uuid, 'general', 'chat_first', date '2026-08-20', 'dinner', now() + interval '6 hours', now() - interval '1 day');`)).accepted);
  check("25 several active cards for one owner are structurally allowed",
    (await attempt(`${seedUsers}\n${card()}\n${card({ meal_period: `'lunch'` })}\n${card({ card_type: `'restaurant'`, restaurant_id: `'${RESTAURANT}'` })}\n${card({ dining_date: `date '2026-08-21'` })}`)).accepted);

  // --- 4. RLS behaviour under the authenticated role -------------------------------------------------
  const ownerVisible = await sql(`
begin;
${seedUsers}
insert into public.meal_buddy_cards (owner_user_id, card_type, intention_type, dining_date, meal_period, expires_at)
values ('${ACTOR_A}'::uuid, 'general', 'chat_first', date '2026-08-20', 'dinner', now() + interval '6 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"${ACTOR_A}","role":"authenticated"}';
select count(*)::int as visible from public.meal_buddy_cards;
rollback;`);
  const ownerRows = Array.isArray(ownerVisible) ? ownerVisible : [];
  check("26 the owner sees their own card under RLS",
    ownerRows.some((row) => row.visible === 1), ownerRows);

  const strangerVisible = await sql(`
begin;
${seedUsers}
insert into public.meal_buddy_cards (owner_user_id, card_type, intention_type, dining_date, meal_period, expires_at)
values ('${ACTOR_A}'::uuid, 'general', 'chat_first', date '2026-08-20', 'dinner', now() + interval '6 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"${ACTOR_B}","role":"authenticated"}';
select count(*)::int as visible from public.meal_buddy_cards;
rollback;`);
  const strangerRows = Array.isArray(strangerVisible) ? strangerVisible : [];
  check("27 a different authenticated user sees zero cards, not a hidden row",
    strangerRows.some((row) => row.visible === 0), strangerRows);

  check("28 an authenticated client cannot insert a card directly",
    !(await attempt(`${seedUsers}
set local role authenticated;
set local request.jwt.claims = '{"sub":"${ACTOR_A}","role":"authenticated"}';
${card()}`)).accepted);

  check("29 anon cannot read the card table at all",
    !(await attempt(`set local role anon;
select count(*) from public.meal_buddy_cards;`)).accepted);

  // --- 5. card references over real Development identifiers -------------------------------------------
  const realIds = await sql(`select gen_random_uuid()::text as card_id, gen_random_uuid()::text as actor_id;`);
  const realCardId = realIds[0].card_id;
  const realActorId = realIds[0].actor_id;
  const key = crypto.randomBytes(32).toString("base64");
  const cipher = ref.createMealBuddyCardRefCipher(ref.decodeMealBuddyCardRefKey(key));
  const issued = new Date();
  const sourceToken = await cipher.seal(realActorId, "source", realCardId, issued);
  const candidateToken = await cipher.seal(realActorId, "candidate", realCardId, issued);
  const openedSource = await cipher.open(realActorId, "source", sourceToken, issued);

  const denied = async (promise) => { try { await promise; return false; } catch { return true; } };
  check("30 a reference round-trips over a real Development uuid", openedSource.cardId === realCardId);
  check("31 the reference hides the real card uuid", !sourceToken.includes(realCardId));
  check("32 the reference hides the real actor uuid", !sourceToken.includes(realActorId));
  check("33 a source reference does not verify as a candidate reference",
    await denied(cipher.open(realActorId, "candidate", sourceToken, issued)));
  check("34 a candidate reference does not verify as a source reference",
    await denied(cipher.open(realActorId, "source", candidateToken, issued)));
  check("35 a foreign actor cannot open a real reference",
    await denied(cipher.open(realIds[0].actor_id.replace(/^./, "0"), "source", sourceToken, issued)));

  // --- 6. residue -----------------------------------------------------------------------------------
  const residue = await sql(`select count(*)::int as remaining from public.meal_buddy_cards;`);
  check("36 the acceptance left no card row behind", residue[0].remaining === 0, residue);
  const userResidue = await sql(`select count(*)::int as remaining from auth.users where id in ('${ACTOR_A}'::uuid, '${ACTOR_B}'::uuid);`);
  check("37 the acceptance left no fixture user behind", userResidue[0].remaining === 0, userResidue);
  const restaurantResidue = await sql(`select count(*)::int as remaining from public.restaurants where id = '${RESTAURANT}';`);
  check("38 the acceptance left no fixture restaurant behind", restaurantResidue[0].remaining === 0, restaurantResidue);

  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length === 0 ? "passed" : "failed",
    projectRef: DEV_REF,
    migrationApplied: !alreadyApplied,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    edgeFunctionDeployed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message }, null, 2));
  process.exit(1);
}
