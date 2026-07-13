import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/consumer-meal-records-phase-2j-smoke.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TASTKIND_CONSUMER_PHASE2J_MOCK_CONTRACT: "true"
  },
  encoding: "utf8"
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
