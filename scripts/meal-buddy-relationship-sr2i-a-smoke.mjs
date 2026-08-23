#!/usr/bin/env node
// Executes the production request parser, service and both opaque-reference primitives against a
// deterministic local repository model. No network, database, credentials or repository writes.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd(); const require_ = createRequire(import.meta.url); const ts = require_("typescript");
const cache = new Map();
function resolveFile(value) { return [value, `${value}.ts`, path.join(value, "index.ts")].find((f) => fs.existsSync(f)); }
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file
  }).outputText;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = (name) => name.startsWith(".") ? load(resolveFile(path.resolve(path.dirname(file), name))) : require_(name);
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}
const candidate = load(path.join(root, "supabase/functions/_shared/social-candidate-ref/crypto.ts"));
const relationship = load(path.join(root, "supabase/functions/_shared/meal-buddy-relationship-ref/crypto.ts"));
const serviceModule = load(path.join(root, "supabase/functions/_shared/meal-buddy-relationship-api/service.ts"));
const requestModule = load(path.join(root, "supabase/functions/_shared/meal-buddy-relationship-api/request.ts"));

const checks = []; const failures = [];
function check(name, condition) { checks.push(name); console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures.push(name); }
async function rejects(operation) { try { await operation(); return false; } catch { return true; } }
const now = new Date("2026-08-22T08:00:00.000Z");
const keyA = new Uint8Array(32).fill(11); const keyB = new Uint8Array(32).fill(22);
let ivCounter = 0; const iv = (length) => new Uint8Array(length).fill(++ivCounter % 255);
const candidateCipher = candidate.createSocialCandidateRefCipher(keyA, { randomIv: iv });
const relationshipCipher = relationship.createMealBuddyRelationshipRefCipher(keyB, { randomIv: iv });
const ids = Object.freeze({ A: "00000000-0000-4000-8000-000000000001", B: "00000000-0000-4000-8000-000000000002", C: "00000000-0000-4000-8000-000000000003", D: "00000000-0000-4000-8000-000000000004", E: "00000000-0000-4000-8000-000000000005", F: "00000000-0000-4000-8000-000000000006", G: "00000000-0000-4000-8000-000000000007", H: "00000000-0000-4000-8000-000000000008" });

class LocalRepository {
  pairs = new Map(); participants = new Set(Object.values(ids)); blocks = new Set(); sequence = 0;
  profiles = new Map(Object.values(ids).map((id, index) => [id, Object.freeze({
    displayName: `飯友 ${index + 1}`,
    mascotAvatarKey: ["PB", "VG", "TE", "MD"][index % 4]
  })]));
  pair(a, b) { return [a, b].sort().join("|"); }
  row(record, actor) {
    const counterpart = record.low === actor ? record.high : record.low;
    const relative_state = record.state === "accepted" ? "accepted" : record.invitedBy === actor ? "outgoing_pending" : "incoming_pending";
    return Object.freeze({
      relation_id: record.id,
      counterpart_user_id: counterpart,
      relative_state,
      counterpart: this.profiles.get(counterpart)
    });
  }
  eligible(a, b) { return a !== b && this.participants.has(a) && this.participants.has(b) && !this.blocks.has(`${a}|${b}`) && !this.blocks.has(`${b}|${a}`); }
  async send(actor, target) {
    if (!this.eligible(actor, target)) throw new Error("RELATIONSHIP_TARGET_UNAVAILABLE");
    const key = this.pair(actor, target); let record = this.pairs.get(key);
    if (!record) {
      const [low, high] = [actor, target].sort();
      record = { id: `10000000-0000-4000-8000-${String(++this.sequence).padStart(12, "0")}`, low, high, invitedBy: actor, state: "pending" };
      this.pairs.set(key, record);
    } else if (record.state === "declined" || record.state === "cancelled") {
      record.invitedBy = actor; record.state = "pending";
    }
    return [this.row(record, actor)];
  }
  async read(actor, target) {
    if (!this.eligible(actor, target)) return [];
    const record = this.pairs.get(this.pair(actor, target));
    return record && (record.state === "pending" || record.state === "accepted") ? [this.row(record, actor)] : [];
  }
  async list(actor) {
    return [...this.pairs.values()].filter((r) => {
      const counterpart = r.low === actor ? r.high : r.low;
      return (r.low === actor || r.high === actor)
        && (r.state === "pending" || r.state === "accepted")
        && this.eligible(actor, counterpart);
    }).map((r) => this.row(r, actor));
  }
  async resolve(actor, relationId, action) {
    const record = [...this.pairs.values()].find((r) => r.id === relationId && (r.low === actor || r.high === actor));
    if (!record) return [];
    const recipient = record.low === record.invitedBy ? record.high : record.low;
    const counterpart = record.low === actor ? record.high : record.low;
    if (action === "accept") {
      if (actor !== recipient) return [];
      if (!this.eligible(actor, counterpart)) throw new Error("RELATIONSHIP_TARGET_UNAVAILABLE");
      if (record.state === "accepted") return [this.row(record, actor)];
      if (record.state !== "pending") return [];
      record.state = "accepted"; return [this.row(record, actor)];
    }
    if (record.state !== "pending") return [];
    if (action === "decline" && actor === recipient) { record.state = "declined"; return [{ ...this.row(record, actor), relative_state: "none" }]; }
    if (action === "cancel" && actor === record.invitedBy) { record.state = "cancelled"; return [{ ...this.row(record, actor), relative_state: "none" }]; }
    return [];
  }
}
const repository = new LocalRepository();
const service = new serviceModule.MealBuddyRelationshipService(repository, candidateCipher, relationshipCipher);
const candidateRef = async (actor, target) => candidateCipher.seal(actor, target, now);

const sendAB = await service.execute(ids.A, { operation: "send", candidateRef: await candidateRef(ids.A, ids.B) }, now);
check("01 valid A to B creates one outgoing pending invite", sendAB.relationships.length === 1 && sendAB.relationships[0].state === "outgoing_pending");
const duplicateAB = await service.execute(ids.A, { operation: "send", candidateRef: await candidateRef(ids.A, ids.B) }, now);
check("02 duplicate send is idempotent and retains one pair", repository.pairs.size === 1 && duplicateAB.relationships[0].state === "outgoing_pending");
const reverseBA = await service.execute(ids.B, { operation: "send", candidateRef: await candidateRef(ids.B, ids.A) }, now);
check("03 reverse send creates no second invite and never auto-accepts", repository.pairs.size === 1 && reverseBA.relationships[0].state === "incoming_pending");
check("04 A and B receive actor-relative pending states", (await service.execute(ids.A, { operation: "list" }, now)).relationships[0].state === "outgoing_pending" && (await service.execute(ids.B, { operation: "list" }, now)).relationships[0].state === "incoming_pending");
check("05 self invite is rejected", await rejects(async () => service.execute(ids.A, { operation: "send", candidateRef: await candidateRef(ids.A, ids.A) }, now)));
const forgedCandidateRef = `${(await candidateRef(ids.A, ids.C)).slice(0, -1)}X`;
check("06 forged candidate ref fails closed", await rejects(() => service.execute(ids.A, { operation: "send", candidateRef: forgedCandidateRef }, now)));
check("07 wrong-actor candidate ref fails closed", await rejects(async () => service.execute(ids.B, { operation: "send", candidateRef: await candidateRef(ids.A, ids.C) }, now)));
check("08 expired candidate ref fails closed", await rejects(async () => service.execute(ids.A, { operation: "read", candidateRef: await candidateRef(ids.A, ids.B) }, new Date(now.getTime() + 86_400_001))));

const bPending = (await service.execute(ids.B, { operation: "list" }, now)).relationships[0];
check("09 sender cannot accept their outgoing invite", await rejects(() => service.execute(ids.A, { operation: "accept", relationshipRef: sendAB.relationships[0].relationshipRef }, now)));
check("10 third party cannot open or accept another pair reference", await rejects(() => service.execute(ids.C, { operation: "accept", relationshipRef: bPending.relationshipRef }, now)));
const accepted = await service.execute(ids.B, { operation: "accept", relationshipRef: bPending.relationshipRef }, now);
check("11 recipient accepts pending invite", accepted.relationships[0].state === "accepted");
check("12 accepted state is symmetric", (await service.execute(ids.A, { operation: "list" }, now)).relationships[0].state === "accepted" && (await service.execute(ids.B, { operation: "list" }, now)).relationships[0].state === "accepted");
check("13 accepted pair has no live pending state", [...repository.pairs.values()][0].state === "accepted");
check("14 repeated recipient acceptance is deterministic", (await service.execute(ids.B, { operation: "accept", relationshipRef: accepted.relationships[0].relationshipRef }, now)).relationships[0].state === "accepted");
check("15 send against an accepted pair does not create pending", (await service.execute(ids.A, { operation: "send", candidateRef: await candidateRef(ids.A, ids.B) }, now)).relationships[0].state === "accepted");
repository.blocks.add(`${ids.A}|${ids.B}`);
check("16 accepted replay remains behind current block authority", await rejects(() => service.execute(ids.B, { operation: "accept", relationshipRef: accepted.relationships[0].relationshipRef }, now)));
repository.blocks.clear();

const sendCD = await service.execute(ids.C, { operation: "send", candidateRef: await candidateRef(ids.C, ids.D) }, now);
check("17 sender cannot decline as recipient", await rejects(() => service.execute(ids.C, { operation: "decline", relationshipRef: sendCD.relationships[0].relationshipRef }, now)));
const dPending = (await service.execute(ids.D, { operation: "list" }, now)).relationships[0];
check("18 recipient can decline", (await service.execute(ids.D, { operation: "decline", relationshipRef: dPending.relationshipRef }, now)).relationships[0].state === "none");
check("19 resolved decline is omitted from active reads", (await service.execute(ids.C, { operation: "list" }, now)).relationships.length === 0);
check("20 repeated decline is a deterministic closed failure", await rejects(() => service.execute(ids.D, { operation: "decline", relationshipRef: dPending.relationshipRef }, now)));

const sendEF = await service.execute(ids.E, { operation: "send", candidateRef: await candidateRef(ids.E, ids.F) }, now);
const fPending = (await service.execute(ids.F, { operation: "list" }, now)).relationships[0];
check("21 recipient cannot cancel as sender", await rejects(() => service.execute(ids.F, { operation: "cancel", relationshipRef: fPending.relationshipRef }, now)));
check("22 sender can cancel", (await service.execute(ids.E, { operation: "cancel", relationshipRef: sendEF.relationships[0].relationshipRef }, now)).relationships[0].state === "none");
check("23 later reinvite reuses the canonical pair row", (await service.execute(ids.E, { operation: "send", candidateRef: await candidateRef(ids.E, ids.F) }, now)).relationships[0].state === "outgoing_pending" && repository.pairs.size === 3);

const sendGH = await service.execute(ids.G, { operation: "send", candidateRef: await candidateRef(ids.G, ids.H) }, now);
repository.blocks.add(`${ids.G}|${ids.H}`);
const hPending = (await relationshipCipher.seal(ids.H, [...repository.pairs.values()].find((row) => row.low === ids.G || row.high === ids.G).id, now));
check("24 current block suppresses the pair from active list", (await service.execute(ids.H, { operation: "list" }, now)).relationships.length === 0);
check("25 blocked pair cannot accept a pending invite", await rejects(() => service.execute(ids.H, { operation: "accept", relationshipRef: hPending }, now)));
check("26 blocked pair cannot send", await rejects(async () => service.execute(ids.G, { operation: "send", candidateRef: await candidateRef(ids.G, ids.H) }, now)));
repository.blocks.clear(); repository.participants.delete(ids.H);
check("27 unavailable target cannot be invited", await rejects(async () => service.execute(ids.G, { operation: "send", candidateRef: await candidateRef(ids.G, ids.H) }, now)));
check("28 current participation suppresses the pair from active list", (await service.execute(ids.G, { operation: "list" }, now)).relationships.length === 0);

const listC = await service.execute(ids.C, { operation: "list" }, now);
check("29 user C sees only opaque relationship references", listC.relationships.every((item) => item.relationshipRef.startsWith("mbr1.")));
check("30 public response contains no internal UUID or pair key", !JSON.stringify(sendAB).includes(ids.A) && !JSON.stringify(sendAB).includes(ids.B) && !JSON.stringify(sendAB).includes("10000000-"));
check("31 relationship ref is actor-bound", await rejects(() => relationshipCipher.open(ids.B, sendAB.relationships[0].relationshipRef, now)));

const validSend = await requestModule.parseMealBuddyRelationshipRequest(new Request("https://local.invalid", { method: "POST", body: JSON.stringify({ operation: "send", candidateRef: await candidateRef(ids.A, ids.B) }) }));
check("32 send request contract is exact", validSend.ok);
check("33 arbitrary target UUID is not expressible", !(await requestModule.parseMealBuddyRelationshipRequest(new Request("https://local.invalid", { method: "POST", body: JSON.stringify({ operation: "send", candidateRef: await candidateRef(ids.A, ids.B), targetUserId: ids.B }) }))).ok);
check("34 list request accepts no target or graph scope", (await requestModule.parseMealBuddyRelationshipRequest(new Request("https://local.invalid", { method: "POST", body: JSON.stringify({ operation: "list" }) }))).ok);
check("35 query/header authority inputs are rejected", requestModule.carriesMealBuddyRelationshipAuthorityInput(new Request("https://local.invalid?target=x")) && requestModule.carriesMealBuddyRelationshipAuthorityInput(new Request("https://local.invalid", { headers: { "x-target-user-id": ids.B } })));

console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-a-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, repositoryBytesModified: false }, null, 2));
if (failures.length) process.exitCode = 1;
