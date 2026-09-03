#!/usr/bin/env node
// Mutants exist only in memory. Runtime mutants must fail the real smoke assertions;
// browser-import mutations must fail the source import-boundary guard.
import { READ, TRANSPORT, RUNTIME, UI, PAGE, readSources, auditSources, runSmoke, activeRows } from "./platform-admin-ra-1b-contract.mjs";

const baseline = readSources();
const baseSmoke = await runSmoke(baseline);
if (baseSmoke.some((item) => !item.pass) || auditSources(baseline).some((item) => !item.pass)) {
  console.error("Baseline must pass before mutations run"); process.exit(1);
}
const mutants = [];
const add = (name, file, from, to, kind = "runtime") => mutants.push({ name, file, from, to, kind });
const trustedRows = JSON.stringify(activeRows);
add("bypass RA-1A authorization", READ, 'if (!assertPlatformAdminPermission(context, "admin_audit.read").allowed)', 'if (false)');
add("drop admin_audit.read requirement", READ, '"admin_audit.read"', '"admin_context.read"');
add("trust role=admin", READ, "rows: await transport.readContext()", `rows: query.get("role") === "admin" ? ${trustedRows} : await transport.readContext()`);
add("trust caller userId", READ, "rows: await transport.readContext()", `rows: query.has("userId") ? ${trustedRows} : await transport.readContext()`);
add("Restaurant Owner implies Admin", READ, "rows: await transport.readContext()", `rows: query.get("restaurantOwner") === "true" ? ${trustedRows} : await transport.readContext()`);
add("revoked Admin accepted", READ, "rows: await transport.readContext()", `rows: await transport.readContext().then(rows => rows.length ? rows : ${trustedRows})`);
add("skip verification of identity", READ, "const hasVerifiedIdentity = await transport.verifyIdentity();", "const hasVerifiedIdentity = true;");
add("anonymous auth account accepted", TRANSPORT, "&& user.is_anonymous !== true", "&& true");
add("permission scope is ignored", TRANSPORT, 'row.permission_scope === "platform"', "true");
add("reuse stale context after revocation", READ,
  "const current = resolvePlatformAdminContext({ ok: true, rows: await transport.readContext() }, hasVerifiedIdentity);", "const current = context;");
add("page cap 50 removed", READ, "Math.min(requestedSize, PLATFORM_ADMIN_AUDIT_MAX_PAGE_SIZE)", "requestedSize");
add("default page becomes fetch-all", READ, "PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 20", "PLATFORM_ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 500");
add("source window 500 removed", TRANSPORT, "PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW = 500 as const", "PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW = 5000 as const");
add("oversized source response accepted", TRANSPORT, "!Array.isArray(rows) || rows.length > PLATFORM_ADMIN_AUDIT_SOURCE_WINDOW", "!Array.isArray(rows)");
add("source ordering reversed", READ, "rows.slice(offset, offset + pageSize).map(normalizeEvent)", "[...rows].reverse().slice(offset, offset + pageSize).map(normalizeEvent)");
add("raw actor UUID exposed", READ, "action: row.action,", "action: row.action, actor: row.actor_auth_user_id,");
add("raw target UUID exposed", READ, "action: row.action,", "action: row.action, target: row.target_id,");
add("raw reason exposed", READ, "action: row.action,", "action: row.action, reason: row.reason,");
add("internal membership ID exposed", READ, "action: row.action,", "action: row.action, membershipId: row.membership_id,");
add("raw row spread exposes security metadata", READ, "action: row.action,", "...row, action: row.action,");
add("raw error metadata exposed", READ, 'return { state: error instanceof AuditTransportError ? error.state : "unavailable" };',
  'return { state: error instanceof AuditTransportError ? error.state : "unavailable", reason: String(error) };');
add("direct privileged transport imported into browser", UI, 'import type { PlatformAdminAuditResult }',
  '"use client";\nimport { createPlatformAdminAuditTransport } from "../server/platformAdminAuditTransport";\nimport type { PlatformAdminAuditResult }', "source");
add("server-only marker removed", TRANSPORT, 'import "server-only";', "", "source");
add("direct admin_internal path", TRANSPORT, "/rest/v1/rpc/${PLATFORM_ADMIN_AUDIT_LOG_FUNCTION}", "/rest/v1/admin_internal.platform_admin_audit_log", "source");
add("live denial falls back to mock", RUNTIME,
  'return { mode: "live", result: await readPlatformAdminAudit(authorization, query, config, fetchImpl) };',
  'const result = await readPlatformAdminAudit(authorization, query, config, fetchImpl); return result.state === "ready" ? { mode: "live", result } : { mode: "mock" };');
add("page displays mock after live denial", PAGE, 'if (composition.mode === "live")', 'if (composition.mode === "live" && composition.result.state === "ready")');
add("upstream HTTP cache enabled", TRANSPORT, 'cache: "no-store"', 'cache: "force-cache"');
add("response HTTP cache enabled", RUNTIME, '"Cache-Control": "private, no-store"', '"Cache-Control": "public, max-age=3600"');

const results = [];
for (const mutant of mutants) {
  if (!baseline[mutant.file]?.includes(mutant.from) || mutant.from === mutant.to) {
    results.push({ name: mutant.name, killed: false, stale: true }); continue;
  }
  const sources = { ...baseline, [mutant.file]: baseline[mutant.file].split(mutant.from).join(mutant.to) };
  let failed;
  if (mutant.kind === "source") failed = auditSources(sources).filter((item) => !item.pass);
  else failed = (await runSmoke(sources)).filter((item) => !item.pass);
  const killed = failed.length > 0;
  results.push({ name: mutant.name, killed, stale: false, killedBy: failed[0]?.name, kind: mutant.kind });
  console.log(`${killed ? "KILLED" : "SURVIVED"} ${mutant.name}${failed[0] ? ` -> ${failed[0].name}` : ""}`);
}
const survivors = results.filter((item) => !item.killed), stale = results.filter((item) => item.stale);
console.log(JSON.stringify({ suite: "platform-admin-ra-1b-mutations", total: results.length,
  killed: results.filter((item) => item.killed).length, survivors: survivors.length, stale: stale.length, results }, null, 2));
if (survivors.length || stale.length) process.exitCode = 1;
