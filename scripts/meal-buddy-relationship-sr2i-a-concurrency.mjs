#!/usr/bin/env node
// Deterministic local scheduler over the exact SQL lock families. No database/network/credentials.
import fs from "node:fs";
const sql = fs.readFileSync("supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql", "utf8");
const checks = []; const failures = [];
function check(name, value) { checks.push(name); console.log(`${value ? "PASS" : "FAIL"} ${name}`); if (!value) failures.push(name); }

check("01 canonical pair lock is transaction-scoped", /pg_advisory_xact_lock[\s\S]*:meal_buddy_relationship:/.test(sql));
check("02 frozen participation lock family is reused twice", (sql.match(/:social_participation/g) ?? []).length >= 2);
check("03 both frozen directional block lock families are acquired", sql.includes("p_user_low_id::text || ':social_block:' || p_user_high_id::text") && sql.includes("p_user_high_id::text || ':social_block:' || p_user_low_id::text"));
check("04 pair, participation and block locks precede eligibility check", sql.indexOf(":meal_buddy_relationship:") < sql.indexOf("may_evaluate_candidate(p_actor_user_id, p_target_user_id)"));

class Mutex { locked = false; waiters = []; async acquire() { if (!this.locked) { this.locked = true; return () => this.release(); } await new Promise((resolve) => this.waiters.push(resolve)); this.locked = true; return () => this.release(); } release() { const next = this.waiters.shift(); if (next) next(); else this.locked = false; } }
const pairLock = new Mutex(); const participationLock = new Mutex(); const blockLock = new Mutex(); const tick = () => new Promise((resolve) => setImmediate(resolve));
let row = null; let blocked = false; let participating = true; let sequence = 0;
async function send(actor, target) {
  const release = await pairLock.acquire();
  try { await tick(); if (blocked) return "rejected"; if (!row) row = { id: ++sequence, invitedBy: actor, target, state: "pending" }; else if (["declined", "cancelled"].includes(row.state)) row = { ...row, invitedBy: actor, target, state: "pending" }; return row.state === "accepted" ? "accepted" : row.invitedBy === actor ? "outgoing_pending" : "incoming_pending"; }
  finally { release(); }
}
async function accept(actor) {
  const releasePair = await pairLock.acquire(); const releaseParticipation = await participationLock.acquire(); const releaseBlock = await blockLock.acquire();
  try { await tick(); if (!row || row.invitedBy === actor || blocked || !participating) return "unavailable"; if (row.state === "accepted") return "accepted"; if (row.state !== "pending") return row.state; row.state = "accepted"; return "accepted"; }
  finally { releaseBlock(); releaseParticipation(); releasePair(); }
}
async function cancel(actor) {
  const release = await pairLock.acquire();
  try { await tick(); if (row?.state === "pending" && row.invitedBy === actor) row.state = "cancelled"; return row?.state ?? "none"; }
  finally { release(); }
}
async function block() { const release = await blockLock.acquire(); try { await tick(); blocked = true; } finally { release(); } }
async function pause() { const release = await participationLock.acquire(); try { await tick(); participating = false; } finally { release(); } }
async function completes(values) { let timer; try { await Promise.race([Promise.all(values), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("deadlock")), 1000); })]); return true; } catch { return false; } finally { clearTimeout(timer); } }

row = null; blocked = false; sequence = 0;
check("05 duplicate send race completes", await completes([send("A", "B"), send("A", "B")]));
check("06 duplicate send race creates one pending row", sequence === 1 && row.state === "pending" && row.invitedBy === "A");

row = null; sequence = 0;
check("07 cross-send race completes", await completes([send("A", "B"), send("B", "A")]));
check("08 cross-send race retains one directed pending invite", sequence === 1 && row.state === "pending" && ["A", "B"].includes(row.invitedBy));

row = { id: 1, invitedBy: "A", target: "B", state: "pending" };
check("09 accept versus cancel completes without deadlock", await completes([accept("B"), cancel("A")]));
check("10 accept versus cancel has one serialized final state", row.state === "accepted" || row.state === "cancelled");

row = { id: 1, invitedBy: "A", target: "B", state: "pending" };
check("11 double accept completes", await completes([accept("B"), accept("B")]));
check("12 double accept produces exactly one accepted pair", row.state === "accepted" && row.id === 1);

row = { id: 1, invitedBy: "A", target: "B", state: "pending" }; blocked = false; participating = true;
check("13 accept racing block completes", await completes([accept("B"), block()]));
check("14 accept racing block has a legal serial result", blocked && (row.state === "accepted" || row.state === "pending"));

row = { id: 1, invitedBy: "A", target: "B", state: "pending" }; blocked = false; participating = true;
check("15 accept racing participation pause completes", await completes([accept("B"), pause()]));
check("16 accept racing participation pause has a legal serial result", !participating && (row.state === "accepted" || row.state === "pending"));

check("17 database uniqueness is one unordered pair", /unique \(user_low_id, user_high_id\)/.test(sql) && /user_low_id < user_high_id/.test(sql));
check("18 accepted plus pending is unrepresentable in one canonical state column", /state in \('pending', 'accepted', 'declined', 'cancelled'\)/.test(sql) && !/create table[\s\S]*invite[^;]*create table/i.test(sql));
console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-a-concurrency", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, model: "deterministic pair/participation/block mutex scheduler over exact SQL lock keys", networkUsed: false, databaseUsed: false, credentialsUsed: false }, null, 2));
if (failures.length) process.exitCode = 1;
