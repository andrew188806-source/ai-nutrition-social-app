#!/usr/bin/env node
// Negative proof for the PC-1 closure guard: in-memory record mutations, then the REAL guard in a
// throwaway clone placed inside this checkout (so node resolves the same toolchain; no links created).
// Each scenario damages one contract, expects the guard to fail, then restores the exact original bytes
// (or removes the file it created) — no git reset/clean is used anywhere.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PC1_PRODUCT_PATHS, collectPc1Evidence, matchesExactPc1 } from "./pc1-consumer-closure-manifest.mjs";
import { collectGqa6rRepairEvidence, matchesExactGqa6rRepair } from "./gqa6r-stable-demo-repair-manifest.mjs";

const ROOT = process.cwd();
const results = [];
const expect = (name, ok) => results.push({ name, pass: Boolean(ok) });

// ---- record-level
const ev = collectPc1Evidence(ROOT);
expect("the exact PC-1 record recognizes the current tree", matchesExactPc1(ev));
const mutate = (name, change) => { const e = structuredClone(ev); change(e); expect(`record rejects: ${name}`, !matchesExactPc1(e)); };
mutate("one changed product byte (SHA-256)", (e) => { e.sha256[PC1_PRODUCT_PATHS[0]] = "0".repeat(64); });
mutate("an extra product path beside PC-1", (e) => { e.productDelta.push("apps/mobile/app/extra.tsx"); e.sha256["apps/mobile/app/extra.tsx"] = "a".repeat(64); });
mutate("an extra migration beside PC-1", (e) => { e.productDelta.push("supabase/migrations/20990101000000_extra.sql"); e.sha256["supabase/migrations/20990101000000_extra.sql"] = "b".repeat(64); });
mutate("a recorded path missing from the delta", (e) => { e.productDelta = e.productDelta.filter((f) => f !== PC1_PRODUCT_PATHS.at(-1)); });
mutate("a deleted recorded file", (e) => { e.sha256[PC1_PRODUCT_PATHS[1]] = null; });
mutate("the predecessor is not in history", (e) => { e.predecessorInHistory = false; });
mutate("a wildcard path", (e) => { e.productDelta[0] = "apps/mobile/**"; });
mutate("a brace path", (e) => { e.productDelta[0] = "apps/mobile/{a,b}.ts"; });
mutate("an empty delta", (e) => { e.productDelta = []; });

// ---- the chained GQA-6R route beneath PC-1 (the only predecessor recognition edit)
const gev = collectGqa6rRepairEvidence(ROOT);
expect("GQA-6R is recognized beneath the exact PC-1 successor", matchesExactGqa6rRepair(gev));
const chain = (name, change) => { const e = structuredClone(gev); change(e); expect(`GQA-6R chain rejects: ${name}`, !matchesExactGqa6rRepair(e)); };
const pc1Only = PC1_PRODUCT_PATHS.find((f) => !gev.productDelta.every((g) => g !== f)) ?? PC1_PRODUCT_PATHS[0];
const gqaOnly = gev.productDelta.find((f) => !PC1_PRODUCT_PATHS.includes(f));
chain("a tampered PC-1 byte (forged successor)", (e) => { e.pc1.sha256[pc1Only] = "0".repeat(64); });
chain("an incomplete PC-1 successor (a recorded PC-1 path missing)", (e) => { e.pc1.productDelta = e.pc1.productDelta.filter((f) => f !== PC1_PRODUCT_PATHS.at(-1)); });
chain("an extra path beside GQA-6R ∪ PC-1", (e) => { e.productDelta.push("apps/mobile/app/forged.tsx"); e.sha256["apps/mobile/app/forged.tsx"] = "c".repeat(64); });
chain("a changed GQA-6R-only byte underneath PC-1", (e) => { e.sha256[gqaOnly] = "d".repeat(64); });
chain("the PC-1 predecessor not in history", (e) => { e.pc1.predecessorInHistory = false; });
chain("a PC-1 extra product path (dirty tree with PC-1 filenames)", (e) => { e.pc1.productDelta.push("apps/mobile/app/dirty.tsx"); e.pc1.sha256["apps/mobile/app/dirty.tsx"] = "e".repeat(64); });
chain("no PC-1 evidence at all", (e) => { delete e.pc1; });

// ---- guard-level, in a disposable clone
const cloneDir = path.join(ROOT, `.pc1-mut-${process.pid}`);
const inClone = (file) => path.join(cloneDir, file);
try {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", ROOT, cloneDir], { stdio: "ignore" });
  execFileSync("git", ["-c", "core.longpaths=true", "-c", "core.autocrlf=false", "checkout", "--quiet", "--detach", head], { cwd: cloneDir, stdio: "ignore" });
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.startsWith(".pc1-"));
  for (const f of dirty) { fs.mkdirSync(path.dirname(inClone(f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), inClone(f)); }
  const run = () => spawnSync(process.execPath, ["scripts/pc1-consumer-closure-guard.mjs"], { cwd: cloneDir, encoding: "utf8",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: "" } }).status;

  // Apply one damage, run the real guard, restore exactly.
  const scenario = (label, file, damage, { create = false } = {}) => {
    const target = inClone(file);
    const original = create ? null : fs.readFileSync(target);
    try {
      if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
      damage(target, original);
      expect(`real guard rejects: ${label}`, run() !== 0);
    } finally {
      if (create) fs.rmSync(target, { force: true });
      else fs.writeFileSync(target, original);
    }
  };
  const replaceIn = (from, to) => (target, original) => {
    const text = original.toString("utf8");
    if (!text.includes(from)) throw new Error(`mutation anchor missing: ${from}`);
    fs.writeFileSync(target, text.replace(from, to));
  };

  expect("real guard accepts the exact PC-1 tree", run() === 0);
  scenario("a changed product byte", "apps/mobile/app/meal-buddies.tsx", (t, o) => fs.writeFileSync(t, Buffer.concat([o, Buffer.from("\n// changed\n")])));
  scenario("an extra product path", "apps/mobile/app/pc1-extra.tsx", (t) => fs.writeFileSync(t, "export {};\n"), { create: true });
  scenario("an unexpected non-product path", "docs/pc1-unexpected.md", (t) => fs.writeFileSync(t, "x\n"), { create: true });
  scenario("a new migration", "supabase/migrations/20990101000000_pc1_extra.sql", (t) => fs.writeFileSync(t, "select 1;\n"), { create: true });
  scenario("a changed Supabase Function", "supabase/functions/meal-buddy-chat/index.ts", (t, o) => fs.writeFileSync(t, Buffer.concat([o, Buffer.from("\n")])));
  scenario("a lockfile change", "package-lock.json", (t, o) => fs.writeFileSync(t, Buffer.concat([o, Buffer.from("\n")])));
  scenario("the frozen SR-2G-E source-card port touched", "apps/mobile/features/meal-buddy-candidates/ports.ts", (t, o) => fs.writeFileSync(t, Buffer.concat([o, Buffer.from("\n")])));
  scenario("A1 relationship bound removed", "apps/mobile/features/meal-buddy-relationships/repository.ts",
    replaceIn("{ body: request, timeout: this.timeoutPolicy.timeoutMs }", "{ body: request }"));
  scenario("A1 unknown_server_state collapsed", "apps/mobile/features/meal-buddy-relationships/controller.ts",
    replaceIn('syncPhase: uncertain ? "unknown_server_state" : "stable"', 'syncPhase: "stable"'));
  scenario("A2 send re-bound to the global read sequence", "apps/mobile/features/meal-buddy-chat/controller.ts",
    replaceIn("const session = this.captureSession();", "const session = this.captureSession(); this.captureRequest();"));
  scenario("A2 realtime no longer deferred during a send", "apps/mobile/features/meal-buddy-chat/controller.ts",
    replaceIn("if (this.sendInFlight) { this.reconcileDeferred = true; return false; }", ""));
  scenario("A2 composer back to clear-after-ack", "apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx",
    replaceIn("void controller.send(body);", "void controller.send(body).then((sent) => { if (sent) setDraft(\"\"); });"));
  scenario("B1 demo tier toggle shown in live", "apps/mobile/app/meal-buddies.tsx",
    replaceIn("{isRealCandidateMode ? null : <DemoModeToggle mode={demoMode} onChange={setDemoMode} />}", "<DemoModeToggle mode={demoMode} onChange={setDemoMode} />"));
  scenario("B1 policyVersion no longer validated", "apps/mobile/features/meal-buddy-card-create/ownCardQuota.ts",
    replaceIn("value.policyVersion !== MEAL_BUDDY_CARD_WRITE_POLICY_VERSION", "false"));
  scenario("B2 detail line back to hand concatenation", "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
    replaceIn("{formatNextMealLocationLine(selectedCandidate)}", "{[selectedCandidate.restaurantName, selectedCandidate.branchName, selectedCandidate.areaLabel].filter(Boolean).join(\" · \")}"));
  scenario("a secret literal in a PC-1 validation file", "scripts/pc1-next-meal-location-label-smoke.mjs",
    (t, o) => fs.writeFileSync(t, Buffer.concat([o, Buffer.from(`\n// ${"sb_" + "secret_"}${"a".repeat(24)}\n`)])));
  scenario("a BOM in a PC-1 validation file", "scripts/pc1-next-meal-location-label-smoke.mjs",
    (t, o) => fs.writeFileSync(t, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), o])));
  scenario("the inherited BOM removed from a recorded product file", "apps/mobile/app/meal-buddies.tsx",
    (t, o) => fs.writeFileSync(t, o.subarray(3)));
  scenario("CRLF in a PC-1 validation file", "scripts/pc1-next-meal-location-label-smoke.mjs",
    (t, o) => fs.writeFileSync(t, Buffer.from(o.toString("utf8").replace(/\n/g, "\r\n"))));
  expect("real guard accepts the exact PC-1 tree again after every restore", run() === 0);
} finally {
  // A plain clone (no links) inside this checkout; removed only when it is exactly the directory created above.
  if (path.basename(cloneDir).startsWith(".pc1-mut-") && path.dirname(cloneDir) === ROOT && fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}`);
console.log(JSON.stringify({ suite: "pc1-consumer-closure-mutations", total: results.length, rejected: results.filter((r) => /rejects/.test(r.name) && r.pass).length,
  failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
