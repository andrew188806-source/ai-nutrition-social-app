#!/usr/bin/env node
// GQA-3 public-schema Data API / GRANT contract guard.
//
// Historical migrations (the 139 files recorded in db-migration-baseline-manifest.json, i.e. everything
// present at the GQA-3 baseline commit) are frozen and grandfathered: they must stay byte-identical, and
// their older grant conventions are not re-judged. Every migration added AFTER that baseline must:
//   * be named <14-digit timestamp>_<snake_case>.sql, with a unique timestamp later than every historical one;
//   * never use GRANT ALL / GRANT ... ON ALL TABLES IN SCHEMA / ALTER DEFAULT PRIVILEGES ... GRANT;
//   * declare, for every public table it introduces (CREATE TABLE, RENAME TO, SET SCHEMA public, including
//     inside DO blocks and EXECUTE strings), exactly one marker
//       -- TASTKIND_DATA_API: public.<table> mode=<MODE> rls=<ENABLED|FORCED> [justification="..."]
//   * declare, for every EXISTING public table whose grants, policies or RLS it changes, one marker
//       -- TASTKIND_DATA_API_CHANGE: public.<table> mode=<MODE> rls=<ENABLED|FORCED> [justification="..."]
//   * make the resulting SQL state of every marked table satisfy its mode (see MODE_RULES below).
// The boundary is the committed manifest, not a date and not origin/main, so it stays valid after push.
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_API_MODES, MIGRATION_NAME, RLS_MODES, WRITE_PRIVILEGES, foldSecurityState, parseMarkers, parseMigration
} from "./db-contract-sql.mjs";
import {
  GQA3_MIGRATION_BASELINE, MIGRATIONS_DIR, ROOT, aggregateOf, lfSha256, manifestFromBaselineTree, readManifest
} from "./db-migration-baseline-manifest.mjs";

const CRUD = new Set(["select", ...WRITE_PRIVILEGES]);
const SAFE_TABLE_NAME = /^public\.[a-z_][a-z0-9_]*$/;
const setOf = (state, role) => [...(state.grants.get(role) ?? new Set())];
const applies = (policy, role) => policy.roles.includes(role) || policy.roles.includes("PUBLIC");
const hasPolicy = (state, cmd, role) => [...state.policies.values()].some((p) => (p.cmd === cmd || p.cmd === "all") && applies(p, role));

/** Validate one table's cumulative state against its declared mode. Returns failure strings. */
export function validateTableMode(table, marker, state, migrationFacts) {
  const f = [];
  const fail = (reason) => f.push(`${table}: ${reason}`);
  if (!state || state.kind === "view") { fail("marker names no table in the resulting schema"); return f; }
  if (!state.enabled) fail(`RLS decision ${marker.rls} but row level security is not enabled`);
  if (marker.rls === "FORCED" && !state.forced) fail("rls=FORCED but FORCE ROW LEVEL SECURITY is absent");
  const anon = setOf(state, "anon"), auth = setOf(state, "authenticated"), svc = setOf(state, "service_role"), pub = setOf(state, "PUBLIC");
  const custom = [...state.grants.entries()].filter(([role, set]) => !["anon", "authenticated", "service_role", "PUBLIC"].includes(role) && set.size);
  if (pub.length) fail(`PUBLIC holds table privileges (${pub.join(",")})`);
  for (const [role, set] of [["anon", anon], ["authenticated", auth], ["service_role", svc]]) {
    const beyond = set.filter((p) => !CRUD.has(p));
    if (beyond.length) fail(`${role} holds non-CRUD privileges (${beyond.join(",")})`);
  }
  const revokedFrom = (role) => migrationFacts.tableRevokes.some((r) => r.tables.includes(table) && r.roles.includes(role));
  const clientPolicies = [...state.policies.values()].filter((p) => ["anon", "authenticated", "PUBLIC"].some((r) => applies(p, r)));
  switch (marker.mode) {
    case "SEALED_RPC_ONLY":
    case "SERVER_ONLY": {
      if (anon.length) fail(`${marker.mode} but anon holds ${anon.join(",")}`);
      if (auth.length) fail(`${marker.mode} but authenticated holds ${auth.join(",")}`);
      if (marker.kind === "create" && (!revokedFrom("anon") || !revokedFrom("authenticated"))) fail(`${marker.mode} requires an explicit REVOKE from anon and authenticated`);
      if (clientPolicies.length) fail(`${marker.mode} but a policy applies to a client role (${clientPolicies.map((p) => p.name).join(",")})`);
      if (marker.mode === "SEALED_RPC_ONLY") {
        if (svc.length) fail(`SEALED_RPC_ONLY but service_role holds ${svc.join(",")}`);
        if (marker.rls !== "FORCED") fail("SEALED_RPC_ONLY requires rls=FORCED");
      } else {
        if (!svc.length && !custom.length) fail("SERVER_ONLY requires an explicit grant to service_role or a named server role");
      }
      break;
    }
    case "AUTHENTICATED_READ": {
      if (anon.length) fail(`AUTHENTICATED_READ but anon holds ${anon.join(",")}`);
      if (!(auth.length === 1 && auth[0] === "select")) fail(`AUTHENTICATED_READ requires exactly SELECT for authenticated (has ${auth.join(",") || "nothing"})`);
      if (!hasPolicy(state, "select", "authenticated")) fail("AUTHENTICATED_READ requires a SELECT policy for authenticated on this table");
      if (custom.length) fail(`AUTHENTICATED_READ table grants a custom role (${custom.map(([r]) => r).join(",")})`);
      break;
    }
    case "AUTHENTICATED_READ_WRITE": {
      if (anon.length) fail(`AUTHENTICATED_READ_WRITE but anon holds ${anon.join(",")}`);
      if (!auth.includes("select")) fail("AUTHENTICATED_READ_WRITE requires SELECT for authenticated");
      const writes = auth.filter((p) => WRITE_PRIVILEGES.includes(p));
      if (!writes.length) fail("AUTHENTICATED_READ_WRITE requires at least one write grant (otherwise declare AUTHENTICATED_READ)");
      for (const op of ["select", ...writes]) if (!hasPolicy(state, op, "authenticated")) fail(`AUTHENTICATED_READ_WRITE grants ${op.toUpperCase()} without a matching policy for authenticated`);
      if (custom.length) fail(`AUTHENTICATED_READ_WRITE table grants a custom role (${custom.map(([r]) => r).join(",")})`);
      break;
    }
    case "PUBLIC_READ": {
      if (!marker.justification) fail("PUBLIC_READ requires justification=\"...\"");
      if (!(anon.length === 1 && anon[0] === "select")) fail(`PUBLIC_READ requires exactly SELECT for anon (has ${anon.join(",") || "nothing"})`);
      if (auth.some((p) => p !== "select")) fail("PUBLIC_READ allows at most SELECT for authenticated");
      if (!hasPolicy(state, "select", "anon")) fail("PUBLIC_READ requires a SELECT policy that applies to anon");
      if (custom.length) fail(`PUBLIC_READ table grants a custom role (${custom.map(([r]) => r).join(",")})`);
      break;
    }
    default: fail(`unknown mode ${marker.mode}`);
  }
  return f;
}

/**
 * Evaluate the migration set. `historical` is the manifest; `files` is [{ name, text }] for every
 * migration currently present. Pure: the mutation harness drives it with in-memory fixtures.
 */
export function evaluateMigrations({ manifest, files, currentBlobs = null }) {
  const failures = [], surfaced = [];
  const fail = (m) => failures.push(m);
  const historicalByName = new Map(manifest.entries.map((e) => [path.basename(e.path), e]));
  const present = new Map(files.map((f) => [f.name, f]));
  // 1. Historical immutability.
  for (const [name, entry] of historicalByName) {
    const file = present.get(name);
    if (!file) { fail(`historical migration removed or renamed: ${name}`); continue; }
    if (lfSha256(Buffer.from(file.text, "utf8")) !== entry.sha256) fail(`historical migration edited: ${name}`);
    if (currentBlobs && currentBlobs[name] && currentBlobs[name] !== entry.blob) fail(`historical migration blob changed: ${name}`);
  }
  // 2. Naming, uniqueness and ordering.
  const stamps = new Map();
  for (const f of files) {
    const m = f.name.match(MIGRATION_NAME);
    if (!m) { fail(`migration name does not follow <14-digit timestamp>_<snake_case>.sql: ${f.name}`); continue; }
    stamps.set(m[1], [...(stamps.get(m[1]) ?? []), f.name]);
  }
  for (const [stamp, names] of stamps) if (names.length > 1) fail(`duplicate migration timestamp ${stamp}: ${names.join(", ")}`);
  const maxHistorical = [...historicalByName.keys()].map((n) => n.slice(0, 14)).sort().at(-1);
  const newFiles = files.filter((f) => !historicalByName.has(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const f of newFiles) if (MIGRATION_NAME.test(f.name) && f.name.slice(0, 14) <= maxHistorical) fail(`new migration ${f.name} does not sort after the last historical migration (${maxHistorical})`);
  // 3. Per-migration Data API contract for new migrations, over the cumulative state.
  const orderedHistorical = files.filter((f) => historicalByName.has(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const parsedSoFar = orderedHistorical.map((f) => parseMigration(f.text));
  const historicalState = foldSecurityState(parsedSoFar);
  for (const f of newFiles) {
    const before = foldSecurityState(parsedSoFar);
    const facts = parseMigration(f.text);
    parsedSoFar.push(facts);
    const after = foldSecurityState(parsedSoFar);
    const { markers, malformed } = parseMarkers(f.text);
    const where = (m) => `${f.name}: ${m}`;
    for (const line of malformed) fail(where(`malformed Data API marker: ${line}`));
    if (facts.broadGrants.length) fail(where(`broad grant is not allowed: ${facts.broadGrants[0]}`));
    if (facts.defaultPrivilegeGrants.length) fail(where(`ALTER DEFAULT PRIVILEGES ... GRANT is not allowed: ${facts.defaultPrivilegeGrants[0]}`));
    if (facts.unknownPrivileges.length) fail(where(`unrecognized privilege: ${facts.unknownPrivileges[0]}`));
    for (const r of facts.rls) if (r.table.startsWith("public.") && (r.action === "disable" || r.action === "no force")) fail(where(`${r.table}: weakening row level security (${r.action}) requires a Planner decision`));
    // Public tables this migration introduces.
    const introduced = new Set();
    for (const t of facts.createdTables) if (t.startsWith("public.")) introduced.add(t);
    for (const { from, to } of facts.renamedTables) if (to.startsWith("public.")) { introduced.add(to); introduced.delete(from); }
    for (const { to } of facts.schemaMovedTables) if (to.startsWith("public.")) introduced.add(to);
    for (const t of [...introduced]) if (!after.has(t)) introduced.delete(t);
    // Existing public tables whose security surface this migration touches.
    const touched = new Set();
    const touch = (t) => { if (t.startsWith("public.") && !introduced.has(t) && before.get(t)?.kind !== "view" && after.get(t)?.kind !== "view") touched.add(t); };
    facts.tableGrants.forEach((g) => g.tables.forEach(touch));
    facts.tableRevokes.forEach((g) => g.tables.forEach(touch));
    facts.policies.forEach((p) => touch(p.table));
    facts.droppedPolicies.forEach((p) => touch(p.table));
    facts.rls.forEach((r) => touch(r.table));
    for (const t of [...touched]) if (!before.has(t) && !historicalState.has(t)) touched.delete(t);
    // Marker bookkeeping.
    const seen = new Map();
    for (const mk of markers) {
      if (!SAFE_TABLE_NAME.test(mk.table)) { fail(where(`marker must name one exact public table: ${mk.raw}`)); continue; }
      if (seen.has(mk.table)) { fail(where(`duplicate Data API marker for ${mk.table}`)); continue; }
      seen.set(mk.table, mk);
      if (!DATA_API_MODES.includes(mk.mode)) fail(where(`unknown Data API mode ${mk.mode} for ${mk.table}`));
      if (!RLS_MODES.includes(mk.rls)) fail(where(`unknown RLS decision ${mk.rls} for ${mk.table}`));
      if (mk.kind === "create" && !introduced.has(mk.table)) fail(where(`TASTKIND_DATA_API marker names ${mk.table}, which this migration does not introduce`));
      if (mk.kind === "change" && !touched.has(mk.table)) fail(where(`TASTKIND_DATA_API_CHANGE marker names ${mk.table}, whose security surface this migration does not change`));
    }
    for (const t of introduced) {
      const mk = seen.get(t);
      if (!mk || mk.kind !== "create") { fail(where(`new public table ${t} has no TASTKIND_DATA_API decision`)); continue; }
      if (DATA_API_MODES.includes(mk.mode) && RLS_MODES.includes(mk.rls)) validateTableMode(t, mk, after.get(t), facts).forEach((x) => fail(where(x)));
    }
    for (const t of touched) {
      const mk = seen.get(t);
      if (!mk || mk.kind !== "change") { fail(where(`existing public table ${t} changes grants/policies/RLS without a TASTKIND_DATA_API_CHANGE decision`)); continue; }
      if (DATA_API_MODES.includes(mk.mode) && RLS_MODES.includes(mk.rls)) validateTableMode(t, mk, after.get(t), facts).forEach((x) => fail(where(x)));
      surfaced.push(`${f.name}: existing table ${t} re-declared as ${mk.mode}`);
    }
    for (const v of facts.views) if (v.startsWith("public.")) surfaced.push(`${f.name}: public view ${v} (review Data API exposure; views carry no RLS of their own)`);
    for (const g of facts.functionGrants) if (g.roles.some((r) => r === "anon" || r === "PUBLIC")) surfaced.push(`${f.name}: EXECUTE granted to ${g.roles.join(",")} on ${g.functions.join(",")}`);
  }
  return { failures, surfaced, newMigrations: newFiles.map((f) => f.name), historicalCount: historicalByName.size };
}

export function readRepositoryMigrations(root = ROOT) {
  const dir = path.join(root, MIGRATIONS_DIR);
  return fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = readManifest();
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}${pass || !detail ? "" : `\n     ${JSON.stringify(detail).slice(0, 1200)}`}`); };
  check("committed manifest is internally consistent", aggregateOf(manifest.entries) === manifest.aggregateSha256 && manifest.entries.length === manifest.count);
  let baselineReachable = true;
  try { cp.execFileSync("git", ["cat-file", "-e", `${GQA3_MIGRATION_BASELINE}^{commit}`], { cwd: ROOT, stdio: "ignore" }); } catch { baselineReachable = false; }
  check("manifest equals the migration tree of the GQA-3 baseline commit",
    baselineReachable && aggregateOf(manifestFromBaselineTree()) === manifest.aggregateSha256 && manifest.baseline === GQA3_MIGRATION_BASELINE,
    { baselineReachable });
  const files = readRepositoryMigrations();
  const blobs = Object.fromEntries(files.map((f) => [f.name, cp.execFileSync("git", ["hash-object", "--", path.join(MIGRATIONS_DIR, f.name)], { cwd: ROOT, encoding: "utf8" }).trim()]));
  const result = evaluateMigrations({ manifest, files, currentBlobs: blobs });
  check(`historical migrations are frozen (${result.historicalCount} files byte-identical, none removed or renamed)`,
    !result.failures.some((x) => /^historical migration/.test(x)), result.failures.filter((x) => /^historical migration/.test(x)));
  check("migration names, timestamps and ordering are valid", !result.failures.some((x) => /migration name|duplicate migration timestamp|does not sort after/.test(x)),
    result.failures.filter((x) => /migration name|duplicate migration timestamp|does not sort after/.test(x)));
  check(`every post-baseline migration satisfies the public Data API contract (${result.newMigrations.length} new)`,
    result.failures.every((x) => /^historical migration|migration name|duplicate migration timestamp|does not sort after/.test(x)),
    result.failures.filter((x) => !/^historical migration|migration name|duplicate migration timestamp|does not sort after/.test(x)));
  for (const s of result.surfaced) console.log(`SURFACED ${s}`);
  const failed = checks.filter((c) => !c.pass).length;
  console.log(JSON.stringify({ suite: "public-schema-data-api-grant-guard", total: checks.length, failed, historical: result.historicalCount, newMigrations: result.newMigrations, surfaced: result.surfaced.length, networkUsed: false, databaseUsed: false }));
  process.exitCode = failed ? 1 : 0;
}
