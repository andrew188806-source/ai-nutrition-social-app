#!/usr/bin/env node
import assert from "node:assert/strict";
import { FILES, baselineFile, readSources, validateAdminE1 } from "./admin-e1-rules.mjs";
const baseline = Object.fromEntries(["registry","shell","receipt","cors","index"].map((key) => [key,baselineFile(FILES[key])]));
const source = readSources();
assert.deepEqual(validateAdminE1(source,baseline),[]);
const mutants = [
 ["A retired mock route",s=>{s.pages["ad-review"]+='\nimport { mockAdReviews } from "@haocu/shared";';}],
 ["B deferred route LIVE",s=>{s.registry=s.registry.replace(/(id: "operations-ads"[^\n]+availability: ")DEMO/,"$1LIVE");}],
 ["C split gateway fake rows",s=>{s.pages.tags+='\nconst mockTagReviews = [];';}],
 ["D private consent mock",s=>{s.pages.consents+='\nconst mockAdminConsents = [];';}],
 ["E privileged bypass",s=>{s.registry+='\nif (isHighestPrivilege) return true;';}],
 ["F Demo credential",s=>{s.matrix+='\npassword=example-committed-secret';}],
 ["G Production backend",s=>{s.matrix=s.matrix.replaceAll("tastkind-development","tastkind-production");}],
 ["H CORS wildcard",s=>{s.cors+='\nconst allowOrigin = "*";';}],
 ["I origin hardcoded in Edge",s=>{s.cors+='\nconst origin = "https://haocu-demo.vercel.app";';}],
 ["J AAL2 window weakened",s=>{s.receipt=s.receipt.replace("expires_at = issued_at + interval '15 minutes'","expires_at = issued_at + interval '30 minutes'");}],
 ["K historical EOL normalization",s=>{s.attrs="* text=auto eol=crlf";}]
];
for(const [name,mutate] of mutants){const s=structuredClone(source);mutate(s);const failures=validateAdminE1(s,baseline);assert.ok(failures.length,`survived: ${name}`);console.log(`KILLED ${name}: ${failures[0]}`);}
console.log(`ADMIN-E1 mutations PASS: ${mutants.length}/${mutants.length} killed`);
