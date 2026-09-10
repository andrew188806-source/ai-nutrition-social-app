#!/usr/bin/env node
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("apps/restaurant-web/runtime/restaurant-owner-branch-public-phone.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const tests = [];
const check = (name, pass) => { tests.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };
const set = (nextPublicPhone) => ({ operation: "set", expectedPublicPhone: null, nextPublicPhone, expectedVersion: "0" });

check("outer whitespace trimmed", contract.parsePublicPhoneInput(set("  +886 2-1234-5678 ext. 9  "))?.nextPublicPhone === "+886 2-1234-5678 ext. 9");
check("interior spaces and punctuation preserved", contract.parsePublicPhoneInput(set("02-1234  5678 #9"))?.nextPublicPhone === "02-1234  5678 #9");
check("plus permitted", contract.parsePublicPhoneInput(set("+1 (415) 555-0100"))?.nextPublicPhone.startsWith("+") === true);
check("whitespace-only SET rejected", contract.parsePublicPhoneInput(set("   ")) === null);
check("empty SET rejected", contract.parsePublicPhoneInput(set("")) === null);
check("one Unicode code point accepted", contract.parsePublicPhoneInput(set("電")) !== null);
check("32 Unicode code points accepted", contract.parsePublicPhoneInput(set("電".repeat(32))) !== null);
check("33 Unicode code points rejected", contract.parsePublicPhoneInput(set("電".repeat(33))) === null);
for (const [name, value] of [["newline", "12\n34"], ["CR", "12\r34"], ["tab", "12\t34"], ["NUL", "12\0 34"], ["C1", `12${String.fromCharCode(0x85)}34`]]) {
  check(`${name} rejected`, contract.parsePublicPhoneInput(set(value)) === null);
}
check("outer newline is rejected rather than trimmed away", contract.parsePublicPhoneInput(set("\n02-1234")) === null);
check("outer tab is rejected rather than trimmed away", contract.parsePublicPhoneInput(set("02-1234\t")) === null);
check("CLEAR strict shape accepted", contract.parsePublicPhoneInput({ operation: "clear", expectedPublicPhone: "02-1", expectedVersion: "1" })?.operation === "clear");
check("CLEAR rejects next value", contract.parsePublicPhoneInput({ operation: "clear", expectedPublicPhone: "02-1", nextPublicPhone: null, expectedVersion: "1" }) === null);
check("malformed expected phone rejected", contract.parsePublicPhoneInput({ operation: "clear", expectedPublicPhone: " 02-1", expectedVersion: "1" }) === null);
const preview = { ok: true, state: "ready", restaurantId: "restaurant-a", branchId: "branch-a", publicPhone: null, publicPhoneVersion: "0" };
check("nullable preview accepted", contract.parsePublicPhonePreview(preview)?.state === "ready");
check("malformed preview phone rejected", contract.parsePublicPhonePreview({ ...preview, publicPhone: " 02-1" }) === null);
check("empty preview phone rejected instead of coerced to NULL", contract.parsePublicPhonePreview({ ...preview, publicPhone: "" }) === null);
const mutation = { ok: true, state: "applied", branchId: "branch-a", publicPhone: "+886 2-1", publicPhoneVersion: "1", auditId: "11111111-1111-4111-8111-111111111111" };
const parsedMutation = contract.parsePublicPhoneMutation(mutation);
check("strict mutation accepted", parsedMutation?.state === "applied");
check("private audit id withheld", parsedMutation && !Object.hasOwn(parsedMutation, "auditId"));
check("unknown response key rejected", contract.parsePublicPhoneMutation({ ...mutation, website: "https://example.test" }) === null);
const apiMutation = { state: "applied", branchId: "branch-a", publicPhone: null, publicPhoneVersion: "2" };
check("strict minimal API mutation accepted", contract.parsePublicPhoneApiMutation(apiMutation)?.state === "applied");
check("raw RPC receipt rejected at API boundary", contract.parsePublicPhoneApiMutation(mutation) === null);

const failed = tests.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "ra-2i-p1a-smoke", total: tests.length, passed: tests.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
