#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("apps/admin-web/server/adminStepUpBroker.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const databaseNow = new Date("2026-09-24T10:00:00.000Z");
const appNow = new Date(databaseNow.getTime() + 1700);
let queryCount = 0;
class FakePool {
  async query(sql, values) {
    queryCount++;
    if (sql === "select pg_catalog.clock_timestamp() as verified_at") return { rows: [{ verified_at: databaseNow }] };
    if (sql.includes("staff_step_up_issue_receipt_v1")) {
      assert.ok(new Date(values[4]) <= databaseNow, "verified_at must not be in the DB future");
      return { rows: [{ receipt_id: "123e4567-e89b-42d3-a456-426614174000", issued_at: databaseNow,
        expires_at: new Date(databaseNow.getTime()+900000), operation_class: "staff_high_privilege_management_v1", step_up_method: "totp" }] };
    }
    throw new Error("Unexpected SQL");
  }
}
class AheadDate extends Date {
  constructor(...args) { super(...(args.length ? args : [appNow.getTime()])); }
  static now() { return appNow.getTime(); }
}
const exports = {};
const context = { exports, process: { env: {} }, Date: AheadDate, require(name) {
  if (name === "server-only") return {};
  if (name === "pg") return { Pool: FakePool };
  throw new Error(`Unexpected import: ${name}`);
} };
vm.runInNewContext(js, context, { filename: "adminStepUpBroker.js" });
const env = { TASTKIND_P3H_BROKER_DATABASE_URL: "postgres://local-test-only/clock" };
const timestamp = await exports.readAdminStepUpDatabaseTime(env);
assert.equal(timestamp.state, "ready");
assert.equal(timestamp.value, databaseNow.toISOString());
assert.notEqual(timestamp.value, appNow.toISOString());
const receipt = await exports.issueAdminStepUpReceipt({
  actorId: "123e4567-e89b-42d3-a456-426614174001", sessionId: "123e4567-e89b-42d3-a456-426614174002",
  requestId: "123e4567-e89b-42d3-a456-426614174003", secretHash: "a".repeat(64),
  factorIdentifierHash: "b".repeat(64), verifiedAt: timestamp.value
}, env);
assert.equal(receipt.state, "ready");
assert.equal(receipt.value.expiresAt, new Date(databaseNow.getTime()+900000).toISOString());
assert.equal(queryCount,2);
assert.equal((await exports.readAdminStepUpDatabaseTime({})).state,"unavailable");
console.log("ADMIN-E1 clock smoke PASS: 1.7s app-ahead drift, DB timestamp issuance, exact 15-minute expiry, missing broker fail-closed");
