#!/usr/bin/env node
// Negative proof for the GQA-5 Restaurant read repair guard and its exact successor record. In-memory only.
import fs from "node:fs";
import path from "node:path";
import { readManifest } from "./db-migration-baseline-manifest.mjs";
import { GQA5_REPAIR_FILE, GQA5_REPAIR_MIGRATION, collectGqa5RepairEvidence, matchesExactGqa5RestaurantReadRepair } from "./gqa5-restaurant-read-repair-manifest.mjs";
import { validateRepairMigration } from "./gqa5-restaurant-read-repair-rules.mjs";

const ROOT = process.cwd();
const historical = readManifest().entries.map((e) => fs.readFileSync(path.join(ROOT, "supabase/migrations", path.basename(e.path)), "utf8"));
const source = fs.readFileSync(path.join(ROOT, GQA5_REPAIR_MIGRATION), "utf8");
const results = [];
const expect = (name, ok) => { results.push({ name, pass: Boolean(ok) }); };
expect("exact repair migration passes the structural rules", validateRepairMigration(source, historical).length === 0);
const once = (a, b) => { if (!source.includes(a)) throw new Error("mutation anchor missing: " + a.slice(0, 60)); return source.replace(a, b); };
const rejects = (name, text) => expect(`rejected: ${name}`, validateRepairMigration(text, historical).length > 0);
rejects("RPC query text changed (membership status dropped from the access context)", once("   AND membership.status = 'active'\n  JOIN public.restaurant_roles", "\n  JOIN public.restaurant_roles"));
rejects("RPC left as LANGUAGE sql", once("RETURNS TABLE (\n  menu_id text,\n  restaurant_id text,\n  name text,\n  status text\n)\nLANGUAGE plpgsql", "RETURNS TABLE (\n  menu_id text,\n  restaurant_id text,\n  name text,\n  status text\n)\nLANGUAGE sql"));
rejects("helper made SECURITY DEFINER", once("RETURNS text\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER", "RETURNS text\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER"));
rejects("helper EXECUTE granted to authenticated", once("GRANT EXECUTE ON FUNCTION public.restaurant_internal_visible_menu_restaurant_id_v1(text) TO restaurant_membership_context_reader;",
  "GRANT EXECUTE ON FUNCTION public.restaurant_internal_visible_menu_restaurant_id_v1(text) TO authenticated;"));
rejects("helper EXECUTE not revoked from PUBLIC", once("REVOKE ALL ON FUNCTION public.restaurant_internal_actor_is_active_member_v1(text) FROM PUBLIC;", ""));
rejects("policy reintroduces an inline catalogue join", once("USING (public.restaurant_internal_actor_has_catalog_permission_v1(public.restaurant_internal_visible_menu_restaurant_id_v1(menu_categories.menu_id)",
  "USING (EXISTS (SELECT 1 FROM public.menus AS m WHERE m.id = menu_categories.menu_id) AND public.restaurant_internal_actor_has_catalog_permission_v1(public.restaurant_internal_visible_menu_restaurant_id_v1(menu_categories.menu_id)"));
rejects("an extra (authority) policy altered", once("ALTER POLICY menus_internal_access_permit", "ALTER POLICY restaurant_users_self_active_select ON public.restaurant_users\n  USING (public.restaurant_internal_actor_is_active_member_v1(NULL));\nALTER POLICY menus_internal_access_permit"));
rejects("a boundary policy not re-expressed", source.replace(/ALTER POLICY menu_item_nutrition_internal_tenant_restrict ON public\.menu_item_nutrition\s+USING \([\s\S]*?\);\n/, ""));
rejects("row_security turned off in a helper", once("RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET row_security = 'on'", "RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET row_security = 'off'"));
rejects("RLS disabled on a catalogue table", once("BEGIN;\n", "BEGIN;\nALTER TABLE public.menus DISABLE ROW LEVEL SECURITY;\n"));
rejects("postgres SET edge not restored", source.replace(/GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET FALSE;/, ""));
rejects("temporary CREATE on public not revoked", once("REVOKE CREATE ON SCHEMA public FROM restaurant_membership_context_reader;", ""));
rejects("catalog-verified epilogue removed", source.replace(/DO \$verify\$[\s\S]*?\$verify\$;/, ""));
rejects("policy dropped and recreated instead of ALTER POLICY ... USING", once("ALTER POLICY menus_internal_tenant_restrict ON public.menus", "DROP POLICY menus_internal_tenant_restrict ON public.menus;\nCREATE POLICY menus_internal_tenant_restrict ON public.menus"));
rejects("grant to anon added", once("BEGIN;\n", "BEGIN;\nGRANT SELECT ON public.menus TO anon;\n"));
rejects("BYPASSRLS introduced", once("BEGIN;\n", "BEGIN;\nALTER ROLE restaurant_membership_context_reader BYPASSRLS;\n"));
rejects("service_role shortcut", once("BEGIN;\n", "BEGIN;\nGRANT restaurant_membership_context_reader TO service_role;\n"));
// Exact successor record.
const ev = collectGqa5RepairEvidence(ROOT);
expect("exact successor record recognizes the current file", matchesExactGqa5RestaurantReadRepair(ev));
const recRejects = (name, change) => { const e = structuredClone(ev); change(e); expect(`record rejects: ${name}`, !matchesExactGqa5RestaurantReadRepair(e)); };
recRejects("changed migration bytes (SHA-256)", (e) => { e.sha256 = "0".repeat(64); });
recRejects("changed migration blob", (e) => { e.blob = "0".repeat(40); });
recRejects("migration file absent", (e) => { e.exists = false; });
recRejects("an unexpected later migration after the repair", (e) => { e.migrationFiles.push("20991231000000_later.sql"); });
recRejects("an unexpected migration inserted before the repair", (e) => { e.migrationFiles.splice(-1, 0, "20260926000000_inserted.sql"); });
recRejects("repair no longer directly after ADMIN-D", (e) => { e.migrationFiles.splice(-2, 1); e.migrationFiles.splice(-1, 0, "20260921020000_other.sql"); });
recRejects("historical set without the repair", (e) => { e.migrationFiles = e.migrationFiles.filter((f) => f !== GQA5_REPAIR_FILE); });
// Real successor guards in a throwaway shared clone (OS temp dir): exact accepted, every deviation rejected.
const { execFileSync, spawnSync } = await import("node:child_process");
const os = await import("node:os");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gqa5-successor-"));
const repo = path.join(tmp, "repo");
const g = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
try {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", ROOT, repo], { stdio: "ignore" });
  g("checkout", "--quiet", "--detach", head);
  // Overlay the current working changes (modified and untracked) so a pre-commit candidate is tested as-is.
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean).map((l) => l.slice(3));
  for (const f of dirty) { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(repo, f)); }
  const run = (script) => spawnSync(process.execPath, [`scripts/${script}.mjs`], { cwd: repo, encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: "" } }).status;
  const reset = () => { g("reset", "--quiet", "--hard"); g("clean", "-fdq", "--", "supabase", "apps"); for (const f of dirty) fs.copyFileSync(path.join(ROOT, f), path.join(repo, f)); };
  const scenarios = [
    ["changed migration byte", () => fs.appendFileSync(path.join(repo, GQA5_REPAIR_MIGRATION), "-- changed\n")],
    ["extra later migration", () => fs.writeFileSync(path.join(repo, "supabase/migrations/20991231000000_extra.sql"), "select 1;\n")]
  ];
  const frozen = {
    // [frozen file, text to find, replacement]: a semantic edit the guard asserts, or null find to append a change.
    "restaurant-owner-display-name-draft-visibility-r2e-guard": ["supabase/migrations/20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql",
      "create policy menu_items_display_name_context_select", "create policy menu_items_display_name_ctx_select"],
    "restaurant-catalog-authoring-r2b-guard": ["supabase/migrations/20260918010000_restaurant_catalog_tenant_consistency_r2b_1.sql",
      "menu_items_tenant_consistency_trigger", "menu_items_tenant_consistency_trg"],
    "gqa-1-truthfulness-guard": ["apps/mobile/app/today-intake.tsx", null, "\n// >82<\n"],
    "admin-e1-guard": ["apps/admin-web/middleware.ts", null, "\n// changed\n"],
    "admin-dashboard-social-policies-d-guard": ["supabase/migrations/20260921010000_admin_dashboard_social_policy_reads_d.sql", "'tagKey'", "'tag_key'"]
  };
  // gqa-2-closure-guard loads TypeScript from node_modules and cannot run in a link-free clone; its GQA-5
  // acceptance is proven by gqa-2-successor-mutations (evidence mutations and real-history clone).
  for (const [guard, [file, find, repl]] of Object.entries(frozen)) {
    reset();
    expect(`real ${guard}: exact repair accepted`, run(guard) === 0);
    for (const [label, mutate] of scenarios) { reset(); mutate(); expect(`real ${guard}: ${label} rejected`, run(guard) !== 0); }
    reset();
    const p = path.join(repo, file);
    const t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    if (t === null || (find && !t.includes(find))) { expect(`real ${guard}: frozen fixture anchor exists (${file})`, false); continue; }
    fs.writeFileSync(p, find ? t.replaceAll(find, repl) : t + repl);
    expect(`real ${guard}: frozen file change rejected (${path.basename(file)})`, run(guard) !== 0);
  }
} finally {
  const links = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isSymbolicLink()) links.push(e.name); else if (e.isDirectory()) walk(path.join(d, e.name)); } };
  if (path.basename(tmp).startsWith("gqa5-successor-") && path.dirname(tmp) === path.resolve(os.tmpdir())) { walk(tmp); if (!links.length) fs.rmSync(tmp, { recursive: true, force: true }); }
}
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ suite: "gqa5-restaurant-read-repair-mutations", total: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed.map((f) => f.name), networkUsed: false, databaseUsed: false }, null, 1));
process.exitCode = failed.length ? 1 : 0;
