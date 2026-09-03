#!/usr/bin/env node
import { readSources, runSmoke } from "./platform-admin-ra-1b-contract.mjs";

const checks = await runSmoke(readSources(), { onCheck: (item) => console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}${item.detail ? `: ${item.detail}` : ""}`) });
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1b-smoke", total: checks.length, passed: checks.length - failures.length,
  failed: failures.length, failures, databaseUsed: false, transport: "fixture HTTP, real RA-1A and RA-1B modules" }, null, 2));
if (failures.length) process.exitCode = 1;
