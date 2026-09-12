#!/usr/bin/env node
// Pure P3-P6-P2B compatibility lifecycle smoke. No database, network, or writes.
import fs from "node:fs";

const SQL = fs.readFileSync("supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql", "utf8").replace(/\r\n/g, "\n");
const KEYS = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort();
const fresh = () => ({ now: 100, next: 1, memberships: [], staff: [], catalog: KEYS.map((key) => ({ key, lifecycle: "active", readiness: "current" })), entitlements: [], links: [], bundles: [] });
const id = (state, prefix) => `${prefix}-${state.next++}`;
function sync(state, membershipId) {
  const m = state.memberships.find((row) => row.id === membershipId);
  if (!m) throw new Error("membership_not_found");
  const active = m.status === "active" && m.roleKey === "platform_admin" && m.roleStatus === "active";
  const revokeLinks = (links) => {
    for (const link of links) {
      const entitlement = state.entitlements.find((row) => row.id === link.entitlementId && row.staffId === link.staffId && row.key === link.key && row.source === "migration_backfill" && row.assignmentId === null && row.status === "active");
      if (!entitlement) throw new Error("entitlement_conflict");
      entitlement.status = "revoked"; entitlement.until = state.now; entitlement.revokedAt = state.now;
      link.status = "revoked"; link.revokedAt = state.now;
    }
  };
  const activeLinks = () => state.links.filter((row) => row.membershipId === m.id && row.status === "active");
  if (!active) { revokeLinks(activeLinks()); return; }
  const legacyKeys = [...new Set(m.permissions)].sort();
  const current = legacyKeys.filter((key) => state.catalog.some((row) => row.key === key && row.lifecycle === "active" && row.readiness === "current"));
  if (!legacyKeys.length || current.length !== legacyKeys.length) throw new Error("permission_parity_broken");
  let staff = state.staff.find((row) => row.authUserId === m.authUserId);
  if (!staff) { staff = { id: id(state, "staff"), authUserId: m.authUserId, status: "active", from: m.grantedAt, until: null }; state.staff.push(staff); }
  else if (staff.status !== "active" || staff.from > state.now || (staff.until !== null && state.now >= staff.until)) throw new Error("staff_account_conflict");
  revokeLinks(activeLinks().filter((link) => !legacyKeys.includes(link.key)));
  for (const key of legacyKeys) {
    const link = activeLinks().find((row) => row.key === key);
    if (link) {
      const entitlement = state.entitlements.find((row) => row.id === link.entitlementId && row.staffId === staff.id && row.key === key && row.source === "migration_backfill" && row.assignmentId === null && row.status === "active" && row.from <= state.now && (row.until === null || state.now < row.until));
      if (!entitlement || link.staffId !== staff.id) throw new Error("active_link_conflict");
      continue;
    }
    const entitlement = { id: id(state, "ent"), staffId: staff.id, key, source: "migration_backfill", assignmentId: null, status: "active", from: Math.max(m.grantedAt, staff.from), until: null };
    state.entitlements.push(entitlement);
    state.links.push({ id: id(state, "link"), membershipId: m.id, staffId: staff.id, key, entitlementId: entitlement.id, status: "active", revokedAt: null });
  }
}
const addMembership = (state, overrides = {}) => { const row = { id: id(state, "member"), authUserId: id(state, "user"), roleKey: "platform_admin", roleStatus: "active", status: "active", grantedAt: 50, permissions: [...KEYS], ...overrides }; state.memberships.push(row); return row; };
const effective = (state, authUserId) => {
  const staff = state.staff.find((row) => row.authUserId === authUserId);
  if (!staff || staff.status !== "active" || staff.from > state.now || (staff.until !== null && state.now >= staff.until)) return [];
  return [...new Set(state.entitlements.filter((row) => row.staffId === staff.id && row.status === "active" && row.from <= state.now && (row.until === null || state.now < row.until) && state.catalog.some((p) => p.key === row.key && p.lifecycle === "active" && p.readiness === "current") && (row.source !== "bundle_assignment" || state.bundles.some((b) => b.id === row.assignmentId && b.staffId === staff.id && b.status === "active"))).map((row) => row.key))].sort();
};
const activeCompat = (state, membershipId) => state.links.filter((row) => row.membershipId === membershipId && row.status === "active");
const legacyDto = (state, membership) => membership.status === "active" && membership.roleStatus === "active" ? membership.permissions.filter((key) => key === "admin_context.read" || key === "admin_audit.read").sort() : [];
const legacyCanonical = (membership) => membership.status === "active" && membership.roleStatus === "active" ? [...new Set(membership.permissions)].sort() : [];
const legacyHas = (membership, key) => legacyCanonical(membership).includes(key);
const checks = [], failures = [];
function check(label, pass) { const item = { label, pass: Boolean(pass) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${label}`); }

{ const s=fresh(),m=addMembership(s); sync(s,m.id); check("A active legacy membership mirrors exact three keys", JSON.stringify(effective(s,m.authUserId))===JSON.stringify(KEYS)); }
{ const s=fresh(),m=addMembership(s,{status:"revoked"}); sync(s,m.id); check("B revoked legacy membership grants none", effective(s,m.authUserId).length===0); }
{ const s=fresh(),m=addMembership(s,{status:"suspended"}); sync(s,m.id); check("C suspended legacy membership grants none", effective(s,m.authUserId).length===0); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); check("D absent staff account is created identity-only", s.staff.length===1 && s.staff[0].authUserId===m.authUserId && !Object.hasOwn(s.staff[0],"roleKey")); }
{ const s=fresh(),m=addMembership(s),staff={id:id(s,"staff"),authUserId:m.authUserId,status:"active",from:20,until:null}; s.staff.push(staff); sync(s,m.id); check("E existing effective staff account is reused", s.staff.length===1 && activeCompat(s,m.id).every((x)=>x.staffId===staff.id)); }
for (const [label,change] of [["F existing suspended staff conflicts",{status:"suspended",from:20,until:null}],["G existing revoked staff conflicts",{status:"revoked",from:20,until:null}],["H existing future staff conflicts",{status:"active",from:101,until:null}],["I existing expired staff conflicts",{status:"active",from:20,until:100}]]) { const s=fresh(),m=addMembership(s); s.staff.push({id:id(s,"staff"),authUserId:m.authUserId,...change}); let conflict=false; try{sync(s,m.id);}catch(e){conflict=e.message==="staff_account_conflict";} check(label,conflict && activeCompat(s,m.id).length===0); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); const counts=[s.staff.length,s.entitlements.length,s.links.length]; sync(s,m.id); check("J repeat active sync is idempotent", JSON.stringify(counts)===JSON.stringify([s.staff.length,s.entitlements.length,s.links.length])); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); m.status="revoked"; sync(s,m.id); const counts=[s.entitlements.length,s.links.length]; sync(s,m.id); check("K repeat revoked sync is idempotent", JSON.stringify(counts)===JSON.stringify([s.entitlements.length,s.links.length]) && activeCompat(s,m.id).length===0); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); sync(s,m.id); check("L active link uniqueness holds per membership and key", new Set(activeCompat(s,m.id).map((x)=>x.key)).size===activeCompat(s,m.id).length); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); m.status="revoked"; sync(s,m.id); m.status="active";m.grantedAt=110;s.now=120;sync(s,m.id); check("M grant revoke regrant creates new history", s.links.length===6 && s.links.filter((x)=>x.status==="revoked").length===3 && activeCompat(s,m.id).length===3); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); m.status="revoked";sync(s,m.id); check("N legacy revoke leaves staff account active", s.staff[0].status==="active"); }
{ const s=fresh(),m=addMembership(s); sync(s,m.id); const staff=s.staff[0],direct={id:id(s,"ent"),staffId:staff.id,key:KEYS[0],source:"direct_grant",assignmentId:null,status:"active",from:60,until:null};s.entitlements.push(direct);m.status="revoked";sync(s,m.id);check("O revoke touches exact linked compatibility entitlements only", direct.status==="active" && s.entitlements.filter((x)=>x.source==="migration_backfill").every((x)=>x.status==="revoked")); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);const staff=s.staff[0];s.entitlements.push({id:id(s,"ent"),staffId:staff.id,key:KEYS[0],source:"direct_grant",assignmentId:null,status:"active",from:60,until:null});m.status="revoked";sync(s,m.id);check("P direct source survives and remains effective", effective(s,m.authUserId).includes(KEYS[0])); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);const staff=s.staff[0],bundle={id:id(s,"bundle"),staffId:staff.id,status:"active"};s.bundles.push(bundle);s.entitlements.push({id:id(s,"ent"),staffId:staff.id,key:KEYS[1],source:"bundle_assignment",assignmentId:bundle.id,status:"active",from:60,until:null});m.status="revoked";sync(s,m.id);check("Q Bundle source survives and remains effective", bundle.status==="active" && effective(s,m.authUserId).includes(KEYS[1])); }
{ const s=fresh(),m=addMembership(s,{permissions:[...KEYS,"admin_missing.read"]});let failed=false;try{sync(s,m.id);}catch(e){failed=e.message==="permission_parity_broken";}check("R permission-set mismatch fails closed",failed && s.staff.length===0 && s.entitlements.length===0); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);const row=s.entitlements.find((x)=>x.key==="admin_context.read");check("S admin_context compatibility is exact migration_backfill", row?.source==="migration_backfill" && row.assignmentId===null); }
{ const s=fresh();s.staff.push({id:id(s,"staff"),authUserId:"staff-only",status:"active",from:10,until:null});s.entitlements.push({id:id(s,"ent"),staffId:s.staff[0].id,key:KEYS[0],source:"direct_grant",assignmentId:null,status:"active",from:20,until:null});check("T staff authority never creates legacy membership", s.memberships.length===0); }
check("U legacy grant and revoke functions are absent from P2B DDL", !/create\s+(?:or replace\s+)?function\s+admin_internal\.(?:grant|revoke)_platform_admin/i.test(SQL));
check("V P2A resolver definitions are absent from P2B DDL", !/create\s+(?:or replace\s+)?function\s+public\.staff_(?:current_context|has_permission)_v1/i.test(SQL));
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("W frozen legacy DTO remains exact two keys",JSON.stringify(legacyDto(s,m))===JSON.stringify(["admin_audit.read","admin_context.read"])); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("X canonical legacy role-permission set is exact three keys",JSON.stringify(legacyCanonical(m))===JSON.stringify(KEYS)); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("Y compatibility mirror equals canonical legacy set",JSON.stringify(activeCompat(s,m.id).map(x=>x.key).sort())===JSON.stringify(legacyCanonical(m))); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("Z clean compatibility-only staff resolver returns exact three keys",JSON.stringify(effective(s,m.authUserId))===JSON.stringify(KEYS)); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("AA legacy and staff exact predicates are true for all three active keys",KEYS.every(key=>legacyHas(m,key)&&effective(s,m.authUserId).includes(key))); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);check("AB no fourth compatibility key is materialized",activeCompat(s,m.id).length===3&&activeCompat(s,m.id).every(x=>KEYS.includes(x.key))); }
{ const s=fresh(),m=addMembership(s);sync(s,m.id);m.status="revoked";sync(s,m.id);check("AC revoke clears DTO predicates and all three compatibility sources",legacyDto(s,m).length===0&&KEYS.every(key=>!legacyHas(m,key))&&activeCompat(s,m.id).length===0&&effective(s,m.authUserId).length===0); }

console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p2b-smoke",total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures:failures.map((x)=>x.label),databaseUsed:false,networkUsed:false,developmentAccessed:false,productionAccessed:false},null,2));
process.exitCode=failures.length?1:0;
