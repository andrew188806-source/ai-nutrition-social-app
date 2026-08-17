#!/usr/bin/env node
// SR-2G-B-R1 targeted Development acceptance: privilege removal plus runtime invariance.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_B_R1_DEVELOPMENT_ACCEPTANCE=1.
//
// This deliberately does NOT rerun the full SR-2G-B live matrix. It proves the one membership row is
// gone, that nothing else in the privilege topology moved, and that create/list/cancel/quota still
// behave exactly as frozen — which is what a hygiene repair must establish.
import fs from "node:fs";
import path from "node:path";

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_B_R1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-b-r1-development-acceptance";
const MIGRATION = "supabase/migrations/20260817040000_meal_buddy_card_write_authority_membership_hygiene.sql";
const TARGET_ROLE = "meal_buddy_card_write_authority";

// Frozen SR-2G-B function bodies, pinned by digest at the pre-repair preflight. A hygiene repair
// must not move a single byte of runtime behaviour.
const FROZEN_BODY_MD5 = Object.freeze({
  cancel_meal_buddy_card: "0e8b6fc023f2fbc3b04d3e8d761335f4",
  create_meal_buddy_card: "a797343012bf1cc79458a9be4fa7a566",
  list_owned_meal_buddy_cards: "1029a5c4f37dbb1d606b8d959d2a8402",
  meal_buddy_card_expires_at: "b8b23363efcedbb56c23e6aa8ee10b07"
});

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
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
async function apiKeys() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const keys = await res.json();
  const pick = (name) => keys.find((entry) => entry.name === name)?.api_key;
  return { anon: pick("anon"), serviceRole: pick("service_role") };
}

const TOPOLOGY = `
  select r.rolname as role, g.rolname as grantor, am.admin_option, am.inherit_option, am.set_option
  from pg_auth_members am
  join pg_roles r on r.oid=am.roleid join pg_roles m on m.oid=am.member join pg_roles g on g.oid=am.grantor
  where m.rolname='postgres'
    and r.rolname in ('meal_buddy_card_write_authority','meal_buddy_candidate_pool_authority',
                      'social_authority','social_pair_read_authority','social_profile_projection_authority','social_runtime_executor')
  order by r.rolname, g.rolname`;

// Hex-only marker; a non-hex character would make every fixture insert fail as a malformed uuid.
const M = "5b1f0d01";
const ACTOR = `${M}-0000-4000-8000-00000000000a`;
const BASE = `https://${DEV_REF}.supabase.co/functions/v1`;

let fixturesCreated = false;
const { anon, serviceRole } = await apiKeys();

try {
  const before = await sql(TOPOLOGY);

  // --- apply the repair ------------------------------------------------------------------------
  const debtPresent = before.some((r) => r.role === TARGET_ROLE && r.grantor === "postgres");
  if (debtPresent) {
    await sql(fs.readFileSync(path.join(process.cwd(), MIGRATION), "utf8"));
    console.log("     (repair applied)");
  } else {
    console.log("     (repair already applied)");
  }
  const after = await sql(TOPOLOGY);

  // --- 1/2. exactly the target row is gone --------------------------------------------------------
  check("01 the postgres-granted write-authority membership row is gone",
    !after.some((r) => r.role === TARGET_ROLE && r.grantor === "postgres"),
    after.filter((r) => r.role === TARGET_ROLE));
  check("02 the legitimate supabase_admin row survives with ADMIN OPTION intact",
    after.some((r) => r.role === TARGET_ROLE && r.grantor === "supabase_admin"
      && r.admin_option === true && r.inherit_option === false && r.set_option === false));
  const key = (r) => `${r.role}|${r.grantor}`;
  const removed = before.map(key).filter((k) => !after.map(key).includes(k));
  const added = after.map(key).filter((k) => !before.map(key).includes(k));
  const mutated = after.filter((a) => {
    const b = before.find((x) => key(x) === key(a));
    return b && JSON.stringify(b) !== JSON.stringify(a);
  });
  check("03 exactly one membership row was removed and none added or mutated",
    (!debtPresent || (removed.length === 1 && removed[0] === `${TARGET_ROLE}|postgres`)) && added.length === 0 && mutated.length === 0,
    { removed, added, mutated });
  check("04 postgres can no longer SET ROLE or inherit into the write authority", (await sql(`
    select pg_has_role('postgres','${TARGET_ROLE}','SET') as can_set,
           pg_has_role('postgres','${TARGET_ROLE}','USAGE') as inherits;`))
    .every((row) => row.can_set === false && row.inherits === false));
  check("05 no other Social or Meal Buddy membership changed",
    JSON.stringify(before.filter((r) => key(r) !== `${TARGET_ROLE}|postgres`)) === JSON.stringify(after));

  // --- 3. role attributes ---------------------------------------------------------------------------
  const attrs = await sql(`select rolcanlogin, rolinherit, rolbypassrls, rolsuper from pg_roles where rolname='${TARGET_ROLE}';`);
  check("06 the write authority remains NOLOGIN, NOINHERIT, NOBYPASSRLS and non-superuser",
    attrs[0].rolcanlogin === false && attrs[0].rolinherit === false && attrs[0].rolbypassrls === false && attrs[0].rolsuper === false, attrs[0]);

  // --- 4/5. function invariance and executor authority ------------------------------------------------
  const fns = await sql(`
    select p.proname, p.proowner::regrole::text as owner, p.prosecdef, md5(p.prosrc) as body_md5,
           coalesce(p.proacl::text,'') as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='social_internal' and p.proname in
      ('create_meal_buddy_card','list_owned_meal_buddy_cards','cancel_meal_buddy_card','meal_buddy_card_expires_at')
    order by p.proname;`);
  check("07 all four function bodies are byte-identical to the pre-repair digests",
    fns.every((f) => f.body_md5 === FROZEN_BODY_MD5[f.proname]),
    fns.map((f) => ({ [f.proname]: f.body_md5 })));
  check("08 all four functions are still owned by the write authority",
    fns.every((f) => f.owner === TARGET_ROLE));
  check("09 the three write functions are still SECURITY DEFINER",
    fns.filter((f) => f.proname !== "meal_buddy_card_expires_at").every((f) => f.prosecdef === true));
  check("10 the runtime executor retains EXECUTE on all three write functions", (await sql(`
    select has_function_privilege('social_runtime_executor','social_internal.create_meal_buddy_card(uuid,text,text,text,text,date,text,time,integer,integer)','EXECUTE') as c,
           has_function_privilege('social_runtime_executor','social_internal.list_owned_meal_buddy_cards(uuid)','EXECUTE') as l,
           has_function_privilege('social_runtime_executor','social_internal.cancel_meal_buddy_card(uuid,uuid)','EXECUTE') as x;`))
    .every((r) => r.c && r.l && r.x));
  check("11 no client role gained EXECUTE on the write functions", (await sql(`
    select has_function_privilege('authenticated','social_internal.create_meal_buddy_card(uuid,text,text,text,text,date,text,time,integer,integer)','EXECUTE') as a,
           has_function_privilege('service_role','social_internal.create_meal_buddy_card(uuid,text,text,text,text,date,text,time,integer,integer)','EXECUTE') as s;`))
    .every((r) => r.a === false && r.s === false));

  // --- 6/7/8. direct-write denial ---------------------------------------------------------------------------
  const denied = async (statement) => {
    try {
      await sql(`begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${ACTOR}","role":"authenticated"}';
${statement}
rollback;`);
      return false;
    } catch { return true; }
  };
  check("12 an authenticated client still cannot INSERT directly", await denied(
    `insert into public.meal_buddy_cards (owner_user_id, card_type, intention_type, dining_date, meal_period, expires_at)
     values ('${ACTOR}'::uuid,'general','chat_first', current_date + 1, 'dinner', now() + interval '6 hours');`));
  check("13 an authenticated client still cannot UPDATE directly", await denied(
    `update public.meal_buddy_cards set cancelled_at = now();`));
  check("14 an authenticated client still cannot DELETE directly", await denied(
    `delete from public.meal_buddy_cards;`));

  // --- 9-13. live runtime invariance through the deployed Edge functions --------------------------------------
  const password = `Sr2gbr1-${crypto.randomUUID()}`;
  const email = `sr2gbr1-${M}@example.com`;
  const created = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: ACTOR, email, password, email_confirm: true })
  });
  if (!created.ok) throw new Error(`actor create failed: ${created.status}`);
  fixturesCreated = true;

  const tokenRes = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const jwt = (await tokenRes.json()).access_token;

  const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, mo, d] = taipeiToday.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);

  const callEdge = async (name, body, attempts = 4) => {
    let last = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const res = await fetch(`${BASE}/${name}`, {
        method: "POST",
        headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      let payload = null;
      try { payload = JSON.parse(await res.text()); } catch { payload = null; }
      last = { status: res.status, payload };
      // A 502/504 is gateway noise, never a product answer; retry rather than let it masquerade.
      if (last.status !== 502 && last.status !== 504) return last;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
    return last;
  };
  const createBody = { cardType: "general", intentionType: "chat_first", restaurantId: null, area: null, diningDate: tomorrow, mealPeriod: "dinner", preferredTime: null };

  const first = await callEdge("meal-buddy-card-create", createBody);
  check("15 create still succeeds within quota after the repair", first.status === 200, first.payload);
  check("16 the create response still carries a source reference and no raw identifier",
    typeof first.payload?.card?.sourceCardRef === "string" && first.payload.card.sourceCardRef.startsWith("mbc1.")
    && !("id" in (first.payload?.card ?? {})));
  const second = await callEdge("meal-buddy-card-create", createBody);
  check("17 the frozen Free quota still refuses the second active general card",
    second.status === 409 && second.payload?.error?.code === "card_quota_exceeded", second.payload);

  const listed = await callEdge("meal-buddy-card-list", {});
  check("18 list still works and returns the owned active card",
    listed.status === 200 && Array.isArray(listed.payload?.cards) && listed.payload.cards.length === 1);
  check("19 quota metadata still reports Free limits without naming a tier",
    listed.payload?.quota?.general?.limit === 1
    && !/premium|free|plan_code|entitlement|billing/i.test(JSON.stringify(listed.payload)));

  const rawIds = await sql(`select id::text from public.meal_buddy_cards where owner_user_id='${ACTOR}'::uuid;`);
  check("20 no raw card uuid or owner uuid leaks into any response",
    !rawIds.some((row) => JSON.stringify([first.payload, listed.payload]).includes(row.id))
    && !JSON.stringify([first.payload, listed.payload]).includes(ACTOR));

  const cancelled = await callEdge("meal-buddy-card-cancel", { sourceCardRef: listed.payload.cards[0].sourceCardRef });
  check("21 cancel still works", cancelled.status === 200 && cancelled.payload?.cancelled === true);
  const afterCancel = await callEdge("meal-buddy-card-list", {});
  check("22 the cancelled card still frees quota", afterCancel.payload?.quota?.general?.used === 0);

  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length === 0 ? "passed" : "failed",
    projectRef: DEV_REF,
    repairApplied: debtPresent,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    productionTouched: false
  }, null, 2));
} finally {
  if (fixturesCreated) {
    await sql(`
begin;
delete from public.meal_buddy_cards where owner_user_id::text like '${M}-%';
delete from auth.users where id::text like '${M}-%';
commit;`).catch(() => undefined);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
