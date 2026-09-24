#!/usr/bin/env node
// Local ADMIN-E final live closure record only; no network or remote acceptance.
import assert from "node:assert/strict";
import { FILES, baselineFile, readSources, validateAdminE1, validateAdminEFinal } from "./admin-e1-rules.mjs";
import { exactAdminE1SuccessorState } from "./admin-e1-historical-successor.mjs";

const source = readSources();
const baseline = Object.fromEntries(["registry", "shell", "receipt", "cors", "index"]
  .map((key) => [key, baselineFile(FILES[key])]));
assert.deepEqual(validateAdminE1(source, baseline), [], "E1 invariant must survive the final closure record");
assert.deepEqual(validateAdminEFinal(source), [], "exact ADMIN-E final live closure contract");
assert.equal(exactAdminE1SuccessorState(), "final", "exact final document/rule digests and E1 product pins");
console.log("ADMIN-E final guard PASS: three fixed URLs at 31b55d3, cross-principal Primary bootstrap, permanent broker, exact document and product pins");
