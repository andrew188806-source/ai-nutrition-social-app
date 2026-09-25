#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import cp from "node:child_process";
import crypto from "node:crypto";
import { isExactMrbSuccessor } from "./admin-mrb-successor-manifest.mjs";
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
const changedProtected = protectedDiff.stdout.trim().split("\n").filter(Boolean);
if (changedProtected.length) {
  // ADMIN-MRB changes only this pinned staff-detail integration and its local
  // preset sources. Preserve the historical E1 assertion for every other path.
  const mrbBaseline = "2fe70443d9292a7fc9cddad0e717266b4996c3f3";
  const mrbSources = {
    "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx": "0ef81ebb8d76ac4e11fcc9a170109f87faf2b15454012453ab3f8d15f90eb662",
    "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx": "59ee0b7700c78e618e2afbd4593fc832c56b686c1ca619390f8f70db0b10d8e2",
    "apps/admin-web/auth/admin-manager-presets.ts": "194f5e54ed202e3c3d5e7dd313c0d400861d584fae358a337ba22ab386489a7b",
    "apps/admin-web/auth/admin-manager-preset-flow.ts": "71a8dd37ecae8b760f5cb650a8127f00b41cd071ed93efb59dd1a68a0db655cf",
    "apps/admin-web/app/api/admin/management/staff/preset-preview/route.ts": "404844b184498de9b219962cbbdd481c2faad02b6d8af7532063c91518da4751",
    "apps/admin-web/server/adminManagerPresetReadRuntime.ts": "6f5e57ec75dc2622fa1144e354316a531a924037035c07e5bcfb27c9edd25914"
  };
  const git = (...args) => {
    const result = cp.spawnSync("git",args,{cwd:root,encoding:"utf8"});
    assert.equal(result.status,0);
    return result.stdout.trim();
  };
  const head = git("rev-parse","HEAD"), origin = git("rev-parse","origin/main");
  const localFreeze = head !== mrbBaseline && git("rev-parse","HEAD^") === mrbBaseline
    && git("rev-list","--left-right","--count","HEAD...origin/main") === "1\t0";
  assert.equal(origin,mrbBaseline,"ADMIN-MRB exact predecessor remains origin/main");
  assert.ok(head === mrbBaseline || localFreeze || isExactMrbSuccessor(),
    "only the pinned ADMIN-MRB local successor or its exact guard closure may change E1-protected sources");
  assert.ok(changedProtected.every((file) => Object.hasOwn(mrbSources,file)),
    `unexpected E1-protected changes: ${changedProtected.filter((file) => !Object.hasOwn(mrbSources,file)).join(", ")}`);
  for (const [file,expected] of Object.entries(mrbSources)) {
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),expected,
      `ADMIN-MRB source pin: ${file}`);
  }
}
const eol = cp.spawnSync("git",["ls-files","--eol"],{cwd:root,encoding:"utf8",maxBuffer:5*1024*1024});
assert.equal(eol.status,0);
const anomalous = eol.stdout.split("\n").filter((line) => /i\/lf/.test(line) && !/w\/lf/.test(line));
assert.equal(anomalous.length,0,`tracked LF files converted in worktree: ${anomalous.length}`);
console.log(`ADMIN-E1 guard PASS: 22 routes, authority, AAL2, EOL, CORS, matrix; ${eol.stdout.split("\n").filter(Boolean).length} tracked files have no LF-index/CRLF-worktree mismatch`);
