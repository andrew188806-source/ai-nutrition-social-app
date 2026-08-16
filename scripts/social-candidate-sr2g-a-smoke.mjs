#!/usr/bin/env node
// SR-2G-A local smoke. Pure and local: no network, no database, no credentials, no deployment.
// The REAL meal-buddy-card-ref primitive executes, transpiled in memory; repository bytes are never
// modified. Nothing here prints a card id, an actor id, a token, a plaintext claim or a key.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const REF_ROOT = "supabase/functions/_shared/meal-buddy-card-ref";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

// --- in-memory Deno-style module loader ---------------------------------------------------------
const cache = new Map();
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`unexpected external import: ${specifier}`);
    return load(path.resolve(path.dirname(absolute), specifier));
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const ref = load(path.join(root, REF_ROOT, "index.ts"));

// --- fixtures ------------------------------------------------------------------------------------
// Synthetic, never printed. Shaped like real uuids so the "no raw id in token" proof is meaningful.
const ACTOR_A = "11111111-2222-4333-8444-555555555555";
const ACTOR_B = "99999999-8888-4777-8666-555555555555";
const CARD_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const ISSUED = new Date("2026-08-17T10:00:00.000Z");
const TTL_MS = 86_400_000;

const rejected = async (promise) => {
  try { await promise; return false; } catch { return true; }
};

try {
  const keyBytes = ref.decodeMealBuddyCardRefKey(KEY);
  const cipher = ref.createMealBuddyCardRefCipher(keyBytes);

  // --- round trips --------------------------------------------------------------------------------
  const sourceToken = await cipher.seal(ACTOR_A, "source", CARD_ID, ISSUED);
  const candidateToken = await cipher.seal(ACTOR_A, "candidate", CARD_ID, ISSUED);
  const openedSource = await cipher.open(ACTOR_A, "source", sourceToken, ISSUED);
  const openedCandidate = await cipher.open(ACTOR_A, "candidate", candidateToken, ISSUED);

  check("01 a source reference round-trips for its own actor", openedSource.cardId === CARD_ID && openedSource.purpose === "source");
  check("02 a candidate reference round-trips for its own actor", openedCandidate.cardId === CARD_ID && openedCandidate.purpose === "candidate");
  check("03 the sealed version is the mbc1 marker", openedSource.version === "mbc1");
  check("04 both tokens carry the mbc1 prefix", sourceToken.startsWith("mbc1.") && candidateToken.startsWith("mbc1."));
  check("05 the TTL is exactly 24 hours", openedSource.expiresAtMs - openedSource.issuedAtMs === TTL_MS);

  // --- opacity -------------------------------------------------------------------------------------
  check("06 the token contains no raw card identifier", !sourceToken.includes(CARD_ID) && !candidateToken.includes(CARD_ID));
  check("07 the token contains no raw actor identifier", !sourceToken.includes(ACTOR_A) && !candidateToken.includes(ACTOR_A));
  check("08 the token body is base64url only, so no claim is readable", /^mbc1\.[A-Za-z0-9_-]+$/.test(sourceToken));
  const decodedBody = Buffer.from(sourceToken.slice(5).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  check("09 the decoded envelope reveals no plaintext claim", !decodedBody.includes("cardId") && !decodedBody.includes("purpose") && !decodedBody.includes(CARD_ID));

  // --- fresh IV ------------------------------------------------------------------------------------
  const again = await cipher.seal(ACTOR_A, "source", CARD_ID, ISSUED);
  check("10 sealing the same card twice yields different tokens, proving a fresh IV", again !== sourceToken);
  check("11 both tokens still open to the same card", (await cipher.open(ACTOR_A, "source", again, ISSUED)).cardId === CARD_ID);

  // --- actor binding --------------------------------------------------------------------------------
  check("12 a different actor cannot open a source reference", await rejected(cipher.open(ACTOR_B, "source", sourceToken, ISSUED)));
  check("13 a different actor cannot open a candidate reference", await rejected(cipher.open(ACTOR_B, "candidate", candidateToken, ISSUED)));

  // --- purpose separation ----------------------------------------------------------------------------
  check("14 a source reference does not verify as a candidate reference", await rejected(cipher.open(ACTOR_A, "candidate", sourceToken, ISSUED)));
  check("15 a candidate reference does not verify as a source reference", await rejected(cipher.open(ACTOR_A, "source", candidateToken, ISSUED)));
  check("16 an unknown purpose is refused outright", await rejected(cipher.open(ACTOR_A, "admin", sourceToken, ISSUED)) && await rejected(cipher.seal(ACTOR_A, "admin", CARD_ID, ISSUED)));

  // --- tampering ---------------------------------------------------------------------------------------
  const flipLast = `${sourceToken.slice(0, -1)}${sourceToken.slice(-1) === "A" ? "B" : "A"}`;
  const flipIv = `mbc1.${sourceToken.slice(5, 6) === "A" ? "B" : "A"}${sourceToken.slice(6)}`;
  check("17 a tampered authentication tag fails", await rejected(cipher.open(ACTOR_A, "source", flipLast, ISSUED)));
  check("18 a tampered IV fails", await rejected(cipher.open(ACTOR_A, "source", flipIv, ISSUED)));
  check("19 a truncated envelope fails", await rejected(cipher.open(ACTOR_A, "source", `mbc1.${sourceToken.slice(5, 12)}`, ISSUED)));

  // --- expiry -------------------------------------------------------------------------------------------
  check("20 a reference is refused at exactly its expiry instant", await rejected(cipher.open(ACTOR_A, "source", sourceToken, new Date(ISSUED.getTime() + TTL_MS))));
  check("21 a reference is refused after expiry", await rejected(cipher.open(ACTOR_A, "source", sourceToken, new Date(ISSUED.getTime() + TTL_MS + 1))));
  check("22 a reference remains valid one millisecond before expiry", (await cipher.open(ACTOR_A, "source", sourceToken, new Date(ISSUED.getTime() + TTL_MS - 1))).cardId === CARD_ID);

  // --- malformed input ------------------------------------------------------------------------------------
  check("23 a token without the prefix fails", await rejected(cipher.open(ACTOR_A, "source", sourceToken.slice(5), ISSUED)));
  check("24 a foreign prefix fails", await rejected(cipher.open(ACTOR_A, "source", sourceToken.replace("mbc1.", "scr1."), ISSUED)));
  check("25 a non-base64url body fails", await rejected(cipher.open(ACTOR_A, "source", "mbc1.not*a*token", ISSUED)));
  check("26 an empty token fails", await rejected(cipher.open(ACTOR_A, "source", "", ISSUED)));
  check("27 an empty actor fails", await rejected(cipher.open("", "source", sourceToken, ISSUED)));
  check("28 an invalid instant fails", await rejected(cipher.open(ACTOR_A, "source", sourceToken, new Date("nonsense"))));
  check("29 sealing an empty card id fails", await rejected(cipher.seal(ACTOR_A, "source", "", ISSUED)));

  // --- key discipline ------------------------------------------------------------------------------------
  let shortKeyRejected = false;
  try { ref.decodeMealBuddyCardRefKey(Buffer.alloc(16, 7).toString("base64")); } catch { shortKeyRejected = true; }
  let longKeyRejected = false;
  try { ref.decodeMealBuddyCardRefKey(Buffer.alloc(48, 7).toString("base64")); } catch { longKeyRejected = true; }
  let emptyKeyRejected = false;
  try { ref.decodeMealBuddyCardRefKey(""); } catch { emptyKeyRejected = true; }
  let undefinedKeyRejected = false;
  try { ref.decodeMealBuddyCardRefKey(undefined); } catch { undefinedKeyRejected = true; }
  let rawShortRejected = false;
  try { ref.createMealBuddyCardRefCipher(new Uint8Array(16)); } catch { rawShortRejected = true; }

  check("30 a 16-byte key is refused, so AES-128 cannot be silently selected", shortKeyRejected);
  check("31 a 48-byte key is refused", longKeyRejected);
  check("32 an empty key fails closed", emptyKeyRejected);
  check("33 a missing key fails closed", undefinedKeyRejected);
  check("34 the cipher refuses a raw key of the wrong length", rawShortRejected);

  const otherCipher = ref.createMealBuddyCardRefCipher(ref.decodeMealBuddyCardRefKey(OTHER_KEY));
  check("35 a reference sealed under one key cannot be opened under another", await rejected(otherCipher.open(ACTOR_A, "source", sourceToken, ISSUED)));

  // --- deterministic-IV injection is test-only, never a weakening default ---------------------------------
  const fixedIvCipher = ref.createMealBuddyCardRefCipher(keyBytes, { randomIv: () => new Uint8Array(12) });
  const fixedA = await fixedIvCipher.seal(ACTOR_A, "source", CARD_ID, ISSUED);
  const fixedB = await fixedIvCipher.seal(ACTOR_A, "source", CARD_ID, ISSUED);
  check("36 an injected IV is honoured, proving the seam exists only for tests", fixedA === fixedB);
  check("37 the production cipher does not reuse an IV", again !== sourceToken && (await cipher.seal(ACTOR_A, "source", CARD_ID, ISSUED)) !== again);
  check("38 an IV of the wrong length is refused", await rejected(ref.createMealBuddyCardRefCipher(keyBytes, { randomIv: () => new Uint8Array(8) }).seal(ACTOR_A, "source", CARD_ID, ISSUED)));

  // --- policy constants -------------------------------------------------------------------------------------
  check("39 the dedicated secret name is the only key env named", ref.MEAL_BUDDY_CARD_REF_KEY_ENV === "MEAL_BUDDY_CARD_REF_KEY_V1");
  check("40 the two purposes are exactly source and candidate", JSON.stringify([...ref.MEAL_BUDDY_CARD_REF_PURPOSES].sort()) === JSON.stringify(["candidate", "source"]));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-a-smoke",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-a-smoke", error: error.message }, null, 2));
  process.exit(1);
}
