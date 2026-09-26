#!/usr/bin/env node
// GQA-3 static app <-> database object contract scan. Local text analysis only.
//
//   node scripts/db-object-contract-scan.mjs            summary + blocking check (exit 1 only on a concrete
//                                                        current-runtime reference with no definition)
//   node scripts/db-object-contract-scan.mjs --json     full machine-readable inventory on stdout
//
// Reference classes: DEFINED_LOCAL, EXTERNAL_PLATFORM_OBJECT, HISTORICAL_REFERENCE, DYNAMIC,
// POSSIBLE_MISSING_CONTRACT. Only POSSIBLE_MISSING_CONTRACT from current runtime (non-test, non-mock)
// source blocks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldSecurityState, parseMigration } from "./db-contract-sql.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_ROOTS = ["apps/mobile", "apps/restaurant-web", "apps/admin-web", "packages/shared", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "dist", "build", ".turbo", "coverage"]);
const NON_RUNTIME = /(^|\/)(__tests__|__mocks__|test|tests|fixtures?)(\/|$)|\.(test|spec)\.[tj]sx?$|[Mm]ock|[Ff]ixture|[Dd]emo[A-Z._]|Demo\.tsx?$/;
const EXTERNAL = /^(auth|storage|realtime|extensions|pg_catalog|information_schema|vault|net|cron|graphql|graphql_public|supabase_functions)\./;

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

export function collectDefinitions(root = ROOT) {
  const dir = path.join(root, "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const objects = new Map();
  const parsed = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const facts = parseMigration(text);
    parsed.push({ file, facts, text });
    const define = (name, kind, extra = {}) => {
      const prev = objects.get(name);
      objects.set(name, { name, kind, firstMigration: prev?.firstMigration ?? file, lastMigration: file, dropped: false, ...(prev ?? {}), ...extra, lastMigration: file, dropped: false });
    };
    for (const t of facts.createdTables) define(t, "table");
    for (const v of facts.views) define(v, "view");
    for (const fn of facts.functions) define(fn.name, "function", { securityDefiner: fn.securityDefiner, searchPath: fn.searchPath });
    for (const t of facts.droppedTables) if (objects.has(t)) objects.get(t).dropped = file;
    for (const fnName of facts.droppedFunctions) if (objects.has(fnName)) objects.get(fnName).dropped = file;
  }
  // Recreated after a drop: the latest definition wins (define() above resets dropped for later files).
  return { objects, parsed, state: foldSecurityState(parsed.map((p) => p.facts)) };
}

export function collectReferences(root = ROOT) {
  const refs = [];
  const constants = new Map();
  const sources = RUNTIME_ROOTS.flatMap((r) => walk(path.join(root, r))).map((p) => ({ file: rel(p), text: fs.readFileSync(p, "utf8") }));
  for (const { text } of sources) {
    for (const m of text.matchAll(/\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*["'`]([a-z][a-z0-9_]*)["'`]/g)) constants.set(m[1], m[2]);
  }
  for (const { file, text } of sources) {
    const context = NON_RUNTIME.test(file) ? "non-runtime" : "runtime";
    const push = (name, kind, how) => refs.push({ name, kind, how, file, context });
    for (const m of text.matchAll(/\.rpc\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g)) push(m[1], "function", "rpc-literal");
    for (const m of text.matchAll(/\.rpc(?:<[^>]*>)?\(\s*([A-Z][A-Z0-9_]*)\b/g)) push(constants.get(m[1]) ?? `<dynamic:${m[1]}>`, "function", "rpc-constant");
    for (const m of text.matchAll(/(?<!storage)\.from\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g)) push(m[1], "relation", "from-literal");
    for (const m of text.matchAll(/(?<!storage)\.from(?:<[^>]*>)?\(\s*([A-Z][A-Z0-9_]*)\b/g)) push(constants.get(m[1]) ?? `<dynamic:${m[1]}>`, "relation", "from-constant");
    for (const m of text.matchAll(/\/rest\/v1\/rpc\/([a-z][a-z0-9_]*)/g)) push(m[1], "function", "rest-rpc-literal");
    for (const m of text.matchAll(/\/rest\/v1\/rpc\/\$\{([A-Z][A-Z0-9_]*)\}/g)) push(constants.get(m[1]) ?? `<dynamic:${m[1]}>`, "function", "rest-rpc-constant");
    for (const m of text.matchAll(/\/rest\/v1\/(?!rpc\/)([a-z][a-z0-9_]*)/g)) push(m[1], "relation", "rest-relation-literal");
    for (const m of text.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)) push(m[1], "edge-function", "invoke-literal");
    for (const m of text.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)) push(m[1], "edge-function", "functions-url-literal");
    // Static SQL held in runtime source (Edge Function executors): schema-qualified object names.
    for (const m of text.matchAll(/\b(public|social_internal|geo_internal|restaurant_internal|admin_internal)\.([a-z_][a-z0-9_]*)\s*\(/g)) push(`${m[1]}.${m[2]}`, "function", "sql-qualified-call");
    for (const m of text.matchAll(/\b(?:from|join)\s+(public|social_internal|geo_internal|restaurant_internal|admin_internal)\.([a-z_][a-z0-9_]*)\b/gi)) push(`${m[1].toLowerCase()}.${m[2]}`, "relation", "sql-qualified-relation");
    // Versioned contract names held in constants or contract objects, e.g. "consumer_x_v1".
    for (const m of text.matchAll(/["'`]((?:[a-z][a-z0-9]*_)+v\d+)["'`]/g)) push(m[1], "versioned-name", "contract-literal");
    // Any snake_case literal (contract maps such as { add: "add_authenticated_x" }): counted as a
    // reference only when it names a defined object; otherwise it is an ordinary string (error code,
    // column name) and is not a contract claim.
    for (const m of text.matchAll(/["'`]([a-z][a-z0-9]*(?:_[a-z0-9]+){1,})["'`]/g)) {
      if (!/_v\d+$/.test(m[1])) push(m[1], "name-literal", "string-literal");
    }
  }
  return { refs, sources: sources.length };
}

export function classify(definitions, references, root = ROOT) {
  const byBare = new Map();
  for (const obj of definitions.objects.values()) {
    const bare = obj.name.split(".")[1];
    byBare.set(bare, [...(byBare.get(bare) ?? []), obj]);
  }
  const edgeFunctions = new Set(fs.readdirSync(path.join(root, "supabase/functions"), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name));
  const out = [];
  for (const r of references.refs) {
    let status, definedAs = null;
    if (r.name.startsWith("<dynamic:")) status = "DYNAMIC";
    else if (r.kind === "edge-function") status = edgeFunctions.has(r.name) ? "DEFINED_LOCAL" : "POSSIBLE_MISSING_CONTRACT";
    else if (EXTERNAL.test(r.name)) status = "EXTERNAL_PLATFORM_OBJECT";
    else {
      const qualified = r.name.includes(".") ? definitions.objects.get(r.name) : null;
      const loose = ["versioned-name", "contract-name", "name-literal"].includes(r.kind);
      const candidates = qualified ? [qualified] : (byBare.get(r.name) ?? []).filter((o) => o.name.startsWith("public.") || loose);
      const live = candidates.filter((o) => !o.dropped);
      if (live.length) { status = "DEFINED_LOCAL"; definedAs = live.map((o) => `${o.name} (${o.kind}, ${o.firstMigration.slice(0, 14)})`).join("; "); }
      else if (candidates.length) { status = "HISTORICAL_REFERENCE"; definedAs = candidates.map((o) => `${o.name} dropped in ${o.dropped}`).join("; "); }
      else if (r.kind === "name-literal") continue; // an ordinary identifier/string, not a DB contract claim
      else status = loose ? "UNRESOLVED_NAME" : "POSSIBLE_MISSING_CONTRACT";
    }
    out.push({ ...r, status, definedAs });
  }
  return out;
}

/** Accepted chains: every named object must be defined locally and referenced by current runtime source. */
export const PRINCIPAL_CHAINS = Object.freeze({
  "Consumer meal records": ["public.create_current_user_meal_record_v2", "public.meal_records"],
  "Consumer today intake": ["public.daily_nutrition_summaries", "public.persist_authenticated_daily_nutrition_summary"],
  "Consumer recommendation": ["public.consumer_public_next_meal_candidates_v2", "public.create_authenticated_recommendation_session", "public.record_authenticated_recommendation_feedback_event"],
  "Consumer favorites": ["public.add_authenticated_menu_item_favorite", "public.remove_authenticated_menu_item_favorite", "public.favorite_menu_items"],
  "Consumer ratings": ["public.save_authenticated_menu_item_rating", "public.save_authenticated_restaurant_rating", "public.user_menu_item_ratings"],
  "Social interests": ["public.replace_authenticated_social_interest_settings", "public.social_interest_catalog"],
  "Meal Buddy cards": ["social_internal.create_meal_buddy_card_from_recommendation_with_branch_context", "social_internal.list_owned_meal_buddy_cards_with_context"],
  "Meal Buddy relationship / chat": ["social_internal.send_meal_buddy_invite", "social_internal.resolve_meal_buddy_relationship", "social_internal.open_meal_buddy_chat", "social_internal.send_meal_buddy_chat_message"],
  "Restaurant ownership / catalogue authoring": ["public.restaurant_internal_restaurants_v2", "public.restaurant_owner_create_menu_v1", "public.restaurant_owner_create_menu_category_v1", "public.restaurant_owner_create_menu_item_v1", "public.restaurant_owner_link_menu_item_to_branch_v1"],
  "Published Consumer catalogue": ["public.consumer_public_restaurant_catalog_v4", "public.restaurant_public_published_nutrition_v1"],
  "Admin context / permission": ["public.platform_admin_current_context_v1", "public.staff_current_context_v1"],
  "Admin operational reads": ["public.staff_admin_restaurant_list_v1", "public.staff_admin_menu_management_pending_v1", "public.staff_admin_dashboard_counts_v1", "public.staff_admin_social_policies_v1"],
  "Admin P3E / P3F": ["public.staff_management_grant_console_admission_v2", "public.staff_management_grant_privileged_permission_v2", "public.staff_management_revoke_privileged_permission_v2"],
  "Admin P3H step-up": ["admin_internal.staff_step_up_issue_receipt_v1", "admin_internal.staff_step_up_receipt_status_v1", "admin_internal.staff_step_up_revoke_receipt_v1"],
  "Admin audit / staff management": ["public.staff_management_receipt_use_log_v1", "public.staff_management_list_staff_v1", "public.staff_management_staff_authority_v1", "public.staff_admin_audit_log_v1"],
  "ADMIN-MRB preview reads": ["public.staff_management_staff_authority_v1", "public.staff_management_permission_catalog_v1"]
});
/** Reviewed SECURITY DEFINER findings that are frozen, intentional contracts. New findings block. */
export const REVIEWED_DEFINER_FINDINGS = Object.freeze({
  "restaurant_internal.consumer_branch_current_temporal_state_v1":
    "RA-2H-P3: anon-readable Consumer catalogue evaluates branch state through this wrapper; returns OPEN/CLOSED/UNKNOWN only, PUBLIC revoked, exact anon/authenticated grants"
});
/** Versioned identifiers in runtime source that are not database objects. */
export const NON_DB_VERSIONED_IDENTIFIERS = Object.freeze([
  "highest_management_operational_v1", "platform_operations_manager_v1", "restaurant_operations_manager_v1",
  "nutrition_manager_v1", "social_safety_manager_v1", "audit_security_manager_v1",
  "staff_high_privilege_management_v1", "meal_photo_analysis_provider_output_v1"
]);

/** Classification of a defined object that no current runtime source references. No deletion implied. */
export function classifyUnreferenced(obj, otherMigrationRefs, usedInPolicy = false) {
  const [schema, name] = obj.name.split(".");
  if (/group_table|meal_sharing_allocations/.test(name)) return "POST_MVP_FRAGMENT";
  if (usedInPolicy) return "CURRENT_AUTHORITY_INFRASTRUCTURE";
  if (/audit|_log$|_logs$|history|outbox|receipt/.test(name)) return "AUDIT_GOVERNANCE";
  if (schema !== "public") return "CURRENT_AUTHORITY_INFRASTRUCTURE";
  if (obj.kind === "function" && /^(bump_|enforce_|prevent_|consumer_set_updated_at|set_updated_at)/.test(name)) return "MIGRATION_INTERNAL";
  if (/^restaurant_internal_|^staff_|^platform_admin_/.test(name)) return "CURRENT_AUTHORITY_INFRASTRUCTURE";
  if (/^(private_|candidate_|legacy_)/.test(name) || otherMigrationRefs > 0) return "HISTORICAL_BUT_REQUIRED";
  if (obj.kind === "function") return "POSSIBLY_DEAD";
  return "UNKNOWN";
}

export function securityDefinerAudit(definitions) {
  const grants = new Map(), revokes = new Map();
  for (const { facts } of definitions.parsed) {
    for (const g of facts.functionGrants) for (const fn of g.functions) grants.set(fn, new Set([...(grants.get(fn) ?? []), ...g.roles]));
    for (const g of facts.functionRevokes) for (const fn of g.functions) revokes.set(fn, new Set([...(revokes.get(fn) ?? []), ...g.roles]));
  }
  const rows = [];
  for (const obj of definitions.objects.values()) {
    if (obj.kind !== "function" || obj.dropped) continue;
    const g = [...(grants.get(obj.name) ?? [])], r = [...(revokes.get(obj.name) ?? [])];
    const inPrivateSchema = !obj.name.startsWith("public.");
    const findings = [];
    if (obj.securityDefiner && !obj.searchPath) findings.push("SECURITY DEFINER without a pinned search_path");
    if (obj.securityDefiner && g.includes("anon")) findings.push("SECURITY DEFINER executable by anon");
    if (obj.securityDefiner && g.includes("PUBLIC")) findings.push("SECURITY DEFINER EXECUTE granted to PUBLIC");
    if (obj.securityDefiner && !inPrivateSchema && !r.includes("PUBLIC")) findings.push("public SECURITY DEFINER with no statically visible REVOKE FROM PUBLIC");
    rows.push({ name: obj.name, securityDefiner: Boolean(obj.securityDefiner), searchPath: obj.searchPath, executeGrants: g, executeRevokes: r, firstMigration: obj.firstMigration, findings });
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const definitions = collectDefinitions();
  const references = collectReferences();
  const classified = classify(definitions, references);
  const definer = securityDefinerAudit(definitions);
  const blocking = classified.filter((r) => r.status === "POSSIBLE_MISSING_CONTRACT" && r.context === "runtime");
  const unresolvedRuntime = classified.filter((r) => r.status === "UNRESOLVED_NAME" && r.context === "runtime" && !NON_DB_VERSIONED_IDENTIFIERS.includes(r.name));
  const referenced = new Set(classified.filter((r) => r.status === "DEFINED_LOCAL").flatMap((r) => (r.definedAs ?? "").split("; ").map((s) => s.split(" ")[0])));
  const runtimeReferenced = new Set(classified.filter((r) => r.status === "DEFINED_LOCAL" && r.context === "runtime").flatMap((r) => (r.definedAs ?? "").split("; ").map((s) => s.split(" ")[0])));
  const chainGaps = Object.entries(PRINCIPAL_CHAINS).flatMap(([chain, names]) => names
    .filter((n) => !definitions.objects.has(n) || definitions.objects.get(n).dropped || !runtimeReferenced.has(n))
    .map((n) => `${chain}: ${n} ${!definitions.objects.has(n) ? "not defined" : definitions.objects.get(n).dropped ? "dropped" : "not referenced by current runtime"}`));
  const unreviewedDefiner = definer.filter((d) => d.findings.length && !Object.hasOwn(REVIEWED_DEFINER_FINDINGS, d.name));
  const sqlText = definitions.parsed.map((p) => ({ file: p.file, text: p.text.toLowerCase() }));
  const unreferenced = [...definitions.objects.values()].filter((o) => !o.dropped && !runtimeReferenced.has(o.name)).map((o) => {
    const bare = o.name.split(".")[1];
    const otherRefs = sqlText.filter((p) => p.file !== o.firstMigration && p.text.includes(bare)).length;
    const usedInPolicy = o.kind === "function" && sqlText.some((p) => new RegExp(`create\\s+policy[^;]*\\b${bare}\\s*\\(`).test(p.text));
    return { name: o.name, kind: o.kind, firstMigration: o.firstMigration, class: classifyUnreferenced(o, otherRefs, usedInPolicy) };
  });
  const inventory = [...definitions.state.entries()].filter(([t, s]) => t.startsWith("public.") && s.kind === "table").map(([t, s]) => ({
    table: t,
    createdIn: definitions.objects.get(t)?.firstMigration ?? null,
    rlsEnabled: s.enabled, rlsForced: s.forced,
    policies: [...s.policies.values()].map((p) => `${p.name}:${p.cmd}:${p.roles.join("|")}`),
    grants: Object.fromEntries([...s.grants.entries()].filter(([, v]) => v.size).map(([role, v]) => [role, [...v].sort()])),
    runtimeReferenced: referenced.has(t)
  }));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ inventory, references: classified, securityDefiner: definer, unreferenced, chainGaps }, null, 1));
  } else {
    const count = (list, key) => list.reduce((a, x) => ((a[x[key]] = (a[x[key]] ?? 0) + 1), a), {});
    console.log("definitions:", JSON.stringify(count([...definitions.objects.values()], "kind")), "| runtime source files:", references.sources);
    console.log("reference classes:", JSON.stringify(count(classified, "status")));
    console.log("public tables:", inventory.length, "| RLS enabled:", inventory.filter((t) => t.rlsEnabled).length, "| forced:", inventory.filter((t) => t.rlsForced).length);
    console.log("SECURITY DEFINER functions:", definer.filter((d) => d.securityDefiner).length, "| with findings:", definer.filter((d) => d.findings.length).length);
    for (const d of definer.filter((x) => x.findings.length)) console.log(`${Object.hasOwn(REVIEWED_DEFINER_FINDINGS, d.name) ? "REVIEWED" : "FINDING"} ${d.name}: ${d.findings.join("; ")}`);
    for (const r of unresolvedRuntime) console.log(`UNRESOLVED ${r.name} (${r.file})`);
    for (const r of blocking) console.log(`MISSING ${r.kind} ${r.name} (${r.how}, ${r.file})`);
    for (const g of chainGaps) console.log(`CHAIN GAP ${g}`);
    console.log(`principal chains: ${Object.keys(PRINCIPAL_CHAINS).length} (${Object.values(PRINCIPAL_CHAINS).flat().length} objects), gaps: ${chainGaps.length}`);
    console.log("unreferenced by current runtime (report only, nothing deleted):", JSON.stringify(count(unreferenced, "class")));
    const failed = blocking.length + chainGaps.length + unreviewedDefiner.length;
    console.log(JSON.stringify({ suite: "db-object-contract-scan", blockingMissingContracts: blocking.length, chainGaps: chainGaps.length, unreviewedDefinerFindings: unreviewedDefiner.length, unresolvedRuntimeNames: unresolvedRuntime.length, networkUsed: false, databaseUsed: false }));
    process.exitCode = failed ? 1 : 0;
  }
}
