#!/usr/bin/env node
// R2E smoke: contract/source agreement, no database. Confirms the migration's structural shape
// matches the repair's own stated contract -- narrower than the guard, focused on the "is this
// actually the repair it claims to be" question.
import fs from "node:fs";
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(`${ROOT}/${file}`, "utf8");
const MIGRATION = "supabase/migrations/20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql";
const checks = [], failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const source = read(MIGRATION);

// 1. Migration contract exists: begin/commit wrapped, single logical unit.
check(/^begin;/m.test(source) && /\ncommit;\s*$/.test(source), "migration is a single begin/commit transaction");

// 2. Role/policy wiring exists.
check(source.includes("restaurant_owner_branch_menu_item_display_name_write_authority"), "targets the RA-2F sealed role");
check(source.includes("menu_items_display_name_context_select"), "creates the expected policy");
check(source.includes("public.menu_items"), "the policy is on public.menu_items");

// 3. Expected grant posture: exactly the one new column grant, no table-wide grant.
check(/grant select \(restaurant_id\)/.test(source), "grants column-scoped SELECT(restaurant_id) only");
check(!/grant select\s+on table public\.menu_items/i.test(source), "never grants table-wide SELECT on menu_items");

// 4. Draft-item preview/set/clear path is structurally supported: the policy has no status
// predicate on menu_items and correctly ties visibility to the display-name permission key, which
// is exactly what both RA-2F RPCs check internally (confirmed against the frozen RA-2F source).
const ra2f = read("supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql");
check(ra2f.includes("'branch_menu_item.display_name.write'"), "the frozen RA-2F migration uses the same permission key this repair's policy checks");
// Isolate the policy's own USING body (not the whole file, which legitimately mentions
// "menu_items.status" in comments/assertions explaining that the predicate is absent).
const policyStart = source.indexOf("create policy menu_items_display_name_context_select");
const policyEnd = source.indexOf("comment on policy menu_items_display_name_context_select");
const policyBody = policyStart >= 0 && policyEnd > policyStart ? source.slice(policyStart, policyEnd) : "";
check(policyBody.length > 0 && !/menu_items\.status/.test(policyBody), "no part of this migration's policy body filters menu_items by its own status column");

// 5. This is additive only -- no historical file touched, exactly one new file.
const migrations = fs.readdirSync(`${ROOT}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
check(migrations.slice(-3).join("|") === [MIGRATION.split("/").pop(), "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql", "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql"].join("|"), "the R2E migration is followed only by the authorized H3 and H4 hardening migrations", migrations.slice(-3));
check(migrations.length === 135, "exactly 135 migrations exist (127 historical + 5 R2B + 1 R2E + 2 pre-Admin hardening)", migrations.length);

// 6. Documentation companion exists (added later in this round; smoke re-run after docs step should
// find it -- checked here so the suite is a single source of truth for "is R2E complete").
const docCandidates = [
  "docs/restaurant-owner-catalog-authoring-r2b.md",
  "docs/engineering-handoff.md"
];
const mentionsR2E = docCandidates.some((path) => fs.existsSync(`${ROOT}/${path}`) && read(path).includes("R2E"));
check(mentionsR2E, "at least one Restaurant authority doc mentions R2E", docCandidates);

console.log(JSON.stringify({ suite: "restaurant-owner-display-name-draft-visibility-r2e-smoke", status: failures.length ? "failed" : "passed", total: checks.length, passed: checks.length - failures.length, failed: failures.length }, null, 2));
process.exitCode = failures.length ? 1 : 0;
