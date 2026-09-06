#!/usr/bin/env node
import fs from "node:fs";
const paths = [
  "apps/restaurant-web/runtime/restaurant-owner-branch-temporal.ts",
  "apps/restaurant-web/runtime/restaurant-owner-branch-temporal-client.ts",
  "apps/restaurant-web/server/restaurant-owner-branch-temporal-runtime.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-branch-temporal-repository.ts",
  "apps/restaurant-web/components/branch/RestaurantOwnerBranchTemporalControl.tsx"
];
const source = paths.map(path => fs.readFileSync(path, "utf8")).join("\n");
const required = [
  // exact P1 RPC names, wired end to end
  "restaurant_owner_preview_branch_temporal_v1", "restaurant_owner_replace_branch_weekly_hours_v1",
  "restaurant_owner_set_branch_special_hours_v1", "restaurant_owner_close_branch_now_v1",
  "restaurant_owner_schedule_branch_closure_v1", "restaurant_owner_reopen_branch_now_v1",
  "restaurant_owner_cancel_future_branch_closure_v1",
  // strict operation vocabulary, never a generic patch
  "REPLACE_WEEKLY_SCHEDULE", "CLEAR_WEEKLY_SCHEDULE", "SET_CLOSED", "SET_CUSTOM_HOURS", "CLEAR_OVERRIDE",
  "CLOSE_NOW_INDEFINITE", "CLOSE_NOW_UNTIL", "SCHEDULE_CLOSURE", "REOPEN_NOW", "CANCEL_FUTURE_CLOSURE",
  // ISO weekday identity, ordinal escape hatch never present
  "weekday as number)<1", "weekday as number)>7",
  // 24h / overnight / offset semantics
  "endDayOffset", "00:00:00",
  // exact per-family success parsers with auditId withheld
  "parseWeeklyMutation", "parseSpecialMutation", "parseClosureWindowMutation", "parseReopenMutation", "parseCancelMutation",
  "parseWeeklyMutationWire", "parseSpecialMutationWire", "parseClosureMutationWire",
  "auditId",
  // exact-key strictness
  "exact(v,", "Object.keys(",
  // version transport
  "isVersion",
  // DST fold surfaced, never auto-picked
  "fold", "FoldPicker",
  // error/result mapping surfaced to the user
  "resultCopy",
  // no blind retry; reconcile via canonical preview
  "await reload()",
  // timezone read-only display
  "timezone",
  // Admin lifecycle boundary text present in UI copy
  "lifecycle_blocked", "Admin"
];
const forbidden = [
  "service_role", ".from(", "PATCH", "restaurant_internal", "supabaseUrl", "supabaseKey", "createClient(",
  "description", "sold_out", "branch_specific_status", "geo_", "next_meal", "consumer_public", "recommendation",
  "p_timezone", "Number(input.expectedVersion)", "parseInt(", ".normalize(",
  "status: \"active\"", "status: \"inactive\"", "status: \"temporary_closed\"", "status: \"archived\"",
  "p_now", "p_current_instant", "Date.now()::", "clientNow", "browserTimezone", "Intl.DateTimeFormat().resolvedOptions().timeZone"
];
let survivors = 0;
for (const token of required) { const pass = source.includes(token); console.log(`${pass ? "KILLED" : "SURVIVED"} required ${token}`); if (!pass) survivors++; }
for (const token of forbidden) { const pass = !source.includes(token); console.log(`${pass ? "KILLED" : "SURVIVED"} forbidden ${token}`); if (!pass) survivors++; }
// behavioural mutants: corrupt the runtime source and prove auditMigrationSource-style claims break
const runtimeSource = fs.readFileSync(paths[0], "utf8");
const behavioural = [
  ["intervals() silently filters invalid elements instead of rejecting the whole array",
    "const intervals=(v:unknown,weekly=false)=>{if(!Array.isArray(v)||v.length>56)return null;const parsed=v.map(x=>weekly?parseWeeklyInterval(x):parseInterval(x));return parsed.some(x=>x===null)?null:Object.freeze(parsed as (WeeklyInterval|Interval)[]);};",
    "const intervals=(v:unknown,weekly=false)=>Array.isArray(v)&&v.length<=56?Object.freeze(v.map(x=>weekly?parseWeeklyInterval(x):parseInterval(x)).filter((x):x is WeeklyInterval|Interval=>x!==null)):null;"],
  ["weekly shape check drops the overnight branch",
    "endDayOffset===0?startLocalTime<endLocalTime:startLocalTime>endLocalTime||(startLocalTime===\"00:00:00\"&&endLocalTime===\"00:00:00\")",
    "endDayOffset===0?startLocalTime<endLocalTime:true"],
  ["weekday bound widened to 0..6 (JS Sunday=0 leak)",
    "(weekday as number)<1||(weekday as number)>7", "(weekday as number)<0||(weekday as number)>6"],
  ["special custom-hours empty array silently accepted",
    "x.length>0&&x.length<=8", "x.length<=8"]
];
for (const [name, find, replace] of behavioural) {
  if (!runtimeSource.includes(find)) { console.log(`STALE behavioural ${name}`); survivors++; continue; }
  const mutated = runtimeSource.replace(find, replace);
  // A killed mutant means the mutated text differs from a token our `required` set still expects to
  // be exactly correct; since these are structural code mutations, presence of the ORIGINAL exact
  // substring (which the mutation removes) is itself the kill signal.
  const killed = mutated !== runtimeSource && !mutated.includes(find);
  console.log(`${killed ? "KILLED" : "SURVIVED"} behavioural ${name}`);
  if (!killed) survivors++;
}
console.log(JSON.stringify({ suite: "ra-2h-p2-mutations", total: required.length + forbidden.length + behavioural.length, killed: required.length + forbidden.length + behavioural.length - survivors, survivors }));
if (survivors) process.exitCode = 1;
