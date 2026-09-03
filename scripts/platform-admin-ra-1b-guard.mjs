#!/usr/bin/env node
import fs from "node:fs";
import child from "node:child_process";
import assert from "node:assert/strict";
import { auditRa1aSources, RA1A_PATHS, RA1A_NPM_KEYS } from "./platform-admin-ra-1a-successor-manifest.mjs";
import { BASELINE, SUBJECT, PATHS, SCRIPT_KEYS, readSources, auditSources } from "./platform-admin-ra-1b-contract.mjs";

const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (text) => text ? text.split(/\r?\n/) : [];
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const checks = auditSources(readSources());
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const dirty = [...new Set([...lines(git("diff", "--name-only", "HEAD")), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const changed = [...new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === BASELINE && ahead === 0;
const frozen = ahead === 1 && git("rev-parse", "HEAD^") === BASELINE && dirty.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
check("canonical origin remains frozen baseline", origin === BASELINE && behind === 0);
check("one RA-1B candidate or one clean local freeze", candidate || frozen);
check("exact RA-1B path allowlist", JSON.stringify(changed) === JSON.stringify(PATHS));
check("no staged content during validation", git("diff", "--cached", "--name-only") === "");
check("no deletion", git("diff", "--name-only", "--diff-filter=D", BASELINE) === "");
check("zero migrations, database authority or configuration changes", changed.every((file) => !/^(supabase|\.openai|\.codex|\.agents)\//.test(file)));
check("RA-1A files remain byte-equivalent after LF normalization", RA1A_PATHS.filter((file) => file !== "package.json")
  .every((file) => read(file).trimEnd() === git("show", `${BASELINE}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
const ra1a = Object.fromEntries(RA1A_PATHS.map((file) => [file, read(file)]));
check("frozen RA-1A source security contract remains intact", auditRa1aSources(ra1a).length === 0);
const pkg = JSON.parse(read("package.json"));
const basePkg = JSON.parse(git("show", `${BASELINE}:package.json`));
const expected = { ...basePkg, scripts: { ...basePkg.scripts,
  [SCRIPT_KEYS[0]]: "node scripts/platform-admin-ra-1b-guard.mjs",
  [SCRIPT_KEYS[1]]: "node scripts/platform-admin-ra-1b-smoke.mjs",
  [SCRIPT_KEYS[2]]: "node scripts/platform-admin-ra-1b-mutations.mjs" } };
let samePackage = true; try { assert.deepEqual(pkg, expected); } catch { samePackage = false; }
check("package adds only three RA-1B script entries and no dependencies", samePackage);
check("every RA-1A npm entry is unchanged", RA1A_NPM_KEYS.every((key) => pkg.scripts[key] === basePkg.scripts[key]));
check("unrelated Admin screens, login and other apps are unchanged", changed.filter((file) => file.startsWith("apps/")).every((file) => PATHS.includes(file)));
const sql = read("supabase/migrations/20260904010000_platform_admin_authority.sql");
check("frozen audit SQL enforces permission, latest-500 and stable ordering", sql.includes("where public.platform_admin_has_permission_v1('admin_audit.read')")
  && sql.includes("order by entry.created_at desc, entry.id desc") && sql.includes("limit least(greatest(coalesce(requested_limit, 100), 1), 500)"));
const secretShape = /(?:sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
check("no credential-shaped values in any RA-1B path", PATHS.every((file) => !secretShape.test(read(file))));
check("documentation records acceptance limitations and zero DB changes", /Development Acceptance/.test(read("docs/platform-admin-audit-ra-1b.md"))
  && /Migrations: 0/.test(read("docs/platform-admin-audit-ra-1b.md")));

for (const [index, item] of checks.entries()) console.log(`${item.pass ? "PASS" : "FAIL"} ${index + 1} ${item.name}`);
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1b-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, changedPaths: changed, migrations: 0 }, null, 2));
if (failures.length) process.exitCode = 1;
