#!/usr/bin/env node
// SR-1B-D1 contract smoke — INTERNAL CANDIDATE AUTHORIZATION DATABASE AUTHORITY.
//
// WHAT THIS IS. No PostgreSQL runtime exists on this machine, so this suite does not claim to have
// executed the migration. It PARSES the migration and compiles its authority-bearing declarations —
// the eight predicate conjuncts, the column grants, the role attributes, the role-scoped policies
// and the schema-exposure posture — into an executable model, then runs the canonical authorization
// matrix against it.
//
// Every rule exercised is derived from the migration's bytes at run time, so removing a conjunct or
// widening a grant changes smoke BEHAVIOUR rather than only tripping a text assertion. Live
// PostgreSQL enforcement is proven separately against Development.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const MIGRATION = "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql";
const raw = fs.readFileSync(path.join(root, MIGRATION), "utf8");
const sql = raw.split("\n").map((l) => {
  const t = l.trim(); if (t.startsWith("--")) return "";
  const a = l.indexOf("--"); return a === -1 ? l : l.slice(0, a);
}).join("\n");

const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

// ============ compile the declared authority ======================================================
const setBody = (sql.match(/create function social_internal\.authorized_candidates[\s\S]*?\n\$\$;/i) ?? [""])[0];

// Each conjunct is detected in the migration text and becomes a live predicate in the model.
const conjuncts = {
  notSelf: /candidate\.user_id <> p_actor_user_id/i.test(setBody),
  actorActive: /exists \(\s*select 1 from public\.consumer_profiles as cp\s*where cp\.user_id = p_actor_user_id and cp\.status = 'active' and cp\.deleted_at is null\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  actorNoBadRow: /not exists \(\s*select 1 from public\.consumer_profiles as cp\s*where cp\.user_id = p_actor_user_id and \(cp\.status <> 'active' or cp\.deleted_at is not null\)\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  actorOptedIn: /exists \(\s*select 1 from public\.social_participation as sp\s*where sp\.user_id = p_actor_user_id and sp\.state = 'opted_in'\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  candidateActive: /exists \(\s*select 1 from public\.consumer_profiles as cp\s*where cp\.user_id = candidate\.user_id and cp\.status = 'active' and cp\.deleted_at is null\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  candidateNoBadRow: /not exists \(\s*select 1 from public\.consumer_profiles as cp\s*where cp\.user_id = candidate\.user_id and \(cp\.status <> 'active' or cp\.deleted_at is not null\)\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  candidateOptedIn: /exists \(\s*select 1 from public\.social_participation as sp\s*where sp\.user_id = candidate\.user_id and sp\.state = 'opted_in'\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  outboundBlock: /not exists \(\s*select 1 from public\.social_blocks as sb\s*where sb\.blocker_user_id = p_actor_user_id and sb\.blocked_user_id = candidate\.user_id\s*\)/i.test(setBody.replace(/\s+/g, " ")),
  inboundBlock: /not exists \(\s*select 1 from public\.social_blocks as sb\s*where sb\.blocker_user_id = candidate\.user_id and sb\.blocked_user_id = p_actor_user_id\s*\)/i.test(setBody.replace(/\s+/g, " "))
};
const deduplicates = /select distinct candidate\.user_id/i.test(setBody);
const ordered = /order by 1;/i.test(setBody);
const pairDelegates = /from social_internal\.authorized_candidates\(p_actor_user_id, array\[p_candidate_user_id\]\)/i.test(sql);
const returnsBooleanOnly = /returns boolean/i.test(sql) && !/denial_reason|reason_code|failure_reason/i.test(sql);

const columnGrants = Object.fromEntries(
  [...sql.matchAll(/grant select \(([^)]*)\) on table public\.([a-z_]+) to social_authority;/gi)]
    .map((m) => [m[2], m[1].split(",").map((c) => c.trim())])
);
const roleAttributes = ((sql.match(/create role social_authority with([\s\S]*?);/i) ?? [])[1] ?? "").toLowerCase();
const policyRoles = [...sql.matchAll(/create policy [a-z_]+ on public\.([a-z_]+)\s*\n?\s*for select to ([a-z_]+) using \(([^;]*?)\);/gi)]
  .map((m) => ({ table: m[1], role: m[2], using: m[3].trim() }));
const schemaExposedToClients = /grant[^;]*on schema social_internal[^;]*to[^;]*(public|anon|authenticated|authenticator)/i.test(sql);
const executeGrantedToClients = /grant execute[^;]*to[^;]*(public|anon|authenticated|authenticator|service_role)/i.test(sql);

// ============ the model ===========================================================================
// A tiny world: accounts, participation and blocks; the predicate is assembled from the conjuncts
// actually present in the migration.
function authorize(world, actor, candidates) {
  const profileRows = (u) => world.profiles.filter((p) => p.user_id === u);
  const activeRow = (u) => profileRows(u).some((p) => p.status === "active" && p.deleted_at === null);
  const badRow = (u) => profileRows(u).some((p) => p.status !== "active" || p.deleted_at !== null);
  const optedIn = (u) => world.participation.some((p) => p.user_id === u && p.state === "opted_in");
  const blocked = (a, b) => world.blocks.some((x) => x.blocker_user_id === a && x.blocked_user_id === b);

  let list = candidates.filter((c) => c !== null && c !== undefined);
  if (deduplicates) list = [...new Set(list)];
  if (actor === null || actor === undefined) return [];

  const out = list.filter((c) => {
    if (conjuncts.notSelf && c === actor) return false;
    if (conjuncts.actorActive && !activeRow(actor)) return false;
    if (conjuncts.actorNoBadRow && badRow(actor)) return false;
    if (conjuncts.actorOptedIn && !optedIn(actor)) return false;
    if (conjuncts.candidateActive && !activeRow(c)) return false;
    if (conjuncts.candidateNoBadRow && badRow(c)) return false;
    if (conjuncts.candidateOptedIn && !optedIn(c)) return false;
    if (conjuncts.outboundBlock && blocked(actor, c)) return false;
    if (conjuncts.inboundBlock && blocked(c, actor)) return false;
    return true;
  });
  return ordered ? out.slice().sort() : out;
}
const mayEvaluate = (world, a, b) => (pairDelegates ? authorize(world, a, [b]).length > 0 : null);

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const C = "cccccccc-0000-0000-0000-00000000000c";
const active = (u) => ({ user_id: u, status: "active", deleted_at: null });
const joined = (u) => ({ user_id: u, state: "opted_in" });
const base = () => ({ profiles: [active(A), active(B)], participation: [joined(A), joined(B)], blocks: [] });

// ============ 0. the compiled authority is well-formed ============================================
expect(Object.values(conjuncts).every(Boolean),
  "0 all eight canonical conjuncts were compiled from the migration",
  Object.entries(conjuncts).filter(([, v]) => !v).map(([k]) => k));
expect(deduplicates, "0a duplicate candidate inputs are collapsed by DISTINCT");
expect(pairDelegates, "0b the pair predicate delegates to the set primitive — one implementation");
expect(returnsBooleanOnly, "0c the pair predicate returns a bare boolean with no denial reason");
expect(/nologin/.test(roleAttributes) && /noinherit/.test(roleAttributes)
  && /nobypassrls/.test(roleAttributes) && /nosuperuser/.test(roleAttributes),
  "0d the authority role is NOLOGIN / NOINHERIT / NOBYPASSRLS / NOSUPERUSER", roleAttributes.trim());
expect(Object.keys(columnGrants).length === 3
  && Object.values(columnGrants).reduce((n, c) => n + c.length, 0) === 7,
  "0e exactly seven columns across three tables are readable by the authority", columnGrants);
expect(policyRoles.length === 3 && policyRoles.every((p) => p.role === "social_authority"),
  "0f all three added policies are scoped to the authority role only",
  policyRoles.map((p) => `${p.table}:${p.role}`));
expect(!schemaExposedToClients, "0g no client role receives schema access");
expect(!executeGrantedToClients, "0h EXECUTE is granted to no client role and not to service_role");

// ============ 1. the authorized case ==============================================================
expect(mayEvaluate(base(), A, B) === true,
  "1 active + opted-in A and B with no blocks → authorized");

// ============ 2-6. actor-side denial ==============================================================
expect(mayEvaluate(base(), A, A) === false, "2 self-comparison is denied");
{
  const w = base(); w.participation = w.participation.filter((p) => p.user_id !== A);
  expect(mayEvaluate(w, A, B) === false, "3 actor with NO participation row is denied");
}
{
  const w = base(); w.participation = [{ user_id: A, state: "paused" }, joined(B)];
  expect(mayEvaluate(w, A, B) === false, "4 PAUSED actor is denied — no invisible browsing");
}
{
  const w = base(); w.profiles = [{ user_id: A, status: "disabled", deleted_at: null }, active(B)];
  expect(mayEvaluate(w, A, B) === false, "5 non-active actor account is denied");
}
{
  const w = base(); w.profiles = [{ user_id: A, status: "active", deleted_at: "2026-08-01" }, active(B)];
  expect(mayEvaluate(w, A, B) === false, "6 soft-deleted actor is denied");
}
{
  // the unenforced user_id uniqueness must not be exploitable
  const w = base(); w.profiles = [active(A), { user_id: A, status: "deleted", deleted_at: "2026-08-01" }, active(B)];
  expect(mayEvaluate(w, A, B) === false,
    "6a an actor holding BOTH an active and a deleted profile row is denied — fail closed");
}

// ============ 7-12. candidate-side denial =========================================================
{
  const w = base(); w.participation = [joined(A)];
  expect(mayEvaluate(w, A, B) === false, "7 candidate with NO participation row is denied");
}
{
  const w = base(); w.participation = [joined(A), { user_id: B, state: "paused" }];
  expect(mayEvaluate(w, A, B) === false, "8 PAUSED candidate is denied");
}
{
  const w = base(); w.profiles = [active(A), { user_id: B, status: "anonymizing", deleted_at: null }];
  expect(mayEvaluate(w, A, B) === false, "9 non-active candidate account is denied");
}
{
  const w = base(); w.profiles = [active(A), { user_id: B, status: "active", deleted_at: "2026-08-01" }];
  expect(mayEvaluate(w, A, B) === false, "10 soft-deleted candidate is denied");
}
{
  const w = base(); w.profiles = [active(A)]; w.participation = [joined(A)];
  expect(mayEvaluate(w, A, B) === false, "11 nonexistent candidate is denied");
}
{
  const w = base(); w.blocks = [{ blocker_user_id: A, blocked_user_id: B }];
  expect(mayEvaluate(w, A, B) === false, "12 A→B block denies");
}
{
  const w = base(); w.blocks = [{ blocker_user_id: B, blocked_user_id: A }];
  expect(mayEvaluate(w, A, B) === false,
    "12a B→A REVERSE block denies — the authority sees the direction Mobile cannot");
}

// ============ 13-16. batch semantics ==============================================================
{
  const w = { profiles: [active(A), active(B), active(C)], participation: [joined(A), joined(B)], blocks: [] };
  const result = authorize(w, A, [B, C, A]);
  expect(result.length === 1 && result[0] === B,
    "13 a mixed candidate set returns only the authorized subset — self and non-participant omitted", result);
}
{
  const w = base();
  const once = authorize(w, A, [B]);
  const many = authorize(w, A, [B, B, B]);
  expect(JSON.stringify(once) === JSON.stringify(many),
    "14 duplicate candidate inputs are handled deterministically", { once, many });
}
{
  const w = { profiles: [active(A), active(B), active(C)], participation: [joined(A), joined(B), joined(C)], blocks: [] };
  const first = authorize(w, A, [C, B]);
  const second = authorize(w, A, [B, C]);
  expect(JSON.stringify(first) === JSON.stringify(second),
    "15 result order does not depend on input order — deterministic, and carries no ranking meaning", { first, second });
}
{
  const w = base();
  const result = authorize(w, A, [B]);
  expect(Array.isArray(result) && result.every((r) => typeof r === "string"),
    "16 the batch result is a bare id list — no per-candidate denial reason map", result);
}

// ============ 17-18. actor-side denial short-circuits the whole set ==============================
{
  const w = { profiles: [active(A), active(B), active(C)], participation: [{ user_id: A, state: "paused" }, joined(B), joined(C)], blocks: [] };
  expect(authorize(w, A, [B, C]).length === 0,
    "17 an ineligible actor authorizes NOTHING — candidate state is never disclosed through the result");
}
expect(authorize(base(), null, [B]).length === 0, "18 a null actor authorizes nothing");

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({
  smoke: "social-candidate-authorization-sr1b-d1",
  proofKind: "static semantic model compiled from the migration",
  liveDatabaseExecuted: false,
  outstandingAcceptance: "PostgreSQL enforcement of the role, policies, grants and schema exposure requires Development execution",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
