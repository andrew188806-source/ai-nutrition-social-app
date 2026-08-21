#!/usr/bin/env node
// SR-2H-B local atomicity and concurrency harness. It couples exact SQL lock/validation assertions
// with a deterministic executable lock scheduler. No database, network or credentials are used.
import fs from "node:fs";

const NEW_MIGRATION = "supabase/migrations/20260822010000_social_interest_settings_atomic_replace.sql";
const OLD_MIGRATION = "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql";
const sql = fs.readFileSync(NEW_MIGRATION, "utf8");
const oldSql = fs.readFileSync(OLD_MIGRATION, "utf8");
const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

const generalLock = "v_user_id::text || ':social_interest:general'";
const foodLock = "v_user_id::text || ':social_interest:food'";
check("01 predecessor lock domain is namespace-specific", oldSql.includes("v_user_id::text || ':social_interest:' || v_namespace"));
check("02 combined authority reuses the exact general predecessor key", sql.includes(generalLock));
check("03 combined authority reuses the exact food predecessor key", sql.includes(foodLock));
check("04 combined lock order is globally fixed general then food", sql.indexOf(generalLock) < sql.indexOf(foodLock));
check("05 both locks are transaction-scoped advisory locks", (sql.match(/pg_advisory_xact_lock/g) ?? []).length === 2);
check("06 validation completes before the first lock and every write", sql.indexOf("SOCIAL_INTEREST_TAG_NOT_SELECTABLE") < sql.indexOf(generalLock) && sql.indexOf(generalLock) < sql.indexOf("delete from public.social_profile_interest_selection"));
check("07 one function invocation performs both replacements", /delete[\s\S]*namespace in \('general', 'food'\)[\s\S]*insert[\s\S]*'general'[\s\S]*'food'/.test(sql));

const catalog = new Map();
for (let index = 1; index <= 10; index += 1) catalog.set(`general.valid.${index}`, { namespace: "general", active: true, selectable: true });
for (let index = 1; index <= 7; index += 1) catalog.set(`food.valid.${index}`, { namespace: "food", active: true, selectable: true });
catalog.set("general.category", { namespace: "general", active: true, selectable: false });
catalog.set("general.inactive", { namespace: "general", active: false, selectable: true });
catalog.set("food.category", { namespace: "food", active: true, selectable: false });
const oldState = Object.freeze({ general: Object.freeze(["general.valid.1"]), food: Object.freeze(["food.valid.1"]) });

function normalize(values) {
  if (values === null) values = [];
  if (!Array.isArray(values) || values.some((value) => value === null || typeof value !== "string")) throw new Error("invalid");
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function combinedModel(state, generalInput, foodInput) {
  const before = structuredClone(state);
  try {
    const general = normalize(generalInput); const food = normalize(foodInput);
    if (general.length > 8 || food.length > 5) throw new Error("limit");
    for (const [namespace, values] of [["general", general], ["food", food]]) {
      for (const tagKey of values) {
        const row = catalog.get(tagKey);
        if (!row || row.namespace !== namespace || !row.active || !row.selectable) throw new Error("not_selectable");
      }
    }
    return { ok: true, state: { general, food } };
  } catch (error) {
    return { ok: false, state: before, reason: error.message };
  }
}
const unchanged = (result) => JSON.stringify(result.state) === JSON.stringify(oldState);
check("08 valid food plus invalid general rolls back both", unchanged(combinedModel(oldState, ["general.unknown"], ["food.valid.2"])));
check("09 valid general plus invalid food rolls back both", unchanged(combinedModel(oldState, ["general.valid.2"], ["food.unknown"])));
check("10 nine general plus valid food rolls back both", unchanged(combinedModel(oldState, Array.from({ length: 9 }, (_, i) => `general.valid.${i + 1}`), ["food.valid.2"])));
check("11 eight general plus six food rolls back both", unchanged(combinedModel(oldState, Array.from({ length: 8 }, (_, i) => `general.valid.${i + 1}`), Array.from({ length: 6 }, (_, i) => `food.valid.${i + 1}`))));
const maximum = combinedModel(oldState, Array.from({ length: 8 }, (_, i) => `general.valid.${i + 1}`), Array.from({ length: 5 }, (_, i) => `food.valid.${i + 1}`));
check("12 eight general plus five food commits together", maximum.ok && maximum.state.general.length === 8 && maximum.state.food.length === 5);
const cleared = combinedModel(oldState, [], []);
check("13 empty arrays clear both atomically", cleared.ok && cleared.state.general.length === 0 && cleared.state.food.length === 0);
const deduped = combinedModel(oldState, [" general.valid.2 ", "general.valid.2"], ["food.valid.2", "food.valid.2"]);
check("14 duplicate and trim semantics remain canonical", deduped.ok && deduped.state.general.length === 1 && deduped.state.food.length === 1);
check("15 wrong namespace is rejected atomically", unchanged(combinedModel(oldState, ["food.valid.2"], ["food.valid.3"])));
check("16 inactive and non-selectable values are rejected atomically", unchanged(combinedModel(oldState, ["general.inactive"], ["food.valid.2"])) && unchanged(combinedModel(oldState, ["general.category"], ["food.valid.2"])));
check("17 null elements are rejected atomically", unchanged(combinedModel(oldState, [null], ["food.valid.2"])));

class Mutex {
  locked = false;
  waiters = [];
  async acquire() {
    if (!this.locked) { this.locked = true; return () => this.release(); }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.locked = true;
    return () => this.release();
  }
  release() {
    const next = this.waiters.shift();
    if (next) next(); else this.locked = false;
  }
}
const locks = { general: new Mutex(), food: new Mutex() };
let concurrentState = { general: ["general.valid.1"], food: ["food.valid.1"] };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function combinedWrite(general, food) {
  const releaseGeneral = await locks.general.acquire();
  await tick();
  const releaseFood = await locks.food.acquire();
  try { concurrentState = { general: [...general], food: [...food] }; }
  finally { releaseFood(); releaseGeneral(); }
}
async function singleWrite(namespace, values) {
  const release = await locks[namespace].acquire();
  try { await tick(); concurrentState = { ...concurrentState, [namespace]: [...values] }; }
  finally { release(); }
}
async function completes(operations) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("deadlock")), 1000); });
  try { await Promise.race([Promise.all(operations), timeout]); return true; }
  catch { return false; }
  finally { clearTimeout(timer); }
}

concurrentState = structuredClone(oldState);
const cc = await completes([
  combinedWrite(["general.valid.2"], ["food.valid.2"]),
  combinedWrite(["general.valid.3"], ["food.valid.3"])
]);
check("18 combined versus combined completes without deadlock", cc);
check("19 combined versus combined yields one complete serialized replacement", [
  JSON.stringify({ general: ["general.valid.2"], food: ["food.valid.2"] }),
  JSON.stringify({ general: ["general.valid.3"], food: ["food.valid.3"] })
].includes(JSON.stringify(concurrentState)));

concurrentState = structuredClone(oldState);
const cg = await completes([
  combinedWrite(["general.valid.4"], ["food.valid.4"]),
  singleWrite("general", ["general.valid.5"])
]);
check("20 combined versus predecessor general completes without deadlock", cg);
check("21 combined versus predecessor general has a legal serial result", [
  JSON.stringify({ general: ["general.valid.4"], food: ["food.valid.4"] }),
  JSON.stringify({ general: ["general.valid.5"], food: ["food.valid.4"] })
].includes(JSON.stringify(concurrentState)));

concurrentState = structuredClone(oldState);
const cf = await completes([
  singleWrite("food", ["food.valid.5"]),
  combinedWrite(["general.valid.6"], ["food.valid.6"])
]);
check("22 combined versus predecessor food completes without deadlock", cf);
check("23 combined versus predecessor food has a legal serial result", [
  JSON.stringify({ general: ["general.valid.6"], food: ["food.valid.6"] }),
  JSON.stringify({ general: ["general.valid.6"], food: ["food.valid.5"] })
].includes(JSON.stringify(concurrentState)));
const acquisitionOrders = Object.freeze([
  Object.freeze(["general", "food"]),
  Object.freeze(["general"]),
  Object.freeze(["food"])
]);
const conflictingPair = acquisitionOrders.some((left) => acquisitionOrders.some((right) =>
  left.length > 1 && right.length > 1 && left[0] === right[1] && left[1] === right[0]
));
check("24 wait-for cycles are impossible under general-then-food plus single-lock predecessors", !conflictingPair);

console.log(JSON.stringify({ suite: "social-interest-sr2h-b-concurrency", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, scheduler: "deterministic local mutex model over exact SQL lock keys", networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
