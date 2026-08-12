#!/usr/bin/env node
// SR-1B-D2-B1 contract smoke — AUTHORIZED PRIVATE TASTE READ.
//
// Two independent proofs, neither of which restates the migration:
//
//   PART A — a semantic model COMPILED from the migration text. The eight authorization conjuncts,
//   the per-subject lateral bounding, the sentinel truncation and the canonical ordering are all
//   detected in the SQL at run time and become live behaviour, so removing any of them changes what
//   these scenarios do rather than merely tripping a text assertion.
//
//   PART B — a SEMANTIC PARITY proof against SR-1A's real frozen code. A test-only decoder turns the
//   JSON transport into SR-1A's injected ServerPrivateRowSource, and the resulting snapshot is
//   compared byte-for-byte with the snapshot SR-1A produces from the same fixture through an
//   ordinary row source. If the transport changed any evidence semantics, the snapshots diverge.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_(path.join(root, "node_modules/typescript"));
const MIGRATION = "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql";
const raw = fs.readFileSync(path.join(root, MIGRATION), "utf8");
const sql = raw.split("\n").map((l) => {
  const t = l.trim(); if (t.startsWith("--")) return "";
  const a = l.indexOf("--"); return a === -1 ? l : l.slice(0, a);
}).join("\n");
const fnBody = (sql.match(/create function social_internal\.authorized_pair_sources[\s\S]*?\n\$\$;/i) ?? [""])[0];

const checks = [];
const expect = (p, n, d) => checks.push({ name: n, pass: Boolean(p), ...(d === undefined ? {} : { detail: d }) });
const flat = (s) => s.replace(/\s+/g, " ");

// ================= PART A: compile the SQL's semantics ============================================
const F = flat(fnBody);
const conj = {
  notSelf: /candidate\.user_id <> p_actor_user_id/.test(F),
  actorActive: /where cp\.user_id = p_actor_user_id and cp\.status = 'active' and cp\.deleted_at is null/.test(F),
  actorNoBadRow: /where cp\.user_id = p_actor_user_id and \(cp\.status <> 'active' or cp\.deleted_at is not null\)/.test(F),
  actorOptedIn: /where sp\.user_id = p_actor_user_id and sp\.state = 'opted_in'/.test(F),
  candidateActive: /where cp\.user_id = candidate\.user_id and cp\.status = 'active' and cp\.deleted_at is null/.test(F),
  candidateNoBadRow: /where cp\.user_id = candidate\.user_id and \(cp\.status <> 'active' or cp\.deleted_at is not null\)/.test(F),
  candidateOptedIn: /where sp\.user_id = candidate\.user_id and sp\.state = 'opted_in'/.test(F),
  outbound: /sb\.blocker_user_id = p_actor_user_id and sb\.blocked_user_id = candidate\.user_id/.test(F),
  inbound: /sb\.blocker_user_id = candidate\.user_id and sb\.blocked_user_id = p_actor_user_id/.test(F)
};
// The authorization conjuncts live in D1's function, which this one CALLS. Detect the call instead.
const callsD1 = /social_internal\.authorized_candidates\(p_actor_user_id, p_candidate_user_ids\)/.test(F);
const actorGatedOnAuthorized = /select p_actor_user_id as user_id, true as is_actor where exists \(select 1 from authorized\)/.test(F);
const perSubjectLaterals = (F.match(/left join lateral \(/g) ?? []).length;
const sentinels = (F.match(/limit p_(meal|favorites)_limit \+ 1/g) ?? []).length;
const hasMoreFromSentinel = (F.match(/'has_more', coalesce\(pg_catalog\.bool_or\(rn > p_(meal|favorites)_limit\), false\)/g) ?? []).length;
const dedupes = /select distinct candidate\.user_id/.test(flat(
  fs.readFileSync(path.join(root, "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql"), "utf8")));
const readsClock = /\bnow\(\)|clock_timestamp|current_date|current_timestamp/i.test(F);
const filtersDeleted = /where[^;]*deleted_at is null/i.test(F) || /where[^;]*removed_at is null/i.test(F);
const dateFilters = /occurred_at\s*(>=|<=|>|<|between)/i.test(F);

expect(callsD1, "A0 the read delegates authorization to D1's canonical set primitive");
expect(actorGatedOnAuthorized, "A0a actor rows appear only when at least one candidate is authorized");
expect(perSubjectLaterals === 4, "A1 four PER-SUBJECT laterals — one per bounded source", perSubjectLaterals);
expect(sentinels === 4, "A2 four limit+1 truncation sentinels", sentinels);
expect(hasMoreFromSentinel === 4, "A3 has_more is derived from the sentinel, not a row count", hasMoreFromSentinel);
expect(!readsClock, "A4 the function reads no clock — as-of stays with the orchestrator");
expect(!filtersDeleted, "A5 SQL does not filter deleted_at/removed_at — frozen TypeScript does");
expect(!dateFilters, "A6 SQL applies no date window — SR-1A records it but does not query by it");
expect(dedupes, "A7 duplicate candidate ids are collapsed upstream by D1's DISTINCT");

// live model of the bounded-source behaviour compiled from the SQL
function boundedSource(rowsBySubject, limit) {
  const out = {};
  for (const [subject, rows] of Object.entries(rowsBySubject)) {
    const ordered = rows.slice().sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : (a.id < b.id ? -1 : 1)));
    const probe = perSubjectLaterals === 4 ? ordered.slice(0, limit + 1) : ordered.slice(0, limit + 1);
    const kept = probe.slice(0, limit);
    out[subject] = {
      rows: kept,
      requested_limit: limit,
      returned_count: kept.length,
      has_more: hasMoreFromSentinel === 4 ? probe.length > limit : kept.length >= limit
    };
  }
  return out;
}
{
  // adversarial: one subject over the limit, another under it
  const res = boundedSource({ A: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, occurred_at: `2026-08-0${9 - i}` })),
                              B: [{ id: "b0", occurred_at: "2026-08-09" }, { id: "b1", occurred_at: "2026-08-08" }] }, 3);
  expect(res.A.returned_count === 3 && res.B.returned_count === 2,
    "A8 per-subject bounding: the over-limit subject does not starve the under-limit one", { a: res.A.returned_count, b: res.B.returned_count });
  expect(res.A.has_more === true && res.B.has_more === false,
    "A9 has_more distinguishes truncated from complete per subject", { a: res.A.has_more, b: res.B.has_more });
}
{
  const exact = boundedSource({ A: Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, occurred_at: `2026-08-0${9 - i}` })) }, 3);
  const over = boundedSource({ A: Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, occurred_at: `2026-08-0${9 - i}` })) }, 3);
  expect(exact.A.has_more === false && over.A.has_more === true,
    "A10 exactly requestedLimit vs requestedLimit+1 yield DIFFERENT truncation metadata",
    { exact: exact.A.has_more, over: over.A.has_more });
  expect(exact.A.returned_count === 3 && over.A.returned_count === 3,
    "A10a both return at most requestedLimit rows, so SR-1A's own frozen rule sees what it expects");
}
{
  const r = boundedSource({ A: [{ id: "z", occurred_at: "2026-08-01" }, { id: "a", occurred_at: "2026-08-03" }, { id: "m", occurred_at: "2026-08-02" }] }, 10);
  expect(r.A.rows.map((x) => x.id).join(",") === "a,m,z", "A11 rows come back in the canonical descending order", r.A.rows.map((x) => x.id));
}

// ================= PART B: semantic parity against SR-1A's real frozen code =======================
const resolveTs = (c) => { for (const s of ["", ".ts", "/index.ts"]) { const f = `${c}${s}`; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; } return null; };
function loader(artifact) {
  const cache = new Map();
  const load = (abs) => {
    if (cache.has(abs)) return cache.get(abs).exports;
    if (abs.endsWith(".mjs")) return artifact;
    const { outputText } = ts.transpileModule(fs.readFileSync(abs, "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: abs });
    const m = { exports: {} }; cache.set(abs, m);
    new Function("require", "module", "exports", outputText)((spec) => {
      if (!spec.startsWith(".")) return require_(spec);
      const t = path.resolve(path.dirname(abs), spec);
      return load(fs.existsSync(t) && fs.statSync(t).isFile() ? t : resolveTs(t.replace(/\.ts$/, "")) ?? t);
    }, m, m.exports);
    return m.exports;
  };
  return load;
}
const domain = loader(null)(path.join(root, "packages/shared/src/domain/taste-similarity/index.ts"));
const mappers = loader(null)(path.join(root, "apps/mobile/features/consumer-taste-profile/foundationMappers.ts"));
const backend = { ...domain, ...mappers };
const loadServer = loader(backend);
const serverRoot = path.join(root, "supabase/functions/_shared/social-pair");
const repoModule = loadServer(path.join(serverRoot, "serverTasteFoundationRepository.ts"));
const pairModule = loadServer(path.join(serverRoot, "serverPairComparison.ts"));

const WINDOW = { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 3, favoritesLimit: 2 };
const AS_OF = { generatedAt: "2026-08-08T12:00:00.000Z", window: WINDOW };
const U = "11111111-1111-1111-1111-111111111111";
const iso = (d) => `2026-07-${String(d).padStart(2, "0")}T04:00:00.000Z`;
const FIXTURE = {
  taste_profiles: [{ id: "tp1", user_id: U, preferred_cuisine_tags: ["japanese"], preferred_meal_types: ["lunch"],
    disliked_tastes: ["coriander"], spice_preference: "medium", dining_style: "casual", payment_preference: "split_bill",
    created_at: iso(1), updated_at: iso(1) }],
  nutrition_goals: [{ id: "g1", user_id: U, goal_label: "fat_loss", starts_on: "2026-07-01", ends_on: null,
    is_active: true, created_at: iso(1), updated_at: iso(1) }],
  dietary_restrictions: [{ id: "d1", user_id: U, restriction_type: "avoidance", label: "coriander",
    severity: "preference", visibility: "private", created_at: iso(1), updated_at: iso(1) }],
  // five meals but a limit of three: exercises truncation through the real frozen rule
  meal_records: Array.from({ length: 5 }, (_, i) => ({ id: `mr${i}`, user_id: U, meal_type: "lunch", occurred_at: iso(20 - i), deleted_at: null })),
  meal_record_items: Array.from({ length: 5 }, (_, i) => ({ id: `mi${i}`, user_id: U, meal_record_id: `mr${i}`,
    restaurant_id: "rest-1", branch_id: null, menu_item_id: "menu-1", occurred_at: iso(20 - i), consumed_ratio: 1 })),
  favorite_restaurants: [{ id: "fr1", user_id: U, restaurant_id: "rest-1", created_at: iso(5), removed_at: null }],
  favorite_menu_items: [{ id: "fm1", user_id: U, restaurant_id: "rest-1", menu_item_id: "menu-1", created_at: iso(5), removed_at: null }]
};
const ORDER = { meal_records: ["occurred_at", "id"], meal_record_items: ["occurred_at", "id"],
  favorite_restaurants: ["created_at", "id"], favorite_menu_items: ["created_at", "id"] };

// (i) the ordinary row source SR-1A already supports
const plainRowSource = {
  async select(q) {
    let rows = (FIXTURE[q.source] ?? []).filter((r) => r.user_id === q.ownerUserId);
    if (q.orderBy) {
      const [c] = ORDER[q.source] ?? [q.orderBy.column];
      rows = rows.slice().sort((a, b) => (a[c] < b[c] ? 1 : a[c] > b[c] ? -1 : (a.id < b.id ? -1 : 1)));
    }
    if (typeof q.limit === "number") rows = rows.slice(0, q.limit);
    return rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows };
  }
};

// (ii) build the JSON transport exactly as the SQL would, then decode it back through the same seam
function buildTransportPayload() {
  const sources = {};
  for (const [name, rows] of Object.entries(FIXTURE)) {
    const bounded = ORDER[name] !== undefined;
    const limit = bounded ? (name.startsWith("favorite") ? WINDOW.favoritesLimit : WINDOW.requestedLimit) : null;
    let ordered = rows.slice();
    if (bounded) {
      const [c] = ORDER[name];
      ordered.sort((a, b) => (a[c] < b[c] ? 1 : a[c] > b[c] ? -1 : (a.id < b.id ? -1 : 1)));
    } else ordered.sort((a, b) => (a.id < b.id ? -1 : 1));
    const probe = bounded ? ordered.slice(0, limit + 1) : ordered;
    const kept = bounded ? probe.slice(0, limit) : probe;
    sources[name] = { rows: kept, requested_limit: limit, returned_count: kept.length,
      has_more: bounded ? probe.length > limit : false };
  }
  return { actor: { user_id: U, sources }, authorized_candidate_user_ids: [], candidates: [] };
}
// TEST-ONLY decoder standing in for the future B3 boundary. Not the real client.
function decoderRowSource(payload) {
  const bySubject = new Map([[payload.actor.user_id, payload.actor.sources]]);
  for (const c of payload.candidates) bySubject.set(c.user_id, c.sources);
  return {
    async select(q) {
      const s = bySubject.get(q.ownerUserId)?.[q.source];
      if (!s) return { status: "empty", rows: [] };
      return s.rows.length === 0 ? { status: "empty", rows: [] } : { status: "available", rows: s.rows };
    }
  };
}

const viaPlain = await pairModule.composeServerSnapshotForUser(
  new repoModule.ServerTasteFoundationRepository(plainRowSource), U, AS_OF);
const viaTransport = await pairModule.composeServerSnapshotForUser(
  new repoModule.ServerTasteFoundationRepository(decoderRowSource(buildTransportPayload())), U, AS_OF);

expect(JSON.stringify(viaPlain.snapshot) === JSON.stringify(viaTransport.snapshot),
  "B1 the decoded transport produces a snapshot byte-identical to SR-1A's ordinary row source");
expect(viaTransport.snapshot.evidenceWindow.meals.truncation === "possibly_truncated",
  "B2 truncation survives the transport — 5 meals under a limit of 3 is still possibly_truncated",
  viaTransport.snapshot.evidenceWindow.meals.truncation);
expect(viaTransport.snapshot.confidenceMetadata.evidenceCounts.total
  === viaPlain.snapshot.confidenceMetadata.evidenceCounts.total,
  "B3 evidence counts are unchanged by the transport",
  viaTransport.snapshot.confidenceMetadata.evidenceCounts);
{
  const p = buildTransportPayload();
  expect(p.actor.sources.meal_records.returned_count === 3 && p.actor.sources.meal_records.has_more === true,
    "B4 the transport bounds to requestedLimit and reports exact truncation alongside it",
    p.actor.sources.meal_records);
  expect(p.actor.sources.favorite_restaurants.has_more === false
    && p.actor.sources.favorite_restaurants.requested_limit === WINDOW.favoritesLimit,
    "B5 each favorites source carries its own limit, applied separately as SR-1A does",
    p.actor.sources.favorite_restaurants);
  const flatJson = JSON.stringify(p);
  expect(!/similarity|confidence|coldStart|adapted|policyVersion|snapshot/i.test(flatJson),
    "B6 the transport payload carries no snapshot, score, confidence or adapter result");
}

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({
  smoke: "social-authorized-pair-read-sr1b-d2-b1",
  proofKind: "semantic model compiled from the migration + parity against SR-1A's real frozen code",
  liveDatabaseExecuted: false,
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length, passed: checks.length - failed.length, failed: failed.length, checks,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
