#!/usr/bin/env node
// SR-2G-A meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families: the card-reference primitive is mutated and executed, and the irreversible
// migration is mutated and re-evaluated against the structural contract. Every mutation targets a
// real authority — a weakened cipher, a dropped binding, or a schema clause that would smuggle a
// later round's power into a migration that cannot be taken back.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2GA_MIGRATION, SR2GA_REF_ROOT } from "./social-candidate-sr2g-a-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const CRYPTO_ABS = path.join(root, SR2GA_REF_ROOT, "crypto.ts");
const POLICY_ABS = path.join(root, SR2GA_REF_ROOT, "policy.ts");
const INDEX_ABS = path.join(root, SR2GA_REF_ROOT, "index.ts");

const ACTOR_A = "11111111-2222-4333-8444-555555555555";
const ACTOR_B = "99999999-8888-4777-8666-555555555555";
const CARD_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const KEY = Buffer.alloc(32, 7).toString("base64");
const ISSUED = new Date("2026-08-17T10:00:00.000Z");
const TTL_MS = 86_400_000;

// --- in-memory loader with per-file mutation ------------------------------------------------------
function loadRef(mutate = {}) {
  const cache = new Map();
  function load(absolute) {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    let source = fs.readFileSync(absolute, "utf8");
    const transform = mutate[absolute];
    if (transform) source = transform(source);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => load(path.resolve(path.dirname(absolute), specifier));
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(INDEX_ABS);
}

const rejected = async (promise) => { try { await promise; return false; } catch { return true; } };

// --- the card-reference contract --------------------------------------------------------------------
// Returns violated invariants. Canonical must violate none; a mutant violating none has survived.
async function cryptoViolations(mutate) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  try {
    const ref = loadRef(mutate);
    const cipher = ref.createMealBuddyCardRefCipher(ref.decodeMealBuddyCardRefKey(KEY));

    const sourceToken = await cipher.seal(ACTOR_A, "source", CARD_ID, ISSUED);
    const candidateToken = await cipher.seal(ACTOR_A, "candidate", CARD_ID, ISSUED);
    const opened = await cipher.open(ACTOR_A, "source", sourceToken, ISSUED);

    record("source reference round-trips", opened.cardId === CARD_ID && opened.purpose === "source");
    record("token hides the raw card identifier", !sourceToken.includes(CARD_ID));
    record("token hides the raw actor identifier", !sourceToken.includes(ACTOR_A));
    record("a foreign actor cannot open the reference", await rejected(cipher.open(ACTOR_B, "source", sourceToken, ISSUED)));
    record("a source reference does not verify as a candidate reference", await rejected(cipher.open(ACTOR_A, "candidate", sourceToken, ISSUED)));
    record("a candidate reference does not verify as a source reference", await rejected(cipher.open(ACTOR_A, "source", candidateToken, ISSUED)));
    record("expiry is enforced", await rejected(cipher.open(ACTOR_A, "source", sourceToken, new Date(ISSUED.getTime() + TTL_MS))));
    record("the TTL is exactly 24 hours", opened.expiresAtMs - opened.issuedAtMs === TTL_MS);
    record("a fresh IV is drawn per seal", (await cipher.seal(ACTOR_A, "source", CARD_ID, ISSUED)) !== sourceToken);
    record("a tampered tag is refused", await rejected(cipher.open(ACTOR_A, "source", `${sourceToken.slice(0, -1)}${sourceToken.slice(-1) === "A" ? "B" : "A"}`, ISSUED)));

    let shortKeyRejected = false;
    try { ref.decodeMealBuddyCardRefKey(Buffer.alloc(16, 7).toString("base64")); } catch { shortKeyRejected = true; }
    record("a 16-byte key is refused", shortKeyRejected);
    record("the sealing secret is dedicated", ref.MEAL_BUDDY_CARD_REF_KEY_ENV === "MEAL_BUDDY_CARD_REF_KEY_V1");
  } catch (error) {
    failed.push(`contract threw: ${error.message}`);
  }
  return failed;
}

// --- the migration structural contract ----------------------------------------------------------------
const sqlExecutable = (source) => source.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const count = (haystack, needle) => haystack.split(needle).length - 1;

// A column is any body line of the form `<identifier> <type…>` that is not a constraint clause or
// its continuation. Enumerating accepted TYPES instead would be a blind spot: an `integer`,
// `boolean` or `numeric` column would simply not be seen, and a forbidden-column assertion that
// cannot see the column silently passes.
const SQL_CLAUSE_KEYWORDS = new Set([
  "constraint", "references", "check", "foreign", "primary", "unique", "on", "default", "not", "null"
]);
function extractColumns(body) {
  return body.split("\n").map((line) => line.trim())
    .filter((line) => /^[a-z_]+\s+[a-z(]/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter((name) => !SQL_CLAUSE_KEYWORDS.has(name))
    .sort();
}

function migrationViolations(source) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const sql = sqlExecutable(source);
  const body = (sql.match(/create table public\.meal_buddy_cards\s*\(([\s\S]*?)\n\);/) ?? ["", ""])[1];
  const columns = extractColumns(body);

  record("the card table is created exactly once", count(sql, "create table ") === 1);
  record("identity is an internal uuid primary key", /id uuid not null default gen_random_uuid\(\)/.test(sql) && /primary key \(id\)/.test(sql));
  record("a restaurant card requires a restaurant", /check \(card_type <> 'restaurant' or restaurant_id is not null\)/.test(sql));
  record("meal_period is the exact four-value enum", /meal_period in \('breakfast', 'lunch', 'dinner', 'late_night'\)/.test(sql));
  record("card_type is the exact enum", /card_type in \('general', 'restaurant'\)/.test(sql));
  record("intention_type is the exact enum", /intention_type in \('chat_first', 'eat_together'\)/.test(sql));
  record("expiry must follow creation", /check \(expires_at > created_at\)/.test(sql));
  record("lifecycle is derived, with no mutable status column", columns.includes("cancelled_at") && columns.includes("expires_at") && !columns.includes("status"));
  record("no uniqueness constraint threatens Premium multiplicity", count(sql.toLowerCase(), "unique") === 0);
  record("no ranking, score or taste column exists", !columns.some((c) => /rank|score|taste|similarity|match_reason/.test(c)));
  record("no entitlement, premium or verification column exists", !columns.some((c) => /premium|entitlement|plan|billing|verified|verification/.test(c)));
  record("no seen, impression or analytics column exists", !columns.some((c) => /seen|impression|view_count|analytics/.test(c)));
  record("no geo column exists", !columns.some((c) => /latitude|longitude|geo|distance/.test(c)));
  // Match the table NAME, not its body: `intention_type in ('chat_first', ...)` legitimately
  // contains "chat", and a body-spanning pattern would flag the canonical migration itself.
  record("no action, history or analytics table is created",
    !/create table\s+(public\.)?\w*(seen|impression|invite|match|chat|history|analytic)\w*/i.test(sql));
  record("row level security is enabled", /alter table public\.meal_buddy_cards enable row level security/.test(sql));
  record("the only policy is an owner-scoped select", count(sql, "create policy ") === 1 && /using \(auth\.uid\(\) = owner_user_id\)/.test(sql));
  record("no cross-user read policy exists", !/using \(true\)/.test(sql));
  record("privileges are revoked from public and anon", /revoke all on table public\.meal_buddy_cards from public;/.test(sql) && /revoke all on table public\.meal_buddy_cards from anon;/.test(sql));
  record("only one grant exists and it is select to authenticated", count(sql, "grant ") === 1 && /grant select on table public\.meal_buddy_cards to authenticated;/.test(sql));
  record("no write privilege is granted", !/grant (insert|update|delete|all)/i.test(sql));
  record("no forbidden role is granted anything", !/grant [^;]*to (anon|public|service_role|authenticator|social_runtime_executor)\b/.test(sql));
  record("area carries no constraint, so it is not hard authority", !/check \([^)]*area/.test(sql));
  record("no function or trigger is created in this phase", !/create (or replace )?function/i.test(sql) && !/create trigger/i.test(sql));
  return failed;
}

// --- mutants ------------------------------------------------------------------------------------------
const cryptoSource = fs.readFileSync(CRYPTO_ABS, "utf8");
const policySource = fs.readFileSync(POLICY_ABS, "utf8");
const migrationSource = fs.readFileSync(path.join(root, SR2GA_MIGRATION), "utf8");

const cryptoMutants = [
  {
    name: "the raw card id is returned as the reference, exposing card identity",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}`;",
      "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${card}`;")
  },
  {
    name: "the actor binding is dropped from the additional authenticated data",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "return toArrayBuffer(textEncoder.encode(`${MEAL_BUDDY_CARD_REF_VERSION}|${purpose}|${actorUserId}`));",
      "return toArrayBuffer(textEncoder.encode(`${MEAL_BUDDY_CARD_REF_VERSION}|${purpose}`));")
  },
  {
    name: "the purpose binding is dropped, so a source ref opens as a candidate ref",
    file: CRYPTO_ABS,
    apply: (s) => s
      .replace(
        "return toArrayBuffer(textEncoder.encode(`${MEAL_BUDDY_CARD_REF_VERSION}|${purpose}|${actorUserId}`));",
        "return toArrayBuffer(textEncoder.encode(`${MEAL_BUDDY_CARD_REF_VERSION}|${actorUserId}`));")
      .replace("        claims.purpose !== expectedPurpose ||\n", "")
  },
  {
    name: "expiry is reported but not enforced",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "if (nowMs >= (claims.expiresAtMs as number)) return mealBuddyCardRefContractViolation();",
      "if (false && nowMs >= (claims.expiresAtMs as number)) return mealBuddyCardRefContractViolation();")
  },
  {
    name: "the IV becomes deterministic, destroying GCM security",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "const randomIv = options.randomIv ?? ((byteLength: number) => crypto.getRandomValues(new Uint8Array(byteLength)));",
      "const randomIv = options.randomIv ?? ((byteLength: number) => new Uint8Array(byteLength));")
  },
  {
    name: "the key length check is removed, silently allowing AES-128",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "if (binary.length !== MEAL_BUDDY_CARD_REF_KEY_BYTES) return mealBuddyCardRefContractViolation();",
      "if (false) return mealBuddyCardRefContractViolation();")
  },
  {
    // Targets the assertion's runtime force. Removing the assertion alone changes no behaviour —
    // AES-GCM output never contains the plaintext — so the meaningful mutation is a leak the
    // assertion must catch, and separately the same leak with the assertion gone.
    name: "the sealed token appends the raw card id, which the opacity assertion must catch",
    file: CRYPTO_ABS,
    apply: (s) => s.replace(
      "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}`;",
      "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}${card}`;")
  },
  {
    name: "the opacity assertion is removed and the raw card id leaks into the token",
    file: CRYPTO_ABS,
    apply: (s) => s
      .replace(
        "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}`;",
        "const token = `${MEAL_BUDDY_CARD_REF_PREFIX}${base64UrlEncode(envelope)}${card}`;")
      .replace(
        "      if (token.includes(card) || token.includes(actor)) {\n        return mealBuddyCardRefContractViolation();\n      }\n", "")
  },
  {
    name: "the dedicated secret is replaced by the frozen candidate-ref key",
    file: POLICY_ABS,
    apply: (s) => s.replace(
      'export const MEAL_BUDDY_CARD_REF_KEY_ENV = "MEAL_BUDDY_CARD_REF_KEY_V1" as const;',
      'export const MEAL_BUDDY_CARD_REF_KEY_ENV = "SOCIAL_CANDIDATE_REF_KEY_V1" as const;')
  },
  {
    name: "the TTL is widened far beyond 24 hours",
    file: POLICY_ABS,
    apply: (s) => s.replace("export const MEAL_BUDDY_CARD_REF_TTL_MS = 86_400_000 as const;",
      "export const MEAL_BUDDY_CARD_REF_TTL_MS = 8_640_000_000 as const;")
  },
  {
    name: "AES-GCM is downgraded to AES-CBC, removing authentication",
    file: POLICY_ABS,
    apply: (s) => s.replace('export const MEAL_BUDDY_CARD_REF_ALGORITHM = "AES-GCM" as const;',
      'export const MEAL_BUDDY_CARD_REF_ALGORITHM = "AES-CBC" as const;')
  }
];

const migrationMutants = [
  { name: "a restaurant card no longer requires a restaurant",
    apply: (s) => s.replace("check (card_type <> 'restaurant' or restaurant_id is not null)", "check (true)") },
  { name: "an invalid meal period is admitted",
    apply: (s) => s.replace("meal_period in ('breakfast', 'lunch', 'dinner', 'late_night')", "meal_period in ('breakfast', 'lunch', 'dinner', 'late_night', 'brunch')") },
  { name: "a cross-user select policy is added",
    apply: (s) => s.replace("using (auth.uid() = owner_user_id);", "using (true);") },
  { name: "anon receives select on the card table, enabling enumeration",
    apply: (s) => s.replace("grant select on table public.meal_buddy_cards to authenticated;", "grant select on table public.meal_buddy_cards to anon;") },
  { name: "a ranking score column is added to an irreversible migration",
    apply: (s) => s.replace("  area text,", "  area text,\n  rank_score integer,") },
  { name: "a Premium entitlement column is added",
    apply: (s) => s.replace("  area text,", "  area text,\n  is_premium boolean not null default false,") },
  { name: "a seen-history column is added",
    apply: (s) => s.replace("  area text,", "  area text,\n  seen_count integer not null default 0,") },
  { name: "GPS coordinates are added",
    apply: (s) => s.replace("  area text,", "  area text,\n  latitude numeric,\n  longitude numeric,") },
  { name: "a static uniqueness constraint prevents Premium multiplicity",
    apply: (s) => s.replace("  constraint meal_buddy_cards_pkey primary key (id),",
      "  constraint meal_buddy_cards_pkey primary key (id),\n  constraint meal_buddy_cards_one_per_owner unique (owner_user_id, card_type),") },
  { name: "a mutable status column reintroduces dual lifecycle authority",
    apply: (s) => s.replace("  cancelled_at timestamptz,", "  cancelled_at timestamptz,\n  status text not null default 'active',") },
  { name: "area becomes hard authority through a check constraint",
    apply: (s) => s.replace("  area text,", "  area text,\n  constraint meal_buddy_cards_area_required check (area is not null),") },
  { name: "the runtime executor is granted the table before any consumer exists",
    apply: (s) => s.replace("grant select on table public.meal_buddy_cards to authenticated;",
      "grant select on table public.meal_buddy_cards to authenticated;\ngrant select on table public.meal_buddy_cards to social_runtime_executor;") },
  { name: "a client write privilege is granted",
    apply: (s) => s.replace("grant select on table public.meal_buddy_cards to authenticated;",
      "grant insert on table public.meal_buddy_cards to authenticated;") },
  { name: "an invite state table is created in the schema phase",
    apply: (s) => s.replace("commit;", "create table public.meal_buddy_card_invites (id uuid primary key);\n\ncommit;") }
];

const results = [];

const canonicalCrypto = await cryptoViolations({});
results.push({
  name: "canonical card-reference primitive satisfies the exact SR-2G-A contract",
  applied: true, killed: canonicalCrypto.length === 0,
  status: canonicalCrypto.length === 0 ? "killed" : "survived", violations: canonicalCrypto
});
const canonicalMigration = migrationViolations(migrationSource);
results.push({
  name: "canonical migration satisfies the exact SR-2G-A structural contract",
  applied: true, killed: canonicalMigration.length === 0,
  status: canonicalMigration.length === 0 ? "killed" : "survived", violations: canonicalMigration
});

for (const mutant of cryptoMutants) {
  const original = mutant.file === POLICY_ABS ? policySource : cryptoSource;
  const mutated = mutant.apply(original);
  const applied = mutated !== original;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  const failed = applied ? await cryptoViolations({ [mutant.file]: () => mutated }) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name: mutant.name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

for (const mutant of migrationMutants) {
  const mutated = mutant.apply(migrationSource);
  const applied = mutated !== migrationSource;
  const failed = applied ? migrationViolations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name: mutant.name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-a-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors,
  repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
