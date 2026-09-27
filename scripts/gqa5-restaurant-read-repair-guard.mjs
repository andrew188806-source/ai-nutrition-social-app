#!/usr/bin/env node
// GQA-5 Restaurant catalogue read repair guard: exact successor identity + structural cause removed.
// Static only: no network, no database.
import fs from "node:fs";
import path from "node:path";
import { readManifest } from "./db-migration-baseline-manifest.mjs";
import { GQA5_REPAIR_MIGRATION, collectGqa5RepairEvidence, matchesExactGqa5RestaurantReadRepair } from "./gqa5-restaurant-read-repair-manifest.mjs";
import { validateRepairMigration } from "./gqa5-restaurant-read-repair-rules.mjs";

const ROOT = process.cwd();
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, pass: Boolean(ok), detail: ok ? undefined : detail }); console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); };
const evidence = collectGqa5RepairEvidence(ROOT);
check("the repair migration is the exact recorded successor (path, LF SHA-256, blob, position after ADMIN-D, 139 + 1 files)", matchesExactGqa5RestaurantReadRepair(evidence),
  { exists: evidence.exists, count: evidence.migrationFiles.length, last: evidence.migrationFiles.at(-1) });
const manifest = readManifest();
const historicalNames = manifest.entries.map((e) => path.basename(e.path));
const historicalTexts = historicalNames.map((n) => fs.readFileSync(path.join(ROOT, "supabase/migrations", n), "utf8"));
const failures = validateRepairMigration(fs.readFileSync(path.join(ROOT, GQA5_REPAIR_MIGRATION), "utf8"), historicalTexts);
check("the repair keeps every read RPC's query text verbatim, re-expresses exactly the fifteen reader policies through invoker lookups, and weakens nothing", failures.length === 0, failures);
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: "gqa5-restaurant-read-repair-guard", total: checks.length, failed: failed.length, failures: failed, networkUsed: false, databaseUsed: false }));
process.exitCode = failed.length ? 1 : 0;
