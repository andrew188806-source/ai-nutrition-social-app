#!/usr/bin/env node
// RA-2H-P2 smoke: transpiles and EXECUTES the real runtime module against real P1-shaped fixture
// data, so a genuine DB success (or a genuine P1 refusal) is proven never to turn into a parser
// mismatch. This is the "real-success regression fixture" the round explicitly requires.
import fs from "node:fs";
import ts from "typescript";

const runtimePath = "apps/restaurant-web/runtime/restaurant-owner-branch-temporal.ts";
const clientPath = "apps/restaurant-web/runtime/restaurant-owner-branch-temporal-client.ts";
const serverPath = "apps/restaurant-web/server/restaurant-owner-branch-temporal-runtime.ts";
const controlPath = "apps/restaurant-web/components/branch/RestaurantOwnerBranchTemporalControl.tsx";
const previewRoutePath = "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/route.ts";
const weeklyRoutePath = "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/weekly/route.ts";
const specialRoutePath = "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/special/route.ts";
const closureRoutePath = "apps/restaurant-web/app/api/restaurant/branches/[branchId]/temporal/closure/route.ts";
const source = fs.readFileSync(runtimePath, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

// ---- real P1-shaped fixtures ------------------------------------------------------------------
const previewReady = {
  ok: true, state: "ready", branchId: "dev-branch-nanjing", timezone: "Asia/Taipei",
  weeklyHoursConfigured: true,
  weeklyHours: [
    { weekday: 1, startLocalTime: "09:00:00", endLocalTime: "14:00:00", endDayOffset: 0 },
    { weekday: 5, startLocalTime: "18:00:00", endLocalTime: "02:00:00", endDayOffset: 1 },
    { weekday: 7, startLocalTime: "00:00:00", endLocalTime: "00:00:00", endDayOffset: 1 }
  ],
  weeklyHoursVersion: "2",
  specialOverrides: [{ localDate: "2099-12-25", mode: "closed", intervals: [] }],
  specialHoursVersion: "1",
  operationalClosures: [{ closureId: "11111111-1111-4111-8111-111111111111", startsAt: "2026-09-07T10:00:00Z", endsAt: null }],
  operationalClosureVersion: "3",
  currentState: "CLOSED", currentReason: "OPERATIONALLY_CLOSED"
};
const weeklyApplied = { ok: true, state: "applied", branchId: "dev-branch-nanjing", weeklyHoursConfigured: true, weeklyHours: previewReady.weeklyHours, weeklyHoursVersion: "3", auditId: "00000000-0000-0000-0000-000000000000" };
const specialApplied = { ok: true, state: "applied", branchId: "dev-branch-nanjing", localDate: "2099-12-25", mode: "custom", intervals: [{ startLocalTime: "11:00:00", endLocalTime: "15:00:00", endDayOffset: 0 }], specialHoursVersion: "2", auditId: "00000000-0000-0000-0000-000000000001" };
const closeApplied = { ok: true, state: "applied", branchId: "dev-branch-nanjing", closureId: "11111111-1111-4111-8111-111111111111", startsAt: "2026-09-07T10:00:00Z", endsAt: "2026-09-07T11:00:00Z", operationalClosureVersion: "1", auditId: "00000000-0000-0000-0000-000000000002" };
const reopenApplied = { ok: true, state: "applied", branchId: "dev-branch-nanjing", closureId: "11111111-1111-4111-8111-111111111111", endsAt: "2026-09-07T10:30:00Z", operationalClosureVersion: "2", auditId: "00000000-0000-0000-0000-000000000003" };
const cancelApplied = { ok: true, state: "applied", branchId: "dev-branch-nanjing", closureId: "22222222-2222-4222-8222-222222222222", cancelledAt: "2026-09-07T10:45:00Z", operationalClosureVersion: "3", auditId: "00000000-0000-0000-0000-000000000004" };

const tests = [
  // --- preview -------------------------------------------------------------------------------
  ["exact P1 preview DTO is accepted", mod.parsePreview(previewReady)?.state === "ready"],
  ["preview preserves OPEN/CLOSED/UNKNOWN verbatim, never coerced", mod.parsePreview(previewReady)?.currentState === "CLOSED" && mod.parsePreview(previewReady)?.currentReason === "OPERATIONALLY_CLOSED"],
  ["preview rejects an unknown extra key", mod.parsePreview({ ...previewReady, extra: 1 }) === null],
  ["preview rejects a missing ok field (proves the client<->server wire shape is now symmetric)", mod.parsePreview({ ...previewReady, ok: undefined }) === null],
  ["preview versions remain decimal strings, not numbers", typeof mod.parsePreview(previewReady)?.weeklyHoursVersion === "string"],
  ["preview weekday identity is ISO 1..7 (Sunday=7 accepted, not JS 0)", mod.parsePreview(previewReady)?.weeklyHours.some(w => w.weekday === 7)],
  ["preview rejects weekday 0 (no JS Sunday=0 leak)", mod.parsePreview({ ...previewReady, weeklyHours: [{ weekday: 0, startLocalTime: "09:00:00", endLocalTime: "10:00:00", endDayOffset: 0 }] }) === null],
  ["preview UNKNOWN (unconfigured) is preserved distinctly, not coerced to closed", mod.parsePreview({ ...previewReady, weeklyHoursConfigured: false, weeklyHours: [] })?.weeklyHoursConfigured === false],
  ["preview accepts the canonical 24h encoding (00:00->00:00, offset 1)", mod.parsePreview(previewReady)?.weeklyHours.some(w => w.startLocalTime === "00:00:00" && w.endLocalTime === "00:00:00" && w.endDayOffset === 1)],
  ["preview overnight interval is preserved with endDayOffset=1, not split", mod.parsePreview(previewReady)?.weeklyHours.some(w => w.startLocalTime === "18:00:00" && w.endDayOffset === 1)],
  ["preview error vocabulary maps a bounded errorCode", mod.parsePreview({ ok: false, errorCode: "lifecycle_blocked" })?.state === "lifecycle_blocked"],
  ["preview rejects a raw non-bounded errorCode as internal_failure", mod.parsePreview({ ok: false, errorCode: "some_sql_error" }) === null],

  // --- weekly mutation (raw RPC parser, requires auditId) -------------------------------------
  ["exact P1 weekly applied DTO is accepted (raw)", mod.parseWeeklyMutation(weeklyApplied)?.state === "applied"],
  ["weekly raw parser requires auditId present", mod.parseWeeklyMutation({ ...weeklyApplied, auditId: undefined }) === null],
  ["weekly raw parser's OUTPUT withholds auditId", !Object.hasOwn(mod.parseWeeklyMutation(weeklyApplied) ?? {}, "auditId")],
  ["weekly raw parser rejects an unknown extra key", mod.parseWeeklyMutation({ ...weeklyApplied, unexpected: true }) === null],
  ["weekly wire parser accepts the already-stripped shape (no auditId)", mod.parseWeeklyMutationWire({ ok: true, state: "applied", branchId: weeklyApplied.branchId, weeklyHoursConfigured: weeklyApplied.weeklyHoursConfigured, weeklyHours: weeklyApplied.weeklyHours, weeklyHoursVersion: weeklyApplied.weeklyHoursVersion })?.state === "applied"],
  ["weekly wire parser rejects a leaked auditId (defense-in-depth)", mod.parseWeeklyMutationWire(weeklyApplied) === null],
  ["weekly stale_state maps through the raw parser", mod.parseWeeklyMutation({ ok: false, errorCode: "stale_state" })?.state === "stale_state"],
  ["weekly no_change maps through the raw parser", mod.parseWeeklyMutation({ ok: false, errorCode: "no_change" })?.state === "no_change"],

  // --- special mutation ------------------------------------------------------------------------
  ["exact P1 special applied DTO is accepted (raw)", mod.parseSpecialMutation(specialApplied)?.state === "applied"],
  ["special raw parser's OUTPUT withholds auditId", !Object.hasOwn(mod.parseSpecialMutation(specialApplied) ?? {}, "auditId")],
  ["special wire parser accepts the stripped shape", mod.parseSpecialMutationWire({ ok: true, state: "applied", branchId: specialApplied.branchId, localDate: specialApplied.localDate, mode: specialApplied.mode, intervals: specialApplied.intervals, specialHoursVersion: specialApplied.specialHoursVersion })?.state === "applied"],
  ["special mode=null (CLEAR_OVERRIDE result) is accepted, not coerced", mod.parseSpecialMutation({ ...specialApplied, mode: null, intervals: [] })?.mode === null],
  ["special date identity uses branch-local date string, no UTC shift performed by the parser", mod.parseSpecialMutation(specialApplied)?.localDate === "2099-12-25"],

  // --- closure mutations: three distinct shapes -------------------------------------------------
  ["exact P1 close/schedule applied DTO is accepted (raw)", mod.parseClosureWindowMutation(closeApplied)?.state === "applied"],
  ["close/schedule raw parser's OUTPUT withholds auditId", !Object.hasOwn(mod.parseClosureWindowMutation(closeApplied) ?? {}, "auditId")],
  ["exact P1 reopen applied DTO is accepted (raw, distinct shape: no startsAt)", mod.parseReopenMutation(reopenApplied)?.state === "applied"],
  ["reopen raw parser rejects the close/schedule shape (startsAt present)", mod.parseReopenMutation(closeApplied) === null],
  ["exact P1 cancel applied DTO is accepted (raw, distinct shape: cancelledAt)", mod.parseCancelMutation(cancelApplied)?.state === "applied"],
  ["cancel raw parser rejects the reopen shape (endsAt instead of cancelledAt)", mod.parseCancelMutation(reopenApplied) === null],
  ["closure wire parser dispatches all three shapes correctly", mod.parseClosureMutationWire({ ok: true, state: "applied", branchId: closeApplied.branchId, closureId: closeApplied.closureId, startsAt: closeApplied.startsAt, endsAt: closeApplied.endsAt, operationalClosureVersion: closeApplied.operationalClosureVersion })?.state === "applied" && mod.parseClosureMutationWire({ ok: true, state: "applied", branchId: reopenApplied.branchId, closureId: reopenApplied.closureId, endsAt: reopenApplied.endsAt, operationalClosureVersion: reopenApplied.operationalClosureVersion })?.state === "applied" && mod.parseClosureMutationWire({ ok: true, state: "applied", branchId: cancelApplied.branchId, closureId: cancelApplied.closureId, cancelledAt: cancelApplied.cancelledAt, operationalClosureVersion: cancelApplied.operationalClosureVersion })?.state === "applied"],
  ["closure lifecycle_blocked maps through (never internal_failure)", mod.parseClosureWindowMutation({ ok: false, errorCode: "lifecycle_blocked" })?.state === "lifecycle_blocked"],
  ["closure closure_conflict maps through", mod.parseClosureWindowMutation({ ok: false, errorCode: "closure_conflict" })?.state === "closure_conflict"],
  ["closure invalid_local_time maps through (DST gap)", mod.parseClosureWindowMutation({ ok: false, errorCode: "invalid_local_time" })?.state === "invalid_local_time"],

  // --- request-side strict parsers ---------------------------------------------------------------
  ["weekly REPLACE input requires exact keys", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [], expectedVersion: "0" })?.operation === "REPLACE_WEEKLY_SCHEDULE"],
  ["weekly REPLACE with empty intervals is a VALID distinct request (closed-all-week), not rejected", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [], expectedVersion: "0" }) !== null],
  ["weekly CLEAR has its own exact shape (no intervals key allowed)", mod.parseWeeklyInput({ operation: "CLEAR_WEEKLY_SCHEDULE", intervals: [], expectedVersion: "0" }) === null],
  ["weekly input rejects a numeric expectedVersion (no Number() trust)", mod.parseWeeklyInput({ operation: "CLEAR_WEEKLY_SCHEDULE", expectedVersion: 0 }) === null],
  ["weekly input rejects weekday 0", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 0, startLocalTime: "09:00:00", endLocalTime: "10:00:00", endDayOffset: 0 }], expectedVersion: "0" }) === null],
  ["weekly input rejects weekday 8", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 8, startLocalTime: "09:00:00", endLocalTime: "10:00:00", endDayOffset: 0 }], expectedVersion: "0" }) === null],
  ["weekly input rejects zero-length interval (start==end, offset 0)", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 1, startLocalTime: "09:00:00", endLocalTime: "09:00:00", endDayOffset: 0 }], expectedVersion: "0" }) === null],
  ["weekly input accepts the canonical 24h pair", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 4, startLocalTime: "00:00:00", endLocalTime: "00:00:00", endDayOffset: 1 }], expectedVersion: "0" }) !== null],
  ["weekly input rejects a non-canonical equal-time pair mistaken for 24h", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 4, startLocalTime: "05:00:00", endLocalTime: "05:00:00", endDayOffset: 1 }], expectedVersion: "0" }) === null],
  ["weekly input rejects an offset-1 interval that ignores the offset (start<end, exceeds 24h)", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 4, startLocalTime: "05:00:00", endLocalTime: "23:00:00", endDayOffset: 1 }], expectedVersion: "0" }) === null],
  ["weekly input accepts a genuine overnight interval (start>end, offset 1)", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: [{ weekday: 5, startLocalTime: "18:00:00", endLocalTime: "02:00:00", endDayOffset: 1 }], expectedVersion: "0" }) !== null],
  ["weekly input caps at 56 intervals", mod.parseWeeklyInput({ operation: "REPLACE_WEEKLY_SCHEDULE", intervals: Array.from({ length: 57 }, (_, i) => ({ weekday: (i % 7) + 1, startLocalTime: "00:01:00", endLocalTime: "00:02:00", endDayOffset: 0 })), expectedVersion: "0" }) === null],

  ["special SET_CUSTOM_HOURS requires 1..8 intervals, rejects empty (never inferred as closed)", mod.parseSpecialInput({ localDate: "2099-01-01", operation: "SET_CUSTOM_HOURS", intervals: [], expectedVersion: "0" }) === null],
  ["special SET_CLOSED has its own exact shape (no intervals key)", mod.parseSpecialInput({ localDate: "2099-01-01", operation: "SET_CLOSED", intervals: [], expectedVersion: "0" }) === null],
  ["special localDate must be a plain date, not a UTC-shiftable datetime", mod.parseSpecialInput({ localDate: "2099-01-01T00:00:00Z", operation: "SET_CLOSED", expectedVersion: "0" }) === null],
  ["special CLEAR_OVERRIDE has its own exact shape", mod.parseSpecialInput({ localDate: "2099-01-01", operation: "CLEAR_OVERRIDE", expectedVersion: "0" })?.operation === "CLEAR_OVERRIDE"],

  ["closure CLOSE_NOW_INDEFINITE has its own exact shape (no datetime fields)", mod.parseClosureInput({ operation: "CLOSE_NOW_INDEFINITE", expectedVersion: "0" })?.operation === "CLOSE_NOW_INDEFINITE"],
  ["closure CLOSE_NOW_UNTIL rejects a bare date without time (not a local datetime)", mod.parseClosureInput({ operation: "CLOSE_NOW_UNTIL", untilLocalDateTime: "2099-01-01", fold: null, expectedVersion: "0" }) === null],
  ["closure CLOSE_NOW_UNTIL accepts a local civil datetime and passes fold through unresolved (no client-side DST logic)", mod.parseClosureInput({ operation: "CLOSE_NOW_UNTIL", untilLocalDateTime: "2099-01-01T10:00:00", fold: "earlier", expectedVersion: "0" })?.fold === "earlier"],
  ["closure SCHEDULE_CLOSURE allows a null end (open-ended)", mod.parseClosureInput({ operation: "SCHEDULE_CLOSURE", startLocalDateTime: "2099-01-01T10:00:00", startFold: null, endLocalDateTime: null, endFold: null, expectedVersion: "0" }) !== null],
  ["closure REOPEN_NOW requires a real uuid closureId", mod.parseClosureInput({ operation: "REOPEN_NOW", closureId: "not-a-uuid", expectedVersion: "0" }) === null],
  ["closure input rejects an unknown operation", mod.parseClosureInput({ operation: "FORCE_CLOSE", expectedVersion: "0" }) === null],

  // --- source-level scope/security proofs (static text scan of the real files) -------------------
  ["no Number()/parseInt() applied to any version field anywhere in the runtime module", !/Number\(\s*(v\.)?\w*[Vv]ersion|parseInt\(\s*(v\.)?\w*[Vv]ersion/.test(source)],
  ["no client-side .normalize() (no browser-side DST/Unicode reimplementation)", !source.includes(".normalize(")],
  ["timezone never appears as a writable RPC parameter name", !/p_timezone\b/.test(source)],
  ["fixed routes call the fixed runtime entry points only", fs.readFileSync(previewRoutePath, "utf8").includes("previewBranchTemporal") && fs.readFileSync(weeklyRoutePath, "utf8").includes("mutateWeeklyTemporal") && fs.readFileSync(specialRoutePath, "utf8").includes("mutateSpecialTemporal") && fs.readFileSync(closureRoutePath, "utf8").includes("mutateClosureTemporal")],
  ["no route accepts a PATCH method or generic body passthrough", ![previewRoutePath, weeklyRoutePath, specialRoutePath, closureRoutePath].some(p => /export\s+async\s+function\s+PATCH/.test(fs.readFileSync(p, "utf8")))],
  ["server runtime never accepts a caller-supplied restaurantId/userId/ownerId/membershipId/role/permission", !/p_restaurant_id:\s*(body|input|x)\.|userId|ownerId|membershipId|\brole:|\bpermission:/i.test(fs.readFileSync(serverPath, "utf8"))],
  ["server runtime derives restaurantId only from the verified access context, never the request", fs.readFileSync(serverPath, "utf8").includes("a.restaurant.id") && !fs.readFileSync(serverPath, "utf8").includes("restaurantId:")],
  ["control component never fabricates a success notice regardless of outcome (result.state is inspected)", fs.readFileSync(controlPath, "utf8").includes("resultCopy[result.state]")],
  ["control component gates empty-schedule save with an explicit UNKNOWN-vs-closed-all-week confirmation", fs.readFileSync(controlPath, "utf8").includes("weekly.length===0")],
  ["control component supports SET_CUSTOM_HOURS, not only SET_CLOSED/CLEAR_OVERRIDE", fs.readFileSync(controlPath, "utf8").includes("SET_CUSTOM_HOURS")],
  ["control component supports CLOSE_NOW_UNTIL, SCHEDULE_CLOSURE, and CANCEL_FUTURE_CLOSURE, not only indefinite/reopen", ["CLOSE_NOW_UNTIL", "SCHEDULE_CLOSURE", "CANCEL_FUTURE_CLOSURE"].every(op => fs.readFileSync(controlPath, "utf8").includes(op))],
  ["control component exposes a fold picker for ambiguous local times, never auto-selecting one", fs.readFileSync(controlPath, "utf8").includes("FoldPicker")],
  ["control component never displays a raw currentState/currentReason enum string directly", !/\{p\.currentState\}|\{p\.currentReason\}/.test(fs.readFileSync(controlPath, "utf8"))]
];
for (const [name, pass] of tests) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({ suite: "ra-2h-p2-smoke", total: tests.length, passed: tests.filter(([, pass]) => pass).length }));
if (tests.some(([, pass]) => !pass)) process.exitCode = 1;
