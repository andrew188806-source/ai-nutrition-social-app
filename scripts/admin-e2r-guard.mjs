#!/usr/bin/env node
// Local E2R documentation transition only; no network or remote acceptance.
import assert from "node:assert/strict";
import { FILES, baselineFile, readSources, validateAdminE1, validateAdminE2R } from "./admin-e1-rules.mjs";
import { exactAdminE1SuccessorState } from "./admin-e1-historical-successor.mjs";

const source = readSources();
const baseline = Object.fromEntries(["registry", "shell", "receipt", "cors", "index"]
  .map((key) => [key, baselineFile(FILES[key])]));
assert.deepEqual(validateAdminE1(source, baseline), [], "E1 invariant must survive the E2R handoff");
assert.deepEqual(validateAdminE2R(source), [], "exact E2R handoff contract");
assert.equal(exactAdminE1SuccessorState(), "e2r", "exact E2R document/rule digests and E1 product pins");
console.log("ADMIN-E2R guard PASS: three fixed URLs, pre-push source, partial live state, Primary target, exact document and product pins");
