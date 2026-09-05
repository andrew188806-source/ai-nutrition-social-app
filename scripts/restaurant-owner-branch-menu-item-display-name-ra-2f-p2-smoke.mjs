#!/usr/bin/env node
import fs from "node:fs";
import ts from "typescript";

const runtimePath = "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name.ts";
const routePath = "apps/restaurant-web/app/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/display-name/route.ts";
const source = fs.readFileSync(runtimePath, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const preview = { ok: true, state: "ready", branchMenuItemId: "dev-bmi-b-main", branchId: "dev-branch-b-main", menuItemId: "dev-item-b-main", branchSpecificDisplayName: null, branchSpecificDisplayNameVersion: "2", canonicalDisplayName: "B Item" };
const applied = { ok: true, state: "applied", branchMenuItemId: "dev-bmi-b-main", branchSpecificDisplayName: "B Item Test", branchSpecificDisplayNameVersion: "3", auditId: "00000000-0000-0000-0000-000000000000" };
const tests = [
  ["exact P1 preview DTO is accepted", mod.parsePreview(preview)?.branchSpecificDisplayName === null],
  ["exact P1 applied DTO is accepted", mod.parseMutation(applied)?.state === "applied"],
  ["auditId is withheld", !Object.hasOwn(mod.parseMutation(applied), "auditId")],
  ["unknown success key is rejected", mod.parseMutation({ ...applied, unexpected: true }) === null],
  ["wrong applied state is rejected", mod.parseMutation({ ...applied, state: "ready" }) === null],
  ["nullable expected name is preserved", mod.parseInput({ operation: "set", expectedDisplayName: null, nextDisplayName: "B Item Test", expectedVersion: "2" })?.expectedDisplayName === null],
  ["SET outer trim preserves interior whitespace", mod.parseInput({ operation: "set", expectedDisplayName: "B Item Test", nextDisplayName: "  B  Item  Test  ", expectedVersion: "3" })?.nextDisplayName === "B  Item  Test"],
  ["CLEAR has its own exact shape", mod.parseInput({ operation: "clear", expectedDisplayName: "B Item Test", expectedVersion: "3" })?.operation === "clear"],
  ["CLEAR rejects nextDisplayName", mod.parseInput({ operation: "clear", expectedDisplayName: "B Item Test", expectedVersion: "3", nextDisplayName: "B Item" }) === null],
  ["whitespace SET is invalid rather than CLEAR", mod.parseInput({ operation: "set", expectedDisplayName: null, nextDisplayName: "   ", expectedVersion: "2" }) === null],
  ["80 emoji code points accepted", mod.validDisplayName("😀".repeat(80))],
  ["81 emoji code points rejected", !mod.validDisplayName("😀".repeat(81))],
  ["controls rejected", !mod.validDisplayName("a\nb") && !mod.validDisplayName("a\tb") && !mod.validDisplayName("a\u0080b")],
  ["fixed route only", fs.readFileSync(routePath, "utf8").includes("previewMenuItemDisplayName") && !source.includes("PATCH")]
];
for (const [name, pass] of tests) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({ suite: "ra-2f-p2-smoke", total: tests.length, passed: tests.filter(([, pass]) => pass).length }));
if (tests.some(([, pass]) => !pass)) process.exitCode = 1;
