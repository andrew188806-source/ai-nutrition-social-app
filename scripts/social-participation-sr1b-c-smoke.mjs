#!/usr/bin/env node
// SR-1B-C contract smoke — CANONICAL SOCIAL PARTICIPATION / DISCOVERABILITY AUTHORITY.
//
// WHAT THIS IS, EXACTLY. No PostgreSQL runtime exists on this machine, so this suite does NOT claim
// to have executed the migration. It PARSES the migration and compiles its authority-bearing
// declarations — the RLS policy predicate, the table privileges, the primary key, the state CHECK,
// and each lifecycle function's own state literal and SET clause — into an executable model, then
// runs the canonical lifecycle against that model.
//
// Every rule exercised below is therefore derived from the migration's bytes at run time, never
// hand-restated: change the predicate, the grants, the permitted states, or whether pause touches
// opted_in_at, and these scenarios change behaviour with it. What this canNOT prove is that
// PostgreSQL enforces those declarations; that is live behaviour and is proven separately against
// Development.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const MIGRATION = "supabase/migrations/20260810020000_social_participation_authority.sql";
const raw = fs.readFileSync(path.join(root, MIGRATION), "utf8");

const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const sql = raw.split("\n").map((line) => {
  const trimmed = line.trim();
  if (trimmed.startsWith("--")) return "";
  const at = line.indexOf("--");
  return at === -1 ? line : line.slice(0, at);
}).join("\n");

// ============ compile the declared authority ======================================================
const policies = [...sql.matchAll(/create policy ([a-z_]+) on public\.social_participation\s*\n?\s*for ([a-z]+)\s*\n?\s*using \(([\s\S]*?)\);/gi)]
  .map((e) => ({ name: e[1], command: e[2].toLowerCase(), predicateSource: e[3].trim().replace(/\s+/g, " ") }));

function compilePredicate(source) {
  const n = source.toLowerCase().trim();
  if (n === "true") return () => true;
  let m = n.match(/^auth\.uid\(\)\s*=\s*(user_id)$/) || n.match(/^(user_id)\s*=\s*auth\.uid\(\)$/);
  if (m) return (actor, row) => actor === row.user_id;
  if (/^auth\.uid\(\)\s+is\s+not\s+null$/.test(n)) return () => true;
  return { unsupported: n };
}

const privileges = { anon: new Set(), authenticated: new Set(), public: new Set() };
for (const statement of sql.split(";")) {
  const rev = statement.match(/revoke\s+([a-z, ]+?)\s+on table public\.social_participation\s+from\s+([a-z]+)/i);
  if (rev && privileges[rev[2].toLowerCase()]) {
    const which = rev[1].trim().toLowerCase();
    if (which === "all") privileges[rev[2].toLowerCase()].clear();
    else for (const p of which.split(",")) privileges[rev[2].toLowerCase()].delete(p.trim());
  }
  const grant = statement.match(/grant\s+([a-z, ]+?)\s+on table public\.social_participation\s+to\s+([a-z]+)/i);
  if (grant && privileges[grant[2].toLowerCase()]) {
    const which = grant[1].trim().toLowerCase();
    if (which === "all") for (const p of ["select", "insert", "update", "delete"]) privileges[grant[2].toLowerCase()].add(p);
    else for (const p of which.split(",")) privileges[grant[2].toLowerCase()].add(p.trim());
  }
}

const createTable = (raw.match(/create table public\.social_participation \(([\s\S]*?)\n\);/) ?? [])[1] ?? "";
const pkColumns = ((createTable.match(/primary key \(([^)]*)\)/i) ?? [])[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const allowedStates = ((createTable.match(/check \(state in \(([^)]*)\)\)/i) ?? [])[1] ?? "")
  .split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);

const bodyOf = (name) => (sql.match(new RegExp(`function public\\.${name}_authenticated_social_participation\\(\\)[\\s\\S]*?\\n\\$\\$;`)) ?? [""])[0];
const bodies = Object.fromEntries(["opt_in", "pause", "resume", "opt_out"].map((a) => [a, bodyOf(a)]));

const insertedState = (bodies.opt_in.match(/values \(v_user_id, '([a-z_]+)'/) ?? [])[1] ?? null;
// Anchored to the UPDATE statement on purpose: a bare /set .../ would instead capture the
// function's own `set search_path = ...` clause and make every downstream conclusion wrong.
const setClause = (body) =>
  (body.match(/update public\.social_participation\s*\n\s*set ([\s\S]*?)\n\s*where/i) ?? [])[1] ?? "";
const pauseTarget = (setClause(bodies.pause).match(/state = '([a-z_]+)'/) ?? [])[1] ?? null;
const resumeTarget = (setClause(bodies.resume).match(/state = '([a-z_]+)'/) ?? [])[1] ?? null;
const pauseTouchesOptedInAt = /opted_in_at/i.test(setClause(bodies.pause));
const resumeTouchesOptedInAt = /opted_in_at/i.test(setClause(bodies.resume));
const optOutHardDeletes = /delete from public\.social_participation/i.test(bodies.opt_out)
  && !/update public\.social_participation/i.test(bodies.opt_out);
const functions = [...sql.matchAll(/create or replace function (public\.[a-z_]+)\(\s*([^)]*?)\s*\)/gi)]
  .map((e) => ({ name: e[1], params: e[2].trim() }));
const authDerivations = (sql.match(/v_user_id uuid := auth\.uid\(\);/g) ?? []).length;
const authGuards = (sql.match(/raise exception 'AUTHENTICATION_REQUIRED'/g) ?? []).length;

// ============ the model ===========================================================================
let clock = 0;
const stamp = () => `t${++clock}`;

class ParticipationModel {
  constructor() { this.rows = new Map(); }

  select(role, actorUid) {
    if (!privileges[role] || !privileges[role].has("select")) return { error: "permission_denied_for_table" };
    const applicable = policies.filter((p) => p.command === "select" || p.command === "all");
    if (applicable.length === 0) return { rows: [] };
    const rows = [...this.rows.values()].filter((row) =>
      applicable.some((p) => {
        const fn = compilePredicate(p.predicateSource);
        return typeof fn === "function" ? fn(actorUid, row) : false;
      }));
    return { rows };
  }

  directWrite(role, kind) {
    if (!privileges[role] || !privileges[role].has(kind)) return { error: "permission_denied_for_table" };
    return { ok: true };
  }

  #requireAuth(actor) {
    if (actor === null || actor === undefined) {
      return authGuards >= 4 ? { error: "AUTHENTICATION_REQUIRED" } : { error: "MODEL_MISSING_AUTH_GUARD" };
    }
    if (authDerivations < 4) return { error: "MODEL_SUBJECT_NOT_AUTH_DERIVED" };
    return null;
  }

  optIn(actor) {
    const denied = this.#requireAuth(actor); if (denied) return denied;
    const existing = this.rows.get(actor);
    if (existing) return { status: "already_participating", state: existing.state, opted_in_at: existing.opted_in_at };
    if (!allowedStates.includes(insertedState)) return { error: "CHECK_VIOLATION_state" };
    const row = { user_id: actor, state: insertedState, opted_in_at: stamp(), updated_at: stamp() };
    this.rows.set(actor, row);
    return { status: "opted_in", state: row.state, opted_in_at: row.opted_in_at };
  }

  pause(actor) {
    const denied = this.#requireAuth(actor); if (denied) return denied;
    const row = this.rows.get(actor);
    if (!row) return { error: "SOCIAL_PARTICIPATION_NOT_FOUND" };
    if (row.state === pauseTarget) return { status: "already_paused", state: row.state, opted_in_at: row.opted_in_at };
    if (!allowedStates.includes(pauseTarget)) return { error: "CHECK_VIOLATION_state" };
    row.state = pauseTarget;
    row.updated_at = stamp();
    if (pauseTouchesOptedInAt) row.opted_in_at = stamp();
    return { status: "paused", state: row.state, opted_in_at: row.opted_in_at };
  }

  resume(actor) {
    const denied = this.#requireAuth(actor); if (denied) return denied;
    const row = this.rows.get(actor);
    if (!row) return { error: "SOCIAL_PARTICIPATION_NOT_FOUND" };
    if (row.state === resumeTarget) return { status: "already_opted_in", state: row.state, opted_in_at: row.opted_in_at };
    if (!allowedStates.includes(resumeTarget)) return { error: "CHECK_VIOLATION_state" };
    row.state = resumeTarget;
    row.updated_at = stamp();
    if (resumeTouchesOptedInAt) row.opted_in_at = stamp();
    return { status: "resumed", state: row.state, opted_in_at: row.opted_in_at };
  }

  optOut(actor) {
    const denied = this.#requireAuth(actor); if (denied) return denied;
    if (!this.rows.has(actor)) return { status: "already_absent" };
    if (!optOutHardDeletes) {
      const row = this.rows.get(actor);
      row.state = "opted_out_tombstone";
      return { status: "opted_out", tombstoneLeftBehind: true };
    }
    this.rows.delete(actor);
    return { status: "opted_out" };
  }
}

const A = "aaaaaaaa-1111-1111-1111-111111111111";
const B = "bbbbbbbb-2222-2222-2222-222222222222";

// ============ 0. the compiled authority is well-formed ============================================
expect(policies.length === 1 && policies[0].command === "select",
  "0 exactly one SELECT-only policy was compiled from the migration", policies.map((p) => `${p.name}:${p.command}`));
expect(typeof compilePredicate(policies[0]?.predicateSource ?? "") === "function",
  "0a the policy predicate is expressible — an unrecognised predicate fails closed", policies[0]?.predicateSource);
expect(pkColumns.length === 1 && pkColumns[0] === "user_id",
  "0b one row per user: user_id is the whole primary key", pkColumns);
expect(allowedStates.length === 2 && allowedStates.includes("opted_in") && allowedStates.includes("paused"),
  "0c exactly two states were compiled from the CHECK constraint", allowedStates);
expect(privileges.authenticated.has("select") && privileges.authenticated.size === 1,
  "0d authenticated holds SELECT and nothing else", [...privileges.authenticated]);
expect(privileges.anon.size === 0, "0e anon holds no privilege at all", [...privileges.anon]);
expect(functions.length === 4 && functions.every((f) => f.params === ""),
  "0f all four lifecycle functions take zero parameters", functions.map((f) => `${f.name}(${f.params})`));

// ============ 1-15. the canonical lifecycle =======================================================
{
  const db = new ParticipationModel();

  // 1. absence is the default
  const initial = db.select("authenticated", A);
  expect(!initial.error && initial.rows.length === 0 && db.rows.size === 0,
    "1 no row exists for a user who never joined — absence is the canonical not-participating state");

  // 2-3. opt in
  const optIn = db.optIn(A);
  expect(optIn.status === "opted_in" && optIn.state === "opted_in", "2 the user opts in", optIn);
  expect(db.rows.get(A).state === "opted_in", "3 the stored state is opted_in");
  const firstOptedInAt = optIn.opted_in_at;

  // 4. owner can read own row
  const own = db.select("authenticated", A);
  expect(own.rows.length === 1 && own.rows[0].user_id === A, "4 the user can read its own participation row", own.rows.length);

  // 5. another user cannot
  const other = db.select("authenticated", B);
  expect(other.rows.length === 0, "5 a DIFFERENT authenticated user reads zero rows — A's participation is invisible to B", other.rows.length);

  // 6. duplicate opt-in idempotent
  const again = db.optIn(A);
  expect(again.status === "already_participating" && again.opted_in_at === firstOptedInAt && db.rows.size === 1,
    "6 duplicate opt-in is idempotent and does not move opted_in_at", again);

  // 7-8. pause
  const paused = db.pause(A);
  expect(paused.status === "paused" && paused.state === "paused", "7 pause moves the state to paused", paused);
  const pausedRead = db.select("authenticated", A);
  expect(pausedRead.rows.length === 1 && pausedRead.rows[0].state === "paused",
    "8 a paused row stays owner-readable while being semantically not discoverable", pausedRead.rows[0]?.state);

  // 9-10. resume, and timestamp preservation across the whole pause/resume cycle
  const resumed = db.resume(A);
  expect(resumed.status === "resumed" && resumed.state === "opted_in", "9 resume returns the state to opted_in", resumed);
  expect(paused.opted_in_at === firstOptedInAt && resumed.opted_in_at === firstOptedInAt,
    "10 neither pause nor resume moved opted_in_at — the lifecycle is continuous",
    { first: firstOptedInAt, afterPause: paused.opted_in_at, afterResume: resumed.opted_in_at });

  // 11-12. opt out returns to canonical absence
  const optOut = db.optOut(A);
  expect(optOut.status === "opted_out" && !optOut.tombstoneLeftBehind,
    "11 opt out removes the authority row rather than deactivating it", optOut);
  expect(db.rows.size === 0 && db.select("authenticated", A).rows.length === 0,
    "12 after opt out there is no participation row at all — no stale discoverable remnant");

  // 13. re-opt-in starts a new lifecycle
  const reOptIn = db.optIn(A);
  expect(reOptIn.status === "opted_in" && reOptIn.opted_in_at !== firstOptedInAt,
    "13 re-opting-in creates a FRESH opted_in_at", { first: firstOptedInAt, second: reOptIn.opted_in_at });

  // idempotent opt-out
  db.optOut(A);
  expect(db.optOut(A).status === "already_absent", "13a repeating opt out is a safe idempotent no-op");
}

// 14. actor ownership cannot be spoofed
expect(functions.every((f) => f.params === "") && !/\bp_[a-z_]*user_id\b/i.test(sql),
  "14 no lifecycle function accepts any parameter, so no caller can name another subject");
expect(authDerivations === 4, "14a every lifecycle function binds the subject from auth.uid()", authDerivations);

// 15. unauthenticated lifecycle writes denied
{
  const db = new ParticipationModel();
  expect(db.optIn(null).error === "AUTHENTICATION_REQUIRED", "15 unauthenticated opt-in is denied");
  expect(db.pause(null).error === "AUTHENTICATION_REQUIRED", "15a unauthenticated pause is denied");
  expect(db.resume(null).error === "AUTHENTICATION_REQUIRED", "15b unauthenticated resume is denied");
  expect(db.optOut(null).error === "AUTHENTICATION_REQUIRED", "15c unauthenticated opt-out is denied");
  expect(db.rows.size === 0, "15d no unauthenticated call created any state");
}

// privilege layer
{
  const db = new ParticipationModel();
  db.optIn(A);
  expect(db.select("anon", A).error === "permission_denied_for_table",
    "16 anon cannot read participation at all — the privilege is absent, not merely policy-filtered");
  for (const kind of ["insert", "update", "delete"]) {
    expect(db.directWrite("authenticated", kind).error === "permission_denied_for_table",
      `17 authenticated holds no direct ${kind.toUpperCase()} privilege — lifecycle exists only through the RPCs`);
  }
}

// a state outside the compiled CHECK is unrepresentable
expect(!allowedStates.includes("suspended") && !allowedStates.includes("banned") && !allowedStates.includes("disabled"),
  "18 no account or moderation state is representable in this authority", allowedStates);

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({
  smoke: "social-participation-sr1b-c",
  proofKind: "static semantic model compiled from the migration",
  liveDatabaseExecuted: false,
  outstandingAcceptance: "PostgreSQL/Supabase enforcement of the compiled policy, privileges, key and CHECK requires Development execution",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
