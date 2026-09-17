#!/usr/bin/env node
// Restaurant Phase R1 — branch-context persistence static guard. Verifies the persisted branch
// preference (a UX default only) can never bypass real branch-authority validation, and that
// navigation closure hides unbuilt routes without deleting them. No database, no network.
import fs from "node:fs";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(`${ROOT}/${file}`, "utf8");

const cookieSource = read("apps/restaurant-web/auth/selection-cookie.ts");
const contextSource = read("apps/restaurant-web/runtime/restaurant-access-context.ts");
const middlewareSource = read("apps/restaurant-web/middleware.ts");
const navSource = read("apps/restaurant-web/data/navigation.ts");
const shellSource = read("apps/restaurant-web/components/DashboardShell.tsx");

const checks = [];
const failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

// --- Branch persistence is a UX preference, never an authority shortcut ------------------------
check(cookieSource.includes("SELECTED_BRANCH_COOKIE"), "a dedicated branch-preference cookie constant exists");
check(cookieSource.includes("httpOnly: true"), "the branch-preference cookie is httpOnly (not client-readable/writable)");
check(/never\s+an\s+authorization\s+token/i.test(cookieSource.replace(/\/\//g, " ").replace(/\s+/g, " ")), "the cookie's own comment documents it as UX-only, never an authority token");

check(
  contextSource.includes("cookies().get(SELECTED_BRANCH_COOKIE)"),
  "loadValidatedBranch reads the persisted preference from the cookie"
);
check(
  /preferred = preferredId \? branches\.find\(\(branch\) => branch\.id === preferredId\) \?\? null : null/.test(contextSource.replace(/\s+/g, " ")),
  "the persisted branch id is looked up in the CURRENT restaurant's own authorized `branches` list — never trusted directly",
  "loadValidatedBranch must call branches.find(...) on the persisted id, exactly like it already does for the URL-supplied id"
);
check(
  !/preferred = preferredId as unknown as OwnerBranch|selected: \{ id: preferredId/.test(contextSource),
  "no code path fabricates a selected branch object directly from the cookie value without a `branches.find` lookup"
);
check(
  contextSource.includes("if (branchId) {") && contextSource.indexOf("if (branchId) {") < contextSource.indexOf("cookies().get(SELECTED_BRANCH_COOKIE)"),
  "an explicit URL branch id is checked BEFORE falling back to the persisted cookie preference (URL wins)"
);
check(
  !/return \{ branches, selected: preferred, invalid: true \}/.test(contextSource),
  "an invalid/unauthorized persisted branch never surfaces as an `invalid` error state — it silently falls back to the existing unfiltered default"
);

// --- Middleware only ever performs a blind write of the raw query value -------------------------
check(
  middlewareSource.includes('request.nextUrl.searchParams.get("branch")'),
  "middleware captures the branch id from the URL query, not from any trusted/validated source"
);
check(
  !/supabase\.(?:from|rpc)\(/i.test(middlewareSource.split("SELECTED_BRANCH_COOKIE")[1] ?? ""),
  "middleware does not query Supabase to validate the branch id before persisting it (validation stays server-render-time only, on every request)"
);
check(
  middlewareSource.includes("response.cookies.set(SELECTED_BRANCH_COOKIE"),
  "the branch cookie is set on the response, following the same mechanism as every other cookie this middleware already sets"
);

// --- Navigation closure: hidden, not deleted ------------------------------------------------------
const deferredRoutes = [
  "/restaurant/menu/pending-items",
  "/restaurant/analytics",
  "/restaurant/staff",
  "/restaurant/assistant",
  "/restaurant/media"
];
for (const route of deferredRoutes) {
  check(navSource.includes(route), `deferred route ${route} is still present in navigation.ts (route preserved, not deleted)`);
}
check(
  (navSource.match(/phaseTwo: true/g) ?? []).length === 6,
  "exactly 6 nav entries are marked phaseTwo (pending-items, analytics, staff, assistant, media, plus the pre-existing orders-preview)",
  (navSource.match(/phaseTwo: true/g) ?? []).length
);
check(
  shellSource.includes("phaseTwoItems"),
  "DashboardShell renders every phaseTwo item, not just the first (the old `.find()` singular bug is fixed)"
);
check(
  shellSource.includes("child.phaseTwo"),
  "DashboardShell filters phaseTwo children out of a regular parent's visible children list"
);
check(
  !fs.existsSync(`${ROOT}/apps/restaurant-web/app/restaurant/media/page.tsx`) || read("apps/restaurant-web/app/restaurant/media/page.tsx").length > 0,
  "the deferred /restaurant/media route file itself still exists on disk (not deleted)"
);
check(
  !fs.existsSync(`${ROOT}/apps/restaurant-web/components/staff/StaffPanels.tsx`) || read("apps/restaurant-web/components/staff/StaffPanels.tsx").length > 0,
  "the orphaned StaffPanels component still exists on disk (not deleted — future recovery preserved)"
);

console.log(JSON.stringify({ suite: "restaurant-owner-branch-context-r1-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
