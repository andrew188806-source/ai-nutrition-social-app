#!/usr/bin/env node
import {
  auditClosureSources,
  auditDevelopmentSnapshot,
  auditRepositoryRoleDefinitions,
  discoverRepositoryRoleDefinitions,
  readClosureSources,
  validDevelopmentFixture
} from "./platform-admin-ra-1c-r1-contract.mjs";

const checks = [
  ...auditRepositoryRoleDefinitions(discoverRepositoryRoleDefinitions()),
  ...auditClosureSources(readClosureSources()),
  ...auditDevelopmentSnapshot(validDevelopmentFixture())
];
checks.forEach((item, index) => console.log(`${item.pass ? "PASS" : "FAIL"} ${index + 1} ${item.name}`));
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-r1-smoke", total: checks.length,
  passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
