#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateAdminD } from "./admin-dashboard-social-policies-d-rules.mjs";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const base = {
  migration: read("supabase/migrations/20260921010000_admin_dashboard_social_policy_reads_d.sql"),
  registry: read("apps/admin-web/auth/admin-route-registry.ts"),
  dashboard: read("apps/admin-web/app/admin/page.tsx"),
  social: read("apps/admin-web/app/admin/social/policies/page.tsx"),
  adapter: read("apps/admin-web/server/adminDashboardSocialRead.ts"),
  views: read("apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx")
};
assert.deepEqual(validateAdminD(base), [], "baseline must satisfy ADMIN-D rules");

const mutations = [
  ["A counts exposed to base Admin", "dashboard", "const result = canReadCounts ? await readDashboardCounts() : null;", "const result = await readDashboardCounts();", "dashboard_rpc_not_conditional"],
  ["B dashboard route requires counts permission", "registry", 'requiredPermissions: ["admin_context.read"], availability: "LIVE"', 'requiredPermissions: ["admin.dashboard.counts.read"], availability: "LIVE"', "dashboard_route_split_authority"],
  ["C dashboard uses wrong count permission", "dashboard", 'has(context, "admin.dashboard.counts.read")', 'has(context, "admin_context.read")', "dashboard_wrong_permission"],
  ["D dashboard invents zero after failure", "dashboard", '<ReadFailureNotice state={result?.state ?? "unavailable"} />', '<FactList items={[{ label: "fallback", value: 0 }]} />', "dashboard_fake_zero_fallback"],
  ["E Social falls back to base Admin", "social", "const page = parsePageParam(searchParams.page);", 'const allowed = context.permissions.includes("admin_context.read");\n  const page = parsePageParam(searchParams.page);', "social_fallback_mutation_or_mock"],
  ["F Social database gate uses wrong permission", "migration", "staff_has_permission_v1('admin.social.policies.read')", "staff_has_permission_v1('admin.dashboard.counts.read')", "social_db_exact_gate_missing"],
  ["G raw Social SELECT granted to authenticated", "migration", "grant execute on function public.staff_admin_dashboard_counts_v1() to authenticated;", "grant select on public.social_interest_catalog to authenticated;\ngrant execute on function public.staff_admin_dashboard_counts_v1() to authenticated;", "raw_social_client_select_added"],
  ["H Social mutation control added", "social", "<ReadySection label=\"社交興趣目錄\">", '<button>刪除</button><ReadySection label="社交興趣目錄">', "social_fallback_mutation_or_mock"],
  ["I legacy mock reused", "social", "import { readSocialPolicies }", "import { mockTagReviews } from \"../../../../tags/mock\";\nimport { readSocialPolicies }", "social_fallback_mutation_or_mock"],
  ["J backend error translated to a zero success", "dashboard", 'result?.state ?? "unavailable"', 'result?.state ?? "ready"', "dashboard_error_not_distinct"],
  ["K Social pagination bound removed", "migration", "if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then", "if false then", "social_contract_unbounded"],
  ["L dashboard database gate falls back to base permission", "migration", "staff_admin_restaurant_read_gate_v1('admin.dashboard.counts.read')", "staff_admin_restaurant_read_gate_v1('admin_context.read')", "dashboard_db_exact_gate_missing"],
  ["M Social caption falls back to 20", "social", "pageSize={50}", "pageSize={20}", "social_page_size_caption_wrong"],
  ["N shared default changes existing pages to 50", "views", "pageSize = 20", "pageSize = 50", "shared_page_size_default_wrong"]
];

const results = [];
for (const [name, file, from, to, expected] of mutations) {
  assert.ok(base[file].includes(from), `mutation anchor missing: ${name}`);
  const mutated = { ...base, [file]: base[file].replace(from, to) };
  const errors = validateAdminD(mutated);
  const pass = errors.includes(expected);
  results.push({ name, pass, errors });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(results.length).padStart(2, "0")} ${name}`);
}
const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "admin-dashboard-social-policies-d-mutations", mutants: results.length, killed: results.length - failed.length, survived: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
