#!/usr/bin/env node
// RA-2H-P2 Development HTTP acceptance -- PREPARED ONLY, not executed as part of this round.
//
// This script exercises the ACTUAL frozen fixed HTTP routes (never a direct P1 RPC call) as real
// authenticated Owner sessions, mirroring the transport every prior P2 round's own acceptance used.
// It requires a running Restaurant Web server (npm run build && npm run start, or next dev) pointed
// at tastkind-development, and two rotated Owner sessions -- neither is acquired automatically; see
// RA-2H-P1's own acceptance rounds for the established rotate/sign-in/sign-out pattern this reuses.
//
// It deliberately reads every version (weekly/special/closure) FRESH from the canonical preview
// response immediately before each mutation, rather than trusting any value hardcoded at authoring
// time -- Development state moves between rounds, and this script must never assume otherwise.
//
// Opt-in guards (checked, not bypassed):
//   RESTAURANT_WEB_BASE_URL   e.g. http://127.0.0.1:3001 (a locally running server)
//   HIDDEN_B_COOKIE_FILE      path to a file containing the hidden-B Owner's sb-<ref>-auth-token cookie
//   ACTIVE_A_COOKIE_FILE      path to a file containing the "A owner" fixture's cookie
// If any is absent this script reports "skipped" and performs no network action -- exactly the
// established fail-closed convention for every optional live-credential gate in this repository.
import fs from "node:fs";

const SUITE = "restaurant-owner-branch-temporal-ra-2h-p2-development-acceptance";
const BASE = process.env.RESTAURANT_WEB_BASE_URL?.trim();
const HIDDEN_B_COOKIE_FILE = process.env.HIDDEN_B_COOKIE_FILE?.trim();
const ACTIVE_A_COOKIE_FILE = process.env.ACTIVE_A_COOKIE_FILE?.trim();
if (!BASE || !HIDDEN_B_COOKIE_FILE || !ACTIVE_A_COOKIE_FILE
  || !fs.existsSync(HIDDEN_B_COOKIE_FILE) || !fs.existsSync(ACTIVE_A_COOKIE_FILE)) {
  console.log(JSON.stringify({
    suite: SUITE, status: "skipped",
    reason: "set RESTAURANT_WEB_BASE_URL, HIDDEN_B_COOKIE_FILE, and ACTIVE_A_COOKIE_FILE (each an "
      + "existing file holding a freshly rotated Owner session cookie) to run this round's "
      + "Development HTTP acceptance. Not executed as part of RA-2H-P2 itself."
  }, null, 2));
  process.exit(0);
}

const HIDDEN_B = { restaurant: "dev-restaurant-hidden", branch: "dev-branch-b-main", cookie: fs.readFileSync(HIDDEN_B_COOKIE_FILE, "utf8").trim() };
const ACTIVE_A = { restaurant: "dev-restaurant-haochu", branch: "dev-branch-nanjing", cookie: fs.readFileSync(ACTIVE_A_COOKIE_FILE, "utf8").trim() };

const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const r = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(r); if (!r.pass) failures.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!r.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

async function call(method, path, cookie, body) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, cache: "no-store", redirect: "error", ...(payload === undefined ? {} : { body: payload }) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bounded */ }
  return { status: res.status, json };
}
const preview = (fixture) => call("GET", `/api/restaurant/branches/${fixture.branch}/temporal`, fixture.cookie);
const saveWeekly = (fixture, body) => call("POST", `/api/restaurant/branches/${fixture.branch}/temporal/weekly`, fixture.cookie, body);
const saveSpecial = (fixture, body) => call("POST", `/api/restaurant/branches/${fixture.branch}/temporal/special`, fixture.cookie, body);
const saveClosure = (fixture, body) => call("POST", `/api/restaurant/branches/${fixture.branch}/temporal/closure`, fixture.cookie, body);

// ============================================================== Hidden-B: negative path only.
// dev-restaurant-hidden is permanently draft; every closure command must correctly refuse
// lifecycle_blocked. Weekly/special were already fully accepted at the P1 DB-RPC layer; this round
// only needs to prove the SAME fixed HTTP route surfaces the identical bounded outcome.
console.log("=== hidden-B: negative-path proof over the real HTTP route ===");
const hiddenPreview = await preview(HIDDEN_B);
check("hidden-B preview: HTTP 200, currentReason ADMIN_LIFECYCLE_BLOCKED", hiddenPreview.status === 200 && hiddenPreview.json?.currentReason === "ADMIN_LIFECYCLE_BLOCKED", hiddenPreview.json);
if (hiddenPreview.json?.state === "ready") {
  const closeAttempt = await saveClosure(HIDDEN_B, { operation: "CLOSE_NOW_INDEFINITE", expectedVersion: hiddenPreview.json.operationalClosureVersion });
  check("hidden-B CLOSE_NOW_INDEFINITE over HTTP correctly refuses lifecycle_blocked, writes nothing", closeAttempt.status === 403 && closeAttempt.json?.state === "lifecycle_blocked", closeAttempt);
  const afterAttempt = await preview(HIDDEN_B);
  check("hidden-B operationalClosureVersion unchanged after the refused attempt", afterAttempt.json?.operationalClosureVersion === hiddenPreview.json.operationalClosureVersion, afterAttempt.json);
}

// ============================================================== Active A: positive closure cycle.
// Every version is read fresh, immediately before use -- this fixture accumulates real history
// across rounds (RA-2H-P1-A1 already left it at v6); never assume any prior number here.
console.log("\n=== active-A (dev-branch-nanjing): positive closure HTTP cycle ===");
const p0 = await preview(ACTIVE_A);
check("active-A preview: HTTP 200, ready", p0.status === 200 && p0.json?.state === "ready", p0.json);
if (p0.json?.state === "ready") {
  const v0 = p0.json.operationalClosureVersion;
  const untilLocal = new Date(Date.now() + 8 * 3600 * 1000 + 5 * 60 * 1000).toISOString().slice(0, 16); // Asia/Taipei wall clock, +5min
  const c1 = await saveClosure(ACTIVE_A, { operation: "CLOSE_NOW_UNTIL", untilLocalDateTime: untilLocal, fold: null, expectedVersion: v0 });
  check("CLOSE_NOW_UNTIL over HTTP applies", c1.status === 200 && c1.json?.state === "applied", c1.json);
  if (c1.json?.state === "applied") {
    const p1 = await preview(ACTIVE_A);
    check("preview reflects CLOSED/OPERATIONALLY_CLOSED", p1.json?.currentState === "CLOSED" && p1.json?.currentReason === "OPERATIONALLY_CLOSED", p1.json);
    const stale = await saveClosure(ACTIVE_A, { operation: "CLOSE_NOW_INDEFINITE", expectedVersion: v0 });
    check("stale pre-cycle version replayed over HTTP is refused", stale.status === 409 && stale.json?.state === "stale_state", stale.json);
    const r1 = await saveClosure(ACTIVE_A, { operation: "REOPEN_NOW", closureId: c1.json.closureId, expectedVersion: c1.json.operationalClosureVersion });
    check("REOPEN_NOW over HTTP applies", r1.status === 200 && r1.json?.state === "applied", r1.json);
    const pFinal = await preview(ACTIVE_A);
    check("FINAL: no effective closure after the HTTP cycle", pFinal.json?.operationalClosures?.every(x => x.closureId !== c1.json.closureId) ?? true, pFinal.json);
  }
}

console.log("\n" + JSON.stringify({
  suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
