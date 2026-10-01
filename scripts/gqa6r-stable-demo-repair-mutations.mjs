#!/usr/bin/env node
// Negative proof for the GQA-6R exact successor record: in-memory record mutations, then REAL frozen guards
// in a throwaway shared clone placed inside this checkout (so typescript resolves; no links are created):
// exact repair accepted, a changed repair byte rejected, an extra product path rejected.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { GQA6R_PRODUCT_PATHS, collectGqa6rRepairEvidence, matchesExactGqa6rRepair } from "./gqa6r-stable-demo-repair-manifest.mjs";

const ROOT = process.cwd();
const results = [];
const expect = (name, ok) => results.push({ name, pass: Boolean(ok) });

const ev = collectGqa6rRepairEvidence(ROOT);
expect("the exact record recognizes the current tree", matchesExactGqa6rRepair(ev));
const mutate = (name, change) => { const e = structuredClone(ev); change(e); expect(`record rejects: ${name}`, !matchesExactGqa6rRepair(e)); };
mutate("one changed product byte (SHA-256)", (e) => { e.sha256[GQA6R_PRODUCT_PATHS[0]] = "0".repeat(64); });
mutate("an extra product path beside the repair", (e) => { e.productDelta.push("apps/mobile/app/extra.tsx"); e.sha256["apps/mobile/app/extra.tsx"] = "a".repeat(64); });
mutate("an extra migration beside the repair", (e) => { e.productDelta.push("supabase/migrations/20990101000000_extra.sql"); });
mutate("a recorded path missing from the delta", (e) => { e.productDelta = e.productDelta.filter((f) => f !== GQA6R_PRODUCT_PATHS.at(-1)); });
mutate("a deleted recorded file", (e) => { e.sha256[GQA6R_PRODUCT_PATHS[1]] = null; });
mutate("the predecessor is not in history", (e) => { e.predecessorInHistory = false; });
mutate("a wildcard path", (e) => { e.productDelta[0] = "apps/mobile/**"; });
mutate("an empty delta", (e) => { e.productDelta = []; });

const cloneDir = path.join(ROOT, `.gqa6r-mut-${process.pid}`);
const g = (...args) => execFileSync("git", args, { cwd: cloneDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
try {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", ROOT, cloneDir], { stdio: "ignore" });
  g("-c", "core.longpaths=true", "checkout", "--quiet", "--detach", head);
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.startsWith(".gqa6r-"));
  const supplementArtifact = "docs/planning/pc2-onboarding-preparation/pc2-remediation-raw-output.zip";
  if (fs.existsSync(path.join(ROOT, supplementArtifact))) dirty.push(supplementArtifact);
  const overlay = () => { for (const f of dirty) { fs.mkdirSync(path.dirname(path.join(cloneDir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(cloneDir, f)); } };
  const reset = () => { g("reset", "--quiet", "--hard"); g("clean", "-fdq", "--", "apps", "supabase", "lib", "packages", "scripts"); overlay(); };
  const run = (guard) => spawnSync(process.execPath, [`scripts/${guard}.mjs`], { cwd: cloneDir, encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: "" } }).status;
  const REPAIR_FILE = "apps/mobile/app/today-intake.tsx";
  const scenarios = [
    ["one changed repair byte", () => fs.appendFileSync(path.join(cloneDir, REPAIR_FILE), "\n// changed\n")],
    ["an extra product path beside the repair", () => fs.writeFileSync(path.join(cloneDir, "apps/mobile/app/gqa6r-extra.tsx"), "export {};\n")]
  ];
  // Byte-exact successor guards: any deviation from the record is rejected.
  for (const guard of ["gqa6r-stable-demo-repair-guard", "admin-e1-guard", "gqa-2-closure-guard"]) {
    reset();
    expect(`real ${guard}: exact repair accepted`, run(guard) === 0);
    for (const [label, change] of scenarios) { reset(); change(); expect(`real ${guard}: ${label} rejected`, run(guard) !== 0); }
  }
  // The GQA-1 truthfulness guard is rule-based over product sources (not a byte pin): the exact repair
  // passes, and a truthfulness regression inside a recorded repair file is rejected.
  reset();
  expect("real gqa-1-truthfulness-guard: exact repair accepted", run("gqa-1-truthfulness-guard") === 0);
  for (const [label, text] of [["fake score reintroduced into Today Intake", "\n// >82<\n"], ["personal advice reintroduced into Today Intake", "\nconst reintroduced = 'intake.dinnerAdvice';\n"]]) {
    reset();
    fs.appendFileSync(path.join(cloneDir, REPAIR_FILE), text);
    expect(`real gqa-1-truthfulness-guard: ${label} rejected`, run("gqa-1-truthfulness-guard") !== 0);
  }
} finally {
  // A plain clone (no links) inside this checkout; removed only when it is exactly the directory created above.
  if (path.basename(cloneDir).startsWith(".gqa6r-mut-") && path.dirname(cloneDir) === ROOT && fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ suite: "gqa6r-stable-demo-repair-mutations", total: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed.map((f) => f.name), networkUsed: false }, null, 1));
process.exitCode = failed.length ? 1 : 0;
