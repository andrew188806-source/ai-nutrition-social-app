#!/usr/bin/env node
// SR-1B-D2-B2 mutation proof — realistic executor privilege widening must be detected.
// Fully local: every temporary rewrite is restored; no network, database, credential, or Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const M = path.join(root, "supabase/migrations/20260810050000_social_runtime_executor_role.sql");
const G = "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs";
const S = "scripts/social-runtime-executor-sr1b-d2-b2-smoke.mjs";
const original = fs.readFileSync(M, "utf8");
const run = (file) => spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
const results = [];
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    fs.writeFileSync(M, original, "utf8");
    process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 })[signal]);
  });
}

function mutation(id, name, from, to) {
  if (!original.includes(from)) {
    results.push({ id, name, applied: false, killed: false, status: "anchor_missing" });
    return;
  }
  const changed = original.replace(from, to);
  if (changed === original) {
    results.push({ id, name, applied: false, killed: false, status: "no_op" });
    return;
  }
  let guardKilled = false;
  let smokeKilled = false;
  let crashed = false;
  try {
    fs.writeFileSync(M, changed, "utf8");
    guardKilled = !run(G);
    // The guard is the primary adversarial boundary. Exercise the independent semantic smoke only
    // if a mutation gets through it; this keeps the suite deterministic on slow DrvFS worktrees.
    smokeKilled = guardKilled ? false : !run(S);
  } catch (error) {
    crashed = true;
    void error;
  } finally {
    fs.writeFileSync(M, original, "utf8");
  }
  const killed = guardKilled || smokeKilled;
  results.push({ id, name, applied: true, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardKilled && "guard", smokeKilled && "smoke"].filter(Boolean) });
}

const ROLE_HEAD = "create role social_runtime_executor with\n  login\n  password null\n  noinherit\n  nobypassrls";
const ROLE_TAIL = "  nocreatedb\n  nocreaterole\n  nosuperuser\n  noreplication;";
const BEFORE_COMMENT = "\ncomment on role social_runtime_executor is";

mutation(1, "LOGIN is removed", "  login\n", "  nologin\n");
mutation(2, "PASSWORD NULL is removed", "  password null\n", "");
mutation(3, "password material is embedded", "  password null\n", "  password 'development-secret'\n");
mutation(4, "INHERIT is enabled", ROLE_HEAD,
  "create role social_runtime_executor with\n  login\n  password null\n  inherit\n  nobypassrls");
mutation(5, "BYPASSRLS is enabled", ROLE_HEAD,
  "create role social_runtime_executor with\n  login\n  password null\n  noinherit\n  bypassrls");
mutation(6, "SUPERUSER is enabled", ROLE_TAIL,
  "  nocreatedb\n  nocreaterole\n  superuser\n  noreplication;");
mutation(7, "CREATEROLE is enabled", ROLE_TAIL,
  "  nocreatedb\n  createrole\n  nosuperuser\n  noreplication;");
mutation(8, "CREATEDB is enabled", ROLE_TAIL,
  "  createdb\n  nocreaterole\n  nosuperuser\n  noreplication;");
mutation(9, "REPLICATION is enabled", ROLE_TAIL,
  "  nocreatedb\n  nocreaterole\n  nosuperuser\n  replication;");
mutation(10, "social_authority membership is granted", BEFORE_COMMENT,
  "\ngrant social_authority to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(11, "social_pair_read_authority membership is granted", BEFORE_COMMENT,
  "\ngrant social_pair_read_authority to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(12, "direct protected-table SELECT is granted", BEFORE_COMMENT,
  "\ngrant select on table public.taste_profiles to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(13, "D1 authority-function EXECUTE is granted", BEFORE_COMMENT,
  "\ngrant execute on function social_internal.authorized_candidates(uuid, uuid[]) to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(14, "D2-B1 authority-function EXECUTE is granted", BEFORE_COMMENT,
  "\ngrant execute on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(15, "social_internal schema traversal is granted", BEFORE_COMMENT,
  "\ngrant usage on schema social_internal to social_runtime_executor;\n" + BEFORE_COMMENT.trimStart());
mutation(16, "executor membership is granted to authenticator", BEFORE_COMMENT,
  "\ngrant social_runtime_executor to authenticator;\n" + BEFORE_COMMENT.trimStart());

const survived = results.filter((entry) => entry.applied && !entry.killed);
const notApplied = results.filter((entry) => !entry.applied);
const crashes = results.filter((entry) => entry.status === "harness_crash");
console.log(JSON.stringify({ suite: "social-runtime-executor-sr1b-d2-b2-mutations",
  status: survived.length || notApplied.length || crashes.length ? "failed" : "passed",
  totalMutations: results.length, applied: results.length - notApplied.length,
  killed: results.filter((entry) => entry.killed).length, survived: survived.length,
  noOp: results.filter((entry) => entry.status === "no_op").length,
  anchorMissing: results.filter((entry) => entry.status === "anchor_missing").length,
  harnessCrash: crashes.length, results,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(survived.length || notApplied.length || crashes.length ? 1 : 0);
