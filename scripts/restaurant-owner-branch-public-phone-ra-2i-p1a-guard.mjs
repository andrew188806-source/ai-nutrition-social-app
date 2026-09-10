#!/usr/bin/env node
import fs from "node:fs";
import child from "node:child_process";
import {
  BASELINE, MIGRATION, MUTATION, OWNER_READ, PATHS, PERMISSION, PREVIEW,
  PUBLIC_VIEW, ROLE, SUBJECT
} from "./restaurant-owner-branch-public-phone-ra-2i-p1a-contract.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const git = (args) => child.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean).sort() : [];
const head = git(["rev-parse", "HEAD"]);
const origin = git(["rev-parse", "origin/main"]);
const worktree = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const frozen = head !== BASELINE;
const manifest = frozen
  ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]))
  : worktree;
const migration = read(MIGRATION);
const bare = migration.replace(/^\s*--.*$/gm, "");
const packageScripts = JSON.parse(read("package.json")).scripts;
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };

check("baseline remains origin/main", origin === BASELINE);
check("candidate or one bounded freeze commit", frozen
  ? git(["rev-parse", "HEAD^"]) === BASELINE && git(["log", "-1", "--pretty=%s"]) === SUBJECT
  : head === BASELINE);
check("exact authorised path manifest", JSON.stringify(manifest) === JSON.stringify([...PATHS].sort()));
check("one successor migration sorts last", fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().at(-1)
  === MIGRATION.split("/").at(-1));
check("all four dedicated gates are registered", [
  "test:restaurant-owner-branch-public-phone-ra-2i-p1a",
  "test:restaurant-owner-branch-public-phone-ra-2i-p1a-smoke",
  "test:restaurant-owner-branch-public-phone-ra-2i-p1a-mutations",
  "test:restaurant-owner-branch-public-phone-ra-2i-p1a-postgres"
].every((key) => typeof packageScripts[key] === "string"));
check("one branch contact column only", /add column public_phone text/.test(migration)
  && !/add column (website|homepage|instagram|facebook|line|email)/i.test(bare)
  && !/alter table public\.restaurants/i.test(bare));
check("nullable canonical phone invariant", /public_phone is null[\s\S]*char_length\(public_phone\) between 1 and 32[\s\S]*public_phone !~/.test(migration));
check("dedicated owner permission", migration.includes(PERMISSION)
  && migration.includes("role.role_key = 'owner'")
  && migration.includes("permission.permission_scope = 'restaurant'"));
check("dedicated sealed role", migration.includes(`create role ${ROLE}`)
  && /nologin[\s\S]*noinherit[\s\S]*nobypassrls/.test(migration));
check("column update is public_phone only", migration.includes("grant update (public_phone)\n  on public.restaurant_branches")
  && !/grant update \((name|address|status|latitude|longitude)/i.test(bare));
check("restrictive tenant policies", /as restrictive[\s\S]*for select/.test(migration)
  && /as restrictive[\s\S]*for update/.test(migration));
check("preview and mutation are SECURITY DEFINER with pinned path", migration.includes(`create function public.${PREVIEW}`)
  && migration.includes(`create function public.${MUTATION}`)
  && (migration.match(/security definer\nset search_path = ''\nset row_security = 'on'/g) ?? []).length >= 2);
check("public execution revoked and authenticated execution exact", migration.includes(`revoke all on function public.${PREVIEW}`)
  && migration.includes(`grant execute on function public.${PREVIEW}`)
  && migration.includes(`grant execute on function public.${MUTATION}`));
check("explicit nullable SET/CLEAR and CAS", migration.includes("p_operation not in ('set', 'clear')")
  && migration.includes("v_target.public_phone is distinct from p_expected_public_phone")
  && migration.includes("v_target.public_phone_version <> p_expected_version"));
const auditLogSection = migration.slice(
  migration.indexOf("create table restaurant_internal.branch_public_phone_audit_log"),
  migration.indexOf("grant select (id, auth_user_id, login_status)")
);
check("append-only private audit", migration.includes("create table restaurant_internal.branch_public_phone_audit_log")
  && migration.includes("from public, anon, authenticated, authenticator, service_role")
  && !/create policy[^;]+for (update|delete)/i.test(auditLogSection));
check("owner read successor only adds phone and version", migration.includes(`create function public.${OWNER_READ}`)
  && migration.includes("public_phone text") && migration.includes("public_phone_version text")
  && /grant restaurant_membership_context_reader to postgres[\s\S]*set false/.test(migration));
const publicViewSection = migration.slice(
  migration.indexOf(`create view public.${PUBLIC_VIEW}`),
  migration.indexOf(`revoke all on public.${PUBLIC_VIEW}`)
);
check("public successor adds phone without filtering on it", migration.includes(`create view public.${PUBLIC_VIEW}`)
  && migration.includes("rb.public_phone as branch_public_phone")
  && !/where[^;]*public_phone/i.test(publicViewSection));
check("v2 temporal producer preserved", migration.includes("restaurant_internal.consumer_branch_current_temporal_state_v1(rb.id) as branch_temporal_state"));
check("GEO and unrelated branch fields never assigned", !/set\s+(address|district|latitude|longitude|geocode_|status|name)\s*=/i.test(bare));
check("no generic PATCH or contact object", !/\bpatch\b|contact_json|profile_json/i.test(bare));
check("no credential material", !/service_role[^\n]{0,40}(key|secret)\s*[:=]|sbp_[a-f0-9]{40}|-----BEGIN PRIVATE KEY-----/i.test(
  PATHS.filter((path) => !path.endsWith("ra-2i-p1a-guard.mjs")).map(read).join("\n")
));

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "ra-2i-p1a-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
