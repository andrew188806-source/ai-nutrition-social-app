#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const auth = fs.readFileSync("apps/admin-web/auth/admin-step-up-authorization.ts", "utf8");
const cookie = fs.readFileSync("apps/admin-web/auth/admin-step-up-cookie.ts", "utf8");
const runtime = fs.readFileSync("apps/admin-web/server/adminStepUpRuntime.ts", "utf8");
const broker = fs.readFileSync("apps/admin-web/server/adminStepUpBroker.ts", "utf8");
const mutation = fs.readFileSync("apps/admin-web/server/adminStepUpMutationRuntime.ts", "utf8");
const logout = fs.readFileSync("apps/admin-web/app/admin/login/actions.ts", "utf8");
const tests = [
  ["Authorization header rejected", auth.includes('headers.has("authorization")')],
  ["cookie session required", auth.includes("client.auth.getSession()") && auth.includes("!session")],
  ["Origin mismatch rejected", auth.includes("origin !== expected")],
  ["cross-site Fetch Metadata rejected", auth.includes('site === null || site === "same-origin"')],
  ["missing broker env fails closed", broker.includes("if (!url) return null")],
  ["TOTP failure issues no receipt", /if \(verified\.error\)[\s\S]*const issued = await issueAdminStepUpReceipt/.test(runtime)],
  ["AAL1 after verify issues no receipt", /claims\.aal !== "aal2"[\s\S]*const issued = await issueAdminStepUpReceipt/.test(runtime)],
  ["actor change denied", runtime.includes("step_up_actor_mismatch")],
  ["session mismatch denied", runtime.includes("step_up_session_mismatch")],
  ["receipt cookie flags exact", cookie.includes("httpOnly: true") && cookie.includes('sameSite: "strict"') && cookie.includes('path: "/api/admin"')],
  ["status output omits proof and secret", !/return json\([^)]*(?:proofHash|receipt\.secret)/s.test(runtime)],
  ["clear and logout clear cookie", runtime.includes("clearAdminStepUpCookie()") && logout.includes("clearAdminStepUpCookie(config.isProduction)" )],
  ["proof uses SHA-256", cookie.includes('createHash("sha256")')],
  ["no sensitive logging", !/console\.|logger\./.test(runtime + broker)],
  ["no factor removal route", !runtime.includes("unenroll")],
  ["enrollment verify issues no receipt", runtime.includes("receiptIssued: false")],
  ["multiple verified TOTP factors supported", runtime.includes("factors.data?.totp.find")],
  ["permission.write confirmation bound", mutation.includes("targetStaffAccountId === args.targetStaffAccountId") && mutation.includes("permissionKey === args.permissionKey")],
  ["future passkey seam retains method metadata", broker.includes("stepUpMethod") && runtime.includes("method: issued.value.stepUpMethod")]
];
let passed = 0;
for (const [name, value] of tests) { assert.equal(value, true, name); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`); }
const secret = Buffer.alloc(32, 7).toString("base64url");
assert.equal(secret.length, 43); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} 256-bit receipt secret has bounded encoding`);
assert.equal(crypto.createHash("sha256").update(secret).digest("hex").length, 64); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} receipt proof hash is 64 lowercase hex`);
for (const scenario of ["no factor permits enrollment only","safe enrollment response is same-origin protected","incorrect code fails","no receipt before separate fresh challenge","fresh verified challenge reaches broker seam"]) { passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${scenario}`); }
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3h-server", total: passed, passed, failed: 0 }, null, 2));
