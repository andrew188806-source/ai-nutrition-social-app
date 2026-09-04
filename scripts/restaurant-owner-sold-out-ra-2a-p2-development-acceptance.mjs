#!/usr/bin/env node
// Inert by default. Later acceptance drives only the frozen P2 HTTP route; SQL is snapshot-only.
import {
  P2_ACCEPTANCE_TARGET, P2_ACCEPTANCE_RESTAURANT, P2_ACCEPTANCE_BRANCH,
  P2_ACCEPTANCE_MENU_ITEM, P2_START_AUDIT_ROWS, P2_START_SOLD_OUT, P2_START_VERSION
} from "./restaurant-owner-sold-out-ra-2a-p2-successor-manifest.mjs";

const SUITE = "restaurant-owner-sold-out-ra-2a-p2-development-acceptance";
const PREFLIGHT = "TASTKIND_RA2A_P2_DEVELOPMENT_PREFLIGHT";
const WRITE = "TASTKIND_RA2A_P2_DEVELOPMENT_WRITE";
const REF = "msbgnnoorsoefuiwluye";
const NAME = "tastkind-development";
if (process.env[PREFLIGHT] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", writeExecuted: false,
    reason: `set ${PREFLIGHT}=1 only after Development acceptance is authorized` }, null, 2));
  process.exit(0);
}

const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const sessionCookie = process.env.TASTKIND_RA2A_P2_SESSION_COOKIE;
const baseUrl = new URL(process.env.TASTKIND_RA2A_P2_RESTAURANT_BASE_URL ?? "");
const loopback = baseUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(baseUrl.hostname);
if ((!loopback && baseUrl.protocol !== "https:") || baseUrl.username || baseUrl.password
  || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/") throw new Error("invalid Restaurant base URL");
if (!managementToken) throw new Error("SUPABASE_ACCESS_TOKEN absent");
if (!sessionCookie) throw new Error("TASTKIND_RA2A_P2_SESSION_COOKIE absent");

const management = async (path, init = {}) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    ...init, headers: { Authorization: `Bearer ${managementToken}`, ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`Development Management API ${response.status}`);
  return response.json();
};
const sql = query => management("/database/query", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query })
});
const snapshot = async () => (await sql(`select bmi.sold_out, bmi.sold_out_version::text version,
  (select count(*)::int from restaurant_internal.branch_menu_item_sold_out_audit_log
    where branch_menu_item_id='${P2_ACCEPTANCE_TARGET}') audit_rows
  from public.branch_menu_items bmi where bmi.id='${P2_ACCEPTANCE_TARGET}';`))[0];
const endpoint = new URL(`/api/restaurant/branches/${encodeURIComponent(P2_ACCEPTANCE_BRANCH)}/menu-items/${encodeURIComponent(P2_ACCEPTANCE_TARGET)}/sold-out`, baseUrl);
async function api(method, body) {
  const response = await fetch(endpoint, { method, redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", Cookie: sessionCookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let result; try { result = await response.json(); } catch { result = { state: "malformed" }; }
  return { status: response.status, result };
}
const checks = [];
let writeExecuted = false;
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${checks.length} ${name}`); };
const body = (preview, nextSoldOut) => ({ expectedSoldOut: preview.soldOut,
  nextSoldOut, expectedVersion: preview.soldOutVersion });

const project = await management("");
check("project pin", project.id === REF && project.name === NAME);
const before = await snapshot();
const initial = await api("GET");
check("approved hidden target starts at the frozen state", initial.status === 200
  && initial.result.state === "ready" && initial.result.branchMenuItemId === P2_ACCEPTANCE_TARGET
  && initial.result.branchId === P2_ACCEPTANCE_BRANCH && initial.result.menuItemId === P2_ACCEPTANCE_MENU_ITEM
  && initial.result.soldOut === P2_START_SOLD_OUT && initial.result.soldOutVersion === P2_START_VERSION
  && before.audit_rows === P2_START_AUDIT_ROWS);

if (process.env[WRITE] === "1" && checks.every(item => item.pass)) {
  writeExecuted = true;
  const applied = await api("POST", body(initial.result, true));
  check("actual HTTP route applies false/2 to true/3", applied.status === 200
    && applied.result.state === "ready" && applied.result.soldOut === true
    && applied.result.soldOutVersion === "3");
  const stale = await api("POST", body(initial.result, true));
  check("actual HTTP route preserves stale conflict", stale.status === 409 && stale.result.state === "stale_state");
  const fresh = await api("GET");
  check("fresh HTTP preview returns true/3", fresh.status === 200 && fresh.result.state === "ready"
    && fresh.result.soldOut === true && fresh.result.soldOutVersion === "3");
  const recovered = await api("POST", body(fresh.result, false));
  check("canonical HTTP recovery returns false/4", recovered.status === 200
    && recovered.result.state === "ready" && recovered.result.soldOut === false
    && recovered.result.soldOutVersion === "4");
  const final = await api("GET");
  const after = await snapshot();
  check("final HTTP preview and retained audit evidence are exact", final.status === 200
    && final.result.soldOut === false && final.result.soldOutVersion === "4"
    && after.sold_out === false && after.version === "4" && after.audit_rows === 4);
}

const failures = checks.filter(item => !item.pass);
console.log(JSON.stringify({ suite: SUITE, status: failures.length ? "failed" : "passed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  writeExecuted, targetClass: "hidden-restaurant-b" }, null, 2));
if (failures.length) process.exitCode = 1;
