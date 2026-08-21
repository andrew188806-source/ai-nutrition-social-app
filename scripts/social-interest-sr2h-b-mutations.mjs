#!/usr/bin/env node
// SR-2H-B meaningful local mutation suite. Mutants are in-memory strings/rules; repository bytes
// are never rewritten.
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260822010000_social_interest_settings_atomic_replace.sql";
const canonicalSql = fs.readFileSync(migrationPath, "utf8").replace(/(^|\n)\s*--[^\n]*/g, "$1");

function violations(sql) {
  const failed = [];
  const require = (name, condition) => { if (!condition) failed.push(name); };
  require("actor is auth.uid only", /v_user_id uuid := auth\.uid\(\)/.test(sql) && !/p_(user|actor|owner)_id/i.test(sql));
  require("null elements are rejected", /array_position\(v_general_keys, null::text\)/.test(sql) && /array_position\(v_food_keys, null::text\)/.test(sql));
  require("both inputs dedupe", (sql.match(/array_agg\(distinct/g) ?? []).length === 2);
  require("general limit is eight", /array_length\(v_general_keys, 1\), 0\) > 8(?!\d)/.test(sql));
  require("food limit is five", /array_length\(v_food_keys, 1\), 0\) > 5(?!\d)/.test(sql));
  require("limit breach rejects", /SOCIAL_INTEREST_LIMIT_EXCEEDED/.test(sql));
  require("namespace is server-owned", /'general'::text as namespace/.test(sql) && /'food'::text as namespace/.test(sql));
  require("unknown inactive nonselectable wrong namespace reject", /c\.tag_key = candidate\.tag_key/.test(sql) && /c\.namespace = candidate\.namespace/.test(sql) && /c\.active/.test(sql) && /c\.selectable/.test(sql));
  const generalLock = sql.indexOf("v_user_id::text || ':social_interest:general'");
  const foodLock = sql.indexOf("v_user_id::text || ':social_interest:food'");
  require("exact predecessor locks are both present", generalLock >= 0 && foodLock >= 0 && (sql.match(/pg_advisory_xact_lock/g) ?? []).length === 2);
  require("global lock order is general then food", generalLock >= 0 && generalLock < foodLock);
  require("validation precedes every write", sql.indexOf("SOCIAL_INTEREST_TAG_NOT_SELECTABLE") < sql.indexOf("delete from public.social_profile_interest_selection"));
  require("both namespaces replace together", /namespace in \('general', 'food'\)/.test(sql) && /select v_user_id, k, 'general'[\s\S]*union all[\s\S]*select v_user_id, k, 'food'/.test(sql));
  require("response carries both exact sets", /'general_tag_keys'/.test(sql) && /'food_tag_keys'/.test(sql));
  require("anonymous execution is closed", /revoke all on function public\.replace_authenticated_social_interest_settings\(text\[\], text\[\]\) from anon;/.test(sql));
  require("authenticated execution is narrow", /grant execute on function public\.replace_authenticated_social_interest_settings\(text\[\], text\[\]\) to authenticated;/.test(sql));
  require("selection direct writes stay closed", !/grant (insert|update|delete).*social_profile_interest_selection.*authenticated/i.test(sql));
  require("no Meal Buddy snapshot or context mutation", !/meal_buddy_cards|food_context_tag_key|snapshot/i.test(sql));
  return failed;
}

const mutants = [
  ["caller user id replaces auth identity", (sql) => sql.replace("v_user_id uuid := auth.uid();", "v_user_id uuid := p_user_id;")],
  ["general null element validation is removed", (sql) => sql.replace("pg_catalog.array_position(v_general_keys, null::text)", "false")],
  ["one deduplication is removed", (sql) => sql.replace("array_agg(distinct", "array_agg(")],
  ["general maximum is raised", (sql) => sql.replace("> 8", "> 80")],
  ["food maximum is raised", (sql) => sql.replace("> 5", "> 50")],
  ["catalog active rule is removed", (sql) => sql.replace("      and c.active\n", "")],
  ["catalog selectable rule is removed", (sql) => sql.replace("      and c.selectable\n", "")],
  ["namespace match is removed", (sql) => sql.replace("      and c.namespace = candidate.namespace\n", "")],
  ["general predecessor lock is renamed", (sql) => sql.replace(":social_interest:general", ":social_settings:general")],
  ["food predecessor lock is renamed", (sql) => sql.replace(":social_interest:food", ":social_settings:food")],
  ["lock order is reversed", (sql) => {
    const general = "v_user_id::text || ':social_interest:general'";
    const food = "v_user_id::text || ':social_interest:food'";
    return sql.replace(general, "LOCK_SWAP").replace(food, general).replace("LOCK_SWAP", food);
  }],
  ["write begins before validation", (sql) => sql.replace("begin\n  if v_user_id", "begin\n  delete from public.social_profile_interest_selection where false;\n  if v_user_id")],
  ["food insert is removed", (sql) => sql.replace(/union all\n\s+select v_user_id, k, 'food'[\s\S]*?from pg_catalog\.unnest\(v_food_keys\) as k;/, ";")],
  ["anonymous receives execute", (sql) => sql.replace("revoke all on function public.replace_authenticated_social_interest_settings(text[], text[]) from anon;", "grant execute on function public.replace_authenticated_social_interest_settings(text[], text[]) to anon;")],
  ["authenticated execute is removed", (sql) => sql.replace("grant execute on function public.replace_authenticated_social_interest_settings(text[], text[]) to authenticated;", "")],
  ["Meal Buddy snapshot is introduced", (sql) => sql.replace("commit;", "alter table public.meal_buddy_cards add column interest_snapshot text[];\ncommit;")]
];

const results = [];
const baseline = violations(canonicalSql);
results.push({ name: "canonical SR-2H-B authority passes", applied: true, killed: baseline.length === 0, violations: baseline });
if (baseline.length) console.log(`BASELINE BROKEN ${baseline.join(" | ")}`);
for (const [name, mutate] of mutants) {
  const mutated = mutate(canonicalSql);
  const applied = mutated !== canonicalSql;
  const failed = applied ? violations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}
const survivors = results.filter((result) => !result.killed);
console.log(JSON.stringify({ suite: "social-interest-sr2h-b-mutations", total: results.length, killed: results.length - survivors.length, survived: survivors.length, survivors, repositoryBytesModified: false, networkUsed: false, databaseUsed: false }, null, 2));
if (survivors.length) process.exitCode = 1;
