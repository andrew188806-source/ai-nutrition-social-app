#!/usr/bin/env node
import { auditSources, readSources, runSmoke } from "./platform-admin-ra-1c-p1-contract.mjs";
const sources = readSources();
const checks = [...auditSources(sources), ...await runSmoke(sources, { onCheck: (item) => console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`) })];
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-smoke", total: checks.length, passed: checks.length - failures.length,
  failed: failures.length, failures, databaseUsed: false, transport: "fixture HTTP with real P1 modules" }, null, 2));
if (failures.length) process.exitCode = 1;
