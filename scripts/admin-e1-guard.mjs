#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import cp from "node:child_process";
import { BASELINE, FILES, ROUTES, baselineFile, readSources, validateAdminE1 } from "./admin-e1-rules.mjs";
const root = process.cwd();
const pages = fs.readdirSync("apps/admin-web/app", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(`apps/admin-web/app/${entry.name}/page.tsx`))
  .map((entry) => entry.name).filter((name) => name !== "admin");
pages.push("");
assert.deepEqual(pages.sort(), Object.keys(ROUTES).sort(), "exact physical root inventory");
const baseline = Object.fromEntries(["registry","shell","receipt","cors","index"].map((key) => [key,baselineFile(FILES[key])]));
const failures = validateAdminE1(readSources(),baseline);
assert.deepEqual(failures, [], failures.join("; "));
const migrationDiff = cp.spawnSync("git",["diff","--name-only",BASELINE,"--","supabase/migrations"],{cwd:root,encoding:"utf8"});
assert.equal(migrationDiff.status,0);
assert.equal(migrationDiff.stdout.trim(),"","historical migrations unchanged");
const protectedPaths = ["apps/admin-web/app/admin", "apps/admin-web/components/admin-shell",
  "apps/admin-web/middleware.ts", "apps/admin-web/auth", "apps/admin-web/config",
  "supabase/functions", "apps/mobile", "apps/restaurant-web", "packages/shared"];
const protectedDiff = cp.spawnSync("git",["diff","--name-only",BASELINE,"--",...protectedPaths],{cwd:root,encoding:"utf8"});
assert.equal(protectedDiff.status,0);
assert.equal(protectedDiff.stdout.trim(),"","canonical Admin/Consumer/Restaurant and authority sources unchanged");
const eol = cp.spawnSync("git",["ls-files","--eol"],{cwd:root,encoding:"utf8",maxBuffer:5*1024*1024});
assert.equal(eol.status,0);
const anomalous = eol.stdout.split("\n").filter((line) => /i\/lf/.test(line) && !/w\/lf/.test(line));
assert.equal(anomalous.length,0,`tracked LF files converted in worktree: ${anomalous.length}`);
console.log(`ADMIN-E1 guard PASS: 22 routes, authority, AAL2, EOL, CORS, matrix; ${eol.stdout.split("\n").filter(Boolean).length} tracked files have no LF-index/CRLF-worktree mismatch`);
