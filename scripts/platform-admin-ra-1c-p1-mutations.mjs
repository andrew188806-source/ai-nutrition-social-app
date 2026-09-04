#!/usr/bin/env node
import { AUTHORITY, TRANSPORT, RUNTIME, UI, PAGE, readSources, auditSources, runSmoke } from "./platform-admin-ra-1c-p1-contract.mjs";

const baseline = readSources();
if (auditSources(baseline).some((item) => !item.pass) || (await runSmoke(baseline)).some((item) => !item.pass)) {
  console.error("Baseline must pass before mutations run"); process.exit(1);
}
const mutants = [];
const add = (name, file, from, to) => mutants.push({ name, file, from, to });
add("bypass bearer verification", RUNTIME, 'if (!bearer) return { failure: { state: "unauthenticated" }', 'if (false && !bearer) return { failure: { state: "unauthenticated" }');
add("trust role=admin", RUNTIME, "const bearer = readVerifiedBearer(authorization);", 'const bearer = readVerifiedBearer(authorization); const unsafe = query.get("role");');
add("trust caller userId", RUNTIME, "const bearer = readVerifiedBearer(authorization);", 'const bearer = readVerifiedBearer(authorization); const unsafe = body.userId;');
add("Restaurant Owner implies Admin", RUNTIME, "const bearer = readVerifiedBearer(authorization);", 'const bearer = readVerifiedBearer(authorization); const unsafe = query.get("restaurantOwner");');
add("revoked Admin accepted", RUNTIME, "const bearer = readVerifiedBearer(authorization);", 'const bearer = readVerifiedBearer(authorization); const receiptCache = true;');
add("direct table fallback", TRANSPORT, "return request(`/rest/v1/rpc/${PLATFORM_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION}`", "return client.from('restaurant_branches').select(");
add("direct UPDATE fallback", TRANSPORT, "export function createPlatformAdminBranchStatusTransport", "/** UPDATE restaurant_branches fallback */\nexport function createPlatformAdminBranchStatusTransport");
add("generic RPC name accepted", TRANSPORT, "async function request(path: string", "const rpcName = 'caller';\n  async function request(path: string");
add("arbitrary fields allowed", AUTHORITY, "if (!isRecord(value) || !hasExactKeys(value, [", "if (!isRecord(value) || false && !hasExactKeys(value, [");
add("body limit removed", RUNTIME, "new TextEncoder().encode(text).byteLength > PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT", "false");
add("Number used for statusVersion", AUTHORITY, "readStatusVersion(value.expectedVersion)", "String(Number(value.expectedVersion))");
add("expectedVersion replaced with client guess", UI, "expectedVersion: preview.statusVersion", "expectedVersion: String(Number(preview.statusVersion) + 1)");
add("stale auto-retry", UI, 'if (result.state === "stale_state") {\n        setNotice("分店狀態已由其他操作變更。已重新讀取，請重新確認。 ");\n        await refresh(operation.body.restaurantId, operation.branchId);', 'if (result.state === "stale_state") {\n        setNotice("分店狀態已由其他操作變更。已重新讀取，請重新確認。 ");\n        await send(operation);');
add("new requestId after uncertain failure", UI, "onClick={() => void send(pending)}", "onClick={() => confirm()}");
add("old receipt returned locally after revoke", RUNTIME, "const bearer = readVerifiedBearer(authorization);", "const bearer = readVerifiedBearer(authorization); const receiptCache = new Map();");
add("mock data used as live target", PAGE, "restaurantId = typeof searchParams?.restaurantId === \"string\" ? searchParams.restaurantId : null", "restaurantId = rows[0].restaurantId");
add("live denial converted to mock success", RUNTIME, 'const bearer = readVerifiedBearer(authorization);', 'const unsafe = { mode: "mock" }; const bearer = readVerifiedBearer(authorization);');
add("confirmation removed", UI, "setConfirmationOpen(true)", "confirm()");
add("active inactive mapping widened", AUTHORITY, "if (row.status !== \"active\" && row.status !== \"inactive\")", "if (row.status !== \"active\" && row.status !== \"inactive\" && row.status !== \"archived\")");
add("arbitrary reason accepted", AUTHORITY, "value.reasonCode !== transition.reasonCode", "false");
add("raw DB error returned", RUNTIME, 'return { state: "dependency_unavailable" }', 'return { state: "dependency_unavailable", detail: error.message }');
add("server-only transport moved to client", UI, 'import { useState } from "react";', 'import { useState } from "react";\nimport { createPlatformAdminBranchStatusTransport } from "../server/platformAdminBranchStatusTransport";');
add("privileged secret allowed in browser", UI, '"use client";', '"use client";\nconst key = process.env.SERVICE_ROLE;');

const results = [];
for (const mutant of mutants) {
  if (!baseline[mutant.file]?.includes(mutant.from) || mutant.from === mutant.to) {
    results.push({ name: mutant.name, killed: false, stale: true }); continue;
  }
  const sources = { ...baseline, [mutant.file]: baseline[mutant.file].replace(mutant.from, mutant.to) };
  const failed = auditSources(sources).filter((item) => !item.pass);
  const killed = failed.length > 0;
  results.push({ name: mutant.name, killed, stale: false, killedBy: failed[0]?.name });
  console.log(`${killed ? "KILLED" : "SURVIVED"} ${mutant.name}${failed[0] ? ` -> ${failed[0].name}` : ""}`);
}
const survivors = results.filter((item) => !item.killed), stale = results.filter((item) => item.stale);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-mutations", total: results.length,
  killed: results.filter((item) => item.killed).length, survivors: survivors.length, stale: stale.length, results }, null, 2));
if (survivors.length || stale.length) process.exitCode = 1;
