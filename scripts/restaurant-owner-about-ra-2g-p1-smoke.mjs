#!/usr/bin/env node
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import ts from "typescript"; import { createRequire } from "node:module";
const tests = []; const check = (n, p) => { tests.push([n, !!p]); console.log(`${p ? "PASS" : "FAIL"} ${n}`); };
async function moduleFrom(file) {
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const c = await moduleFrom("apps/restaurant-web/runtime/restaurant-owner-about.ts");

// --- canonicalization -------------------------------------------------------------------------
check("outer ASCII space trimmed", c.canonicalizeRestaurantAbout("  hello  ") === "hello");
check("interior spaces preserved", c.canonicalizeRestaurantAbout("a  b   c") === "a  b   c");
check("LF line breaks preserved", c.canonicalizeRestaurantAbout("line one\nline two") === "line one\nline two");
check("multiple lines preserved", c.canonicalizeRestaurantAbout("a\nb\nc") === "a\nb\nc");
check("emoji preserved", c.canonicalizeRestaurantAbout("好吃😀好玩") === "好吃😀好玩");
check("ordinary Unicode (Traditional Chinese) preserved", c.canonicalizeRestaurantAbout("台北巷弄中的家常料理小店。") === "台北巷弄中的家常料理小店。");
check("empty after trim rejected", c.canonicalizeRestaurantAbout("   ") === null);
check("whitespace-only (space + LF) rejected", c.canonicalizeRestaurantAbout("  \n  \n  ") === null);
check("bare LF (non-empty but whitespace-only) rejected", c.canonicalizeRestaurantAbout("\n") === null);
check("TAB rejected", c.canonicalizeRestaurantAbout("a\tb") === null);
check("CR rejected", c.canonicalizeRestaurantAbout("a\rb") === null);
check("NUL rejected", c.canonicalizeRestaurantAbout(`a${String.fromCharCode(0)}b`) === null);
check("C1 control rejected", c.canonicalizeRestaurantAbout(`a${String.fromCharCode(0x85)}b`) === null);
const base = "文".repeat(798);
check("exactly 800 code points accepted", c.canonicalizeRestaurantAbout(base + "文文") !== null
  && [...c.canonicalizeRestaurantAbout(base + "文文")].length === 800);
check("801 code points rejected", c.canonicalizeRestaurantAbout(base + "文文文") === null);
check("1 code point accepted", c.canonicalizeRestaurantAbout("A") === "A");
check("HTML not interpreted (stored verbatim as text, not parsed)", c.canonicalizeRestaurantAbout("<b>x</b>") === "<b>x</b>");
check("Markdown not interpreted (stored verbatim as text, not parsed)", c.canonicalizeRestaurantAbout("**x**") === "**x**");

// --- parsePublicSocialInput-equivalent strict DTO parsing --------------------------------------
const set = { operation: "set", nextRestaurantAbout: "  台北巷弄中的家常料理小店。  ", expectedRestaurantAbout: null, expectedVersion: "0" };
check("strict SET canonicalizes", c.parseRestaurantAboutInput(set)?.nextRestaurantAbout === "台北巷弄中的家常料理小店。");
check("SET unknown key rejected", c.parseRestaurantAboutInput({ ...set, source: "RESTAURANT_PROVIDED" }) === null);
check("SET cannot supply source", c.parseRestaurantAboutInput({ ...set, restaurantAboutSource: "RESTAURANT_PROVIDED" }) === null);
check("SET cannot supply actor", c.parseRestaurantAboutInput({ ...set, actorAuthUserId: "x" }) === null);
check("strict CLEAR accepted", c.parseRestaurantAboutInput({ operation: "clear", expectedRestaurantAbout: null, expectedVersion: "0" })?.operation === "clear");
check("CLEAR rejects nextRestaurantAbout", c.parseRestaurantAboutInput({ operation: "clear", nextRestaurantAbout: null, expectedRestaurantAbout: null, expectedVersion: "0" }) === null);
check("malformed expected value rejected", c.parseRestaurantAboutInput({ ...set, expectedRestaurantAbout: "   " }) === null);

const preview = { ok: true, state: "ready", restaurantId: "rest-a", restaurantAbout: null, restaurantAboutVersion: "0" };
check("nullable preview accepted", c.parseRestaurantAboutPreview(preview)?.state === "ready");
check("malformed preview about rejected", c.parseRestaurantAboutPreview({ ...preview, restaurantAbout: "   " }) === null);
check("preview does not carry a source or version-only badge label", !Object.keys(preview).includes("verified")
  && !Object.keys(preview).includes("certified") && !Object.keys(preview).includes("approved"));

const mutation = { ok: true, state: "applied", restaurantId: "rest-a", restaurantAbout: "台北巷弄中的家常料理小店。", restaurantAboutVersion: "1", auditId: "11111111-1111-4111-8111-111111111111" };
check("strict mutation accepted", c.parseRestaurantAboutMutation(mutation)?.state === "applied");
check("private audit id withheld from API DTO", c.parseRestaurantAboutApiMutation({ state: "applied", restaurantId: "rest-a", restaurantAbout: "x", restaurantAboutVersion: "1" })?.state === "applied");
check("unknown response key rejected", c.parseRestaurantAboutMutation({ ...mutation, x: 1 }) === null);
check("raw RPC receipt (with auditId) rejected at API boundary", c.parseRestaurantAboutApiMutation(mutation) === null);

// --- mobile mapper -------------------------------------------------------------------------------
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "p1-about-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const mapperSource = fs.readFileSync("apps/mobile/features/restaurants/about/mapper.ts", "utf8");
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
fs.mkdirSync(path.join(temp, "apps/mobile/features/restaurants/about"), { recursive: true });
fs.writeFileSync(path.join(temp, "apps/mobile/features/restaurants/about/mapper.js"), ts.transpileModule(mapperSource, { compilerOptions: options }).outputText);
const mapper = createRequire(path.join(temp, "smoke.cjs"))("./apps/mobile/features/restaurants/about/mapper.js");
check("mobile mapper returns null for empty rows", mapper.mapRestaurantAboutRows([], "rest-a") === null);
check("mobile mapper maps a valid row", mapper.mapRestaurantAboutRows([{ restaurant_id: "rest-a", restaurant_about: "台北巷弄中的家常料理小店。" }], "rest-a")?.about === "台北巷弄中的家常料理小店。");
for (const [name, row] of [
  ["wrong tenant", { restaurant_id: "rest-b", restaurant_about: "x" }],
  ["whitespace-only", { restaurant_id: "rest-a", restaurant_about: "\n" }],
  ["control char", { restaurant_id: "rest-a", restaurant_about: `a${String.fromCharCode(9)}b` }],
  ["oversized", { restaurant_id: "rest-a", restaurant_about: "文".repeat(801) }]
]) { let killed = false; try { mapper.mapRestaurantAboutRows([row], "rest-a"); } catch { killed = true; } check(`mobile rejects ${name}`, killed); }

const failed = tests.filter(([, p]) => !p);
console.log(JSON.stringify({ suite: "ra-2g-p1-smoke", total: tests.length, passed: tests.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
