import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260715050000_create_restaurant_membership_foundation.sql"),
  "utf8"
);
const correctiveMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260715060000_fix_restaurant_membership_rpc_execute_grants.sql"),
  "utf8"
);
const ownerCorrectiveMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql"),
  "utf8"
);
const cleanupMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260716020000_restore_restaurant_membership_context_reader_set_option.sql"),
  "utf8"
);
const knownIssue = fs.readFileSync(
  path.join(root, "docs", "runtime-integration-phase-2v-b", "known-issue-p2v-b-ki-001-managed-role-grantor.md"),
  "utf8"
);
const immutableFoundationSha256 = "6cc33b0703d84cf81523017842edb771568004e36df649515971ab61628ba035";
const immutableFirstCorrectiveSha256 = "f72533104b310709b1b9d907f0cff9e6fa69d51c9aa610f05f27094ebf151240";

const checks = [];
const failures = [];

function record(name, pass, detail = undefined) {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) failures.push({ name, detail });
}

record(
  "deployed foundation migration remains byte-for-byte immutable",
  crypto.createHash("sha256").update(migration).digest("hex") === immutableFoundationSha256
);
record(
  "deployed first corrective migration remains byte-for-byte immutable",
  crypto.createHash("sha256").update(correctiveMigration).digest("hex") === immutableFirstCorrectiveSha256
);

const rolePermissions = Object.freeze({
  owner: Object.freeze([
    "access_context.read:self",
    "restaurant.read:restaurant",
    "branch.read:restaurant",
    "menu.read:restaurant",
    "nutrition.read:restaurant"
  ]),
  manager: Object.freeze([
    "access_context.read:self",
    "restaurant.read:restaurant",
    "branch.read:branch",
    "menu.read:branch",
    "nutrition.read:branch"
  ]),
  staff: Object.freeze([
    "access_context.read:self",
    "branch.read:branch",
    "menu.read:branch",
    "nutrition.read:branch"
  ])
});

const model = Object.freeze({
  identities: Object.freeze([
    Object.freeze({ actorKey: "active-owner", identityKey: "identity-owner", state: "enabled" }),
    Object.freeze({ actorKey: "active-manager", identityKey: "identity-manager", state: "enabled" }),
    Object.freeze({ actorKey: "other-owner", identityKey: "identity-other", state: "enabled" }),
    Object.freeze({ actorKey: "disabled-owner", identityKey: "identity-disabled", state: "disabled" }),
    Object.freeze({ actorKey: "inactive-owner", identityKey: "identity-inactive", state: "enabled" }),
    Object.freeze({ actorKey: "suspended-owner", identityKey: "identity-suspended", state: "enabled" }),
    Object.freeze({ actorKey: "revoked-owner", identityKey: "identity-revoked", state: "enabled" })
  ]),
  memberships: Object.freeze([
    Object.freeze({ membershipKey: "membership-owner", identityKey: "identity-owner", tenantKey: "tenant-a", role: "owner", state: "active" }),
    Object.freeze({ membershipKey: "membership-manager", identityKey: "identity-manager", tenantKey: "tenant-a", role: "manager", state: "active" }),
    Object.freeze({ membershipKey: "membership-other", identityKey: "identity-other", tenantKey: "tenant-b", role: "owner", state: "active" }),
    Object.freeze({ membershipKey: "membership-disabled", identityKey: "identity-disabled", tenantKey: "tenant-a", role: "owner", state: "active" }),
    Object.freeze({ membershipKey: "membership-inactive", identityKey: "identity-inactive", tenantKey: "tenant-a", role: "owner", state: "inactive" }),
    Object.freeze({ membershipKey: "membership-suspended", identityKey: "identity-suspended", tenantKey: "tenant-a", role: "owner", state: "suspended" }),
    Object.freeze({ membershipKey: "membership-revoked", identityKey: "identity-revoked", tenantKey: "tenant-a", role: "owner", state: "revoked" })
  ]),
  branches: Object.freeze([
    Object.freeze({ branchKey: "branch-a1", tenantKey: "tenant-a" }),
    Object.freeze({ branchKey: "branch-a2", tenantKey: "tenant-a" }),
    Object.freeze({ branchKey: "branch-b1", tenantKey: "tenant-b" })
  ]),
  branchScopes: Object.freeze([
    Object.freeze({ membershipKey: "membership-manager", branchKey: "branch-a1", state: "active" })
  ])
});

function activeMemberships(actorKey) {
  if (actorKey === null) return [];
  const identity = model.identities.find((candidate) => candidate.actorKey === actorKey && candidate.state === "enabled");
  if (!identity) return [];
  return model.memberships.filter((membership) => membership.identityKey === identity.identityKey && membership.state === "active" && rolePermissions[membership.role]);
}

function permissionEntries(role) {
  return (rolePermissions[role] ?? []).map((entry) => {
    const [permission, scope] = entry.split(":");
    return { permission, scope };
  });
}

function resolveContext(actorKey) {
  return activeMemberships(actorKey).flatMap((membership) => permissionEntries(membership.role).flatMap(({ permission, scope }) => {
    if (scope !== "branch") return [{ tenantKey: membership.tenantKey, role: membership.role, permission, scope, branchKey: null }];
    return model.branchScopes
      .filter((assignment) => assignment.membershipKey === membership.membershipKey && assignment.state === "active")
      .flatMap((assignment) => {
        const branch = model.branches.find((candidate) => candidate.branchKey === assignment.branchKey);
        return branch?.tenantKey === membership.tenantKey
          ? [{ tenantKey: membership.tenantKey, role: membership.role, permission, scope, branchKey: branch.branchKey }]
          : [];
      });
  }));
}

function hasRestaurantPermission(actorKey, tenantKey, permission) {
  if (!actorKey || !tenantKey || !permission) return false;
  return resolveContext(actorKey).some((row) => row.tenantKey === tenantKey && row.permission === permission && row.scope === "restaurant");
}

function hasBranchPermission(actorKey, tenantKey, branchKey, permission) {
  if (!actorKey || !tenantKey || !branchKey || !permission) return false;
  const branch = model.branches.find((candidate) => candidate.branchKey === branchKey && candidate.tenantKey === tenantKey);
  if (!branch) return false;
  return resolveContext(actorKey).some((row) =>
    row.tenantKey === tenantKey
    && row.permission === permission
    && (row.scope === "restaurant" || (row.scope === "branch" && row.branchKey === branchKey))
  );
}

function branchScopeIsConsistent(membershipKey, branchKey) {
  const membership = model.memberships.find((candidate) => candidate.membershipKey === membershipKey);
  const branch = model.branches.find((candidate) => candidate.branchKey === branchKey);
  return Boolean(membership && branch && membership.tenantKey === branch.tenantKey);
}

function deriveRequestActor(requestContext) {
  const primary = requestContext?.["request.jwt.claim.sub"];
  const legacyRaw = requestContext?.["request.jwt.claims"];
  const primaryValue = typeof primary === "string" && primary !== "" ? primary : null;
  const legacyValue = typeof legacyRaw === "string" && legacyRaw !== ""
    ? JSON.parse(legacyRaw)?.sub
    : null;
  const candidate = primaryValue ?? legacyValue ?? null;
  if (candidate === null || candidate === "") return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new TypeError("invalid request actor");
  }
  return candidate.toLowerCase();
}

const primaryActor = "11111111-1111-4111-8111-111111111111";
const fallbackActor = "22222222-2222-4222-8222-222222222222";
record(
  "primary request.jwt.claim.sub resolves actor",
  deriveRequestActor({ "request.jwt.claim.sub": primaryActor }) === primaryActor
);
record(
  "legacy request.jwt.claims JSON resolves actor",
  deriveRequestActor({ "request.jwt.claim.sub": "", "request.jwt.claims": JSON.stringify({ sub: fallbackActor }) }) === fallbackActor
);
record(
  "primary claim wins over legacy fallback",
  deriveRequestActor({ "request.jwt.claim.sub": primaryActor, "request.jwt.claims": JSON.stringify({ sub: fallbackActor }) }) === primaryActor
);
record(
  "empty and missing request claims fail closed",
  deriveRequestActor({}) === null
    && deriveRequestActor({ "request.jwt.claim.sub": "", "request.jwt.claims": "" }) === null
    && deriveRequestActor({ "request.jwt.claims": "{}" }) === null
);
record(
  "caller metadata cannot override verified actor",
  deriveRequestActor({ "request.jwt.claim.sub": primaryActor, callerActor: fallbackActor }) === primaryActor
);
let invalidActorRejected = false;
try {
  deriveRequestActor({ "request.jwt.claim.sub": "not-a-valid-actor" });
} catch (error) {
  invalidActorRejected = error instanceof TypeError;
}
record("invalid non-empty request actor is not hidden", invalidActorRejected);

record("anonymous receives no membership context", resolveContext(null).length === 0);
record("authenticated non-member receives no membership context", resolveContext("non-member").length === 0);

const ownerContext = resolveContext("active-owner");
record("active member receives only own tenant access", ownerContext.length > 0 && ownerContext.every((row) => row.tenantKey === "tenant-a"));
record("tenant A actor cannot obtain tenant B membership", !hasRestaurantPermission("active-owner", "tenant-b", "restaurant.read"));
record("tenant B actor cannot obtain tenant A membership", !hasRestaurantPermission("other-owner", "tenant-a", "restaurant.read"));

record("owner branch permission stays within membership tenant", hasBranchPermission("active-owner", "tenant-a", "branch-a2", "branch.read") && !hasBranchPermission("active-owner", "tenant-b", "branch-b1", "branch.read"));
record("manager receives assigned same-tenant branch", hasBranchPermission("active-manager", "tenant-a", "branch-a1", "branch.read"));
record("manager cannot widen to unassigned branch", !hasBranchPermission("active-manager", "tenant-a", "branch-a2", "branch.read"));
record("manager cannot widen to cross-tenant branch", !hasBranchPermission("active-manager", "tenant-b", "branch-b1", "branch.read"));
record("same-tenant assignment passes integrity rule", branchScopeIsConsistent("membership-manager", "branch-a1"));
record("cross-tenant assignment is rejected", !branchScopeIsConsistent("membership-manager", "branch-b1"));

for (const actorKey of ["disabled-owner", "inactive-owner", "suspended-owner", "revoked-owner"]) {
  record(`${actorKey} fails closed`, resolveContext(actorKey).length === 0);
}

const expectedPermissionRows = 14;
const deterministicPermissionRows = Object.values(rolePermissions).flat().length;
record("role and permission mapping is deterministic", deterministicPermissionRows === expectedPermissionRows, deterministicPermissionRows);
record("unknown role grants nothing", permissionEntries("unknown").length === 0);
record("null requested filters fail closed", !hasRestaurantPermission("active-owner", null, "restaurant.read") && !hasBranchPermission("active-owner", "tenant-a", null, "branch.read"));

const sqlWithoutComments = migration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const sqlStatements = sqlWithoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);
const temporaryGrantIndex = sqlWithoutComments.indexOf("GRANT restaurant_membership_context_reader TO postgres");
const finalOwnershipIndex = sqlWithoutComments.lastIndexOf("OWNER TO restaurant_membership_context_reader");
const temporaryRevokeIndex = sqlWithoutComments.indexOf("REVOKE restaurant_membership_context_reader FROM postgres");
const commitIndex = sqlWithoutComments.lastIndexOf("COMMIT");
record(
  "temporary deployment-role membership is absent from final state",
  temporaryGrantIndex >= 0
    && temporaryGrantIndex < finalOwnershipIndex
    && finalOwnershipIndex < temporaryRevokeIndex
    && temporaryRevokeIndex < commitIndex
);
record(
  "temporary membership grants SET without ADMIN or INHERIT",
  /GRANT restaurant_membership_context_reader TO postgres\s+WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/i.test(sqlWithoutComments)
);
record(
  "custom owner needs no managed auth schema privilege",
  !/GRANT[^;]*ON SCHEMA auth/i.test(sqlWithoutComments)
    && !/GRANT[^;]*ON FUNCTION auth\.uid\s*\(\s*\)/i.test(sqlWithoutComments)
    && !/auth\.uid\s*\(/i.test(sqlWithoutComments)
);
record(
  "migration derives actor from primary and fallback request JWT GUCs",
  (sqlWithoutComments.match(/request\.jwt\.claim\.sub/g) ?? []).length === 8
    && (sqlWithoutComments.match(/request\.jwt\.claims/g) ?? []).length === 8
    && !/set_config\s*\(/i.test(sqlWithoutComments)
);
const existingPathNames = [
  "restaurants",
  "restaurant_branches",
  "menus",
  "menu_categories",
  "menu_items",
  "branch_menu_items",
  "menu_item_nutrition",
  "current_published_menu_item_nutrition",
  "restaurant_public_published_nutrition_v1",
  "consumer_public_next_meal_candidates_v1"
];
const existingPathMutation = existingPathNames.some((name) => new RegExp(`(?:ALTER|DROP|TRUNCATE)\\s+(?:TABLE|VIEW)\\s+public\\.${name}\\b`, "i").test(sqlWithoutComments));
const existingPathGrantChange = sqlStatements.some((statement) =>
  /^(?:GRANT|REVOKE)\b/i.test(statement)
  && existingPathNames.some((name) => new RegExp(`ON\\s+(?:TABLE\\s+)?public\\.${name}\\b`, "i").test(statement))
  && /\b(?:TO|FROM)\s+(?:PUBLIC|anon|authenticated)\s*$/i.test(statement)
);
record("public-safe restaurant menu and nutrition paths are unchanged", !existingPathMutation && !existingPathGrantChange);

const writeGrants = /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*?TO\s+authenticated/i.test(sqlWithoutComments);
const writePolicies = /CREATE\s+POLICY[\s\S]*?FOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(sqlWithoutComments);
record("authenticated membership write capability is absent", !writeGrants && !writePolicies);

const firstCorrectiveWithoutComments = correctiveMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const ownerCorrectiveWithoutComments = ownerCorrectiveMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const cleanupWithoutComments = cleanupMigration.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
const firstCorrectiveStatements = firstCorrectiveWithoutComments.split(";").map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
const ownerCorrectiveStatements = ownerCorrectiveWithoutComments.split(";").map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
const cleanupStatements = cleanupWithoutComments.split(";").map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
const strictRpcSignatures = Object.freeze([
  "public.restaurant_current_access_context_v1()",
  "public.restaurant_has_restaurant_permission(text, text)",
  "public.restaurant_has_branch_permission(text, text, text)"
]);
const executeAcl = new Map(strictRpcSignatures.map((signature) => [
  signature,
  new Map([["PUBLIC", true], ["anon", true], ["authenticated", true]])
]));

function applyAclStatements(statements, allowOwnerSwitch, initialMembership = { rowCount: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false }) {
  let currentRole = "postgres";
  let temporarySet = initialMembership.set;
  const membership = { ...initialMembership };
  for (const statement of statements) {
    if (/^GRANT restaurant_membership_context_reader TO postgres WITH (?:ADMIN (?:TRUE|FALSE), )?INHERIT FALSE, SET TRUE$/.test(statement)) temporarySet = true;
    if (statement === "GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET TRUE") membership.set = true;
    if (allowOwnerSwitch && statement === "SET LOCAL ROLE restaurant_membership_context_reader" && temporarySet) currentRole = "restaurant_membership_context_reader";
    if (statement === "SET LOCAL ROLE NONE") currentRole = "postgres";
    const revokeMatch = statement.match(/^REVOKE ALL ON FUNCTION (public\.restaurant_[a-z0-9_]+\([^)]*\)) FROM (PUBLIC|anon|authenticated)$/);
    if (currentRole === "restaurant_membership_context_reader" && revokeMatch && executeAcl.has(revokeMatch[1])) executeAcl.get(revokeMatch[1]).set(revokeMatch[2], false);
    const grantMatch = statement.match(/^GRANT EXECUTE ON FUNCTION (public\.restaurant_[a-z0-9_]+\([^)]*\)) TO authenticated$/);
    if (currentRole === "restaurant_membership_context_reader" && grantMatch && executeAcl.has(grantMatch[1])) executeAcl.get(grantMatch[1]).set("authenticated", true);
    if (statement === "GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET FALSE") {
      temporarySet = false;
      membership.admin = true;
      membership.inherit = false;
      membership.set = false;
    }
    if (statement === "REVOKE restaurant_membership_context_reader FROM postgres") {
      temporarySet = false;
      if (allowOwnerSwitch) membership.rowCount = 0;
    }
  }
  return { currentRole, temporarySet, membership };
}

const attempt3FinalState = applyAclStatements(firstCorrectiveStatements, false);
record(
  "attempt 3 without owner context leaves PUBLIC execute unchanged",
  strictRpcSignatures.every((signature) => executeAcl.get(signature).get("PUBLIC") === true)
    && attempt3FinalState.currentRole === "postgres"
    && attempt3FinalState.temporarySet === false
);

const ownerAclFinalState = applyAclStatements(ownerCorrectiveStatements, true);
const splitFinalState = applyAclStatements(cleanupStatements, false, ownerAclFinalState.membership);
record(
  "owner-context corrective has only the two approved local role switches",
  JSON.stringify(ownerCorrectiveStatements.filter((statement) => /^(?:SET|RESET)\b/.test(statement))) === JSON.stringify([
    "SET LOCAL ROLE restaurant_membership_context_reader",
    "SET LOCAL ROLE NONE"
  ])
    && !/WITH\s+GRANT\s+OPTION/i.test(ownerCorrectiveWithoutComments)
);
record(
  "split membership grants omit ADMIN completely",
  ownerCorrectiveStatements.filter((statement) => statement.startsWith("GRANT restaurant_membership_context_reader TO postgres")).length === 1
    && cleanupStatements.filter((statement) => statement.startsWith("GRANT restaurant_membership_context_reader TO postgres")).length === 1
    && [...ownerCorrectiveStatements, ...cleanupStatements]
      .filter((statement) => statement.startsWith("GRANT restaurant_membership_context_reader TO postgres"))
      .every((statement) => !/\bADMIN\b/i.test(statement))
);
record(
  "owner-context corrective removes PUBLIC execute from every strict RPC",
  strictRpcSignatures.every((signature) => executeAcl.get(signature).get("PUBLIC") === false)
);
record(
  "owner-context corrective removes anon execute from every strict RPC",
  strictRpcSignatures.every((signature) => executeAcl.get(signature).get("anon") === false)
);
record(
  "owner-context corrective leaves exact authenticated execute on every strict RPC",
  strictRpcSignatures.every((signature) => executeAcl.get(signature).get("authenticated") === true)
    && (ownerCorrectiveWithoutComments.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length === 3
);

const correctiveGrantIndex = ownerCorrectiveWithoutComments.indexOf("GRANT restaurant_membership_context_reader TO postgres");
const enterOwnerIndex = ownerCorrectiveWithoutComments.indexOf("SET LOCAL ROLE restaurant_membership_context_reader");
const firstAclIndex = ownerCorrectiveWithoutComments.indexOf("REVOKE ALL ON FUNCTION");
const lastAclIndex = ownerCorrectiveWithoutComments.lastIndexOf("GRANT EXECUTE ON FUNCTION");
const leaveOwnerIndex = ownerCorrectiveWithoutComments.indexOf("SET LOCAL ROLE NONE");
const correctiveCommitIndex = ownerCorrectiveWithoutComments.lastIndexOf("COMMIT");
record(
  "ACL migration leaves owner context safely and commits before cleanup",
  /GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET TRUE/i.test(ownerCorrectiveWithoutComments)
    && correctiveGrantIndex < firstAclIndex
    && correctiveGrantIndex < enterOwnerIndex
    && enterOwnerIndex < firstAclIndex
    && firstAclIndex < lastAclIndex
    && lastAclIndex < leaveOwnerIndex
    && leaveOwnerIndex < correctiveCommitIndex
    && !/GRANT restaurant_membership_context_reader TO postgres\s+WITH INHERIT FALSE, SET FALSE/i.test(ownerCorrectiveWithoutComments)
    && ownerAclFinalState.currentRole === "postgres"
    && ownerAclFinalState.temporarySet === true
);
record(
  "cleanup migration is a fresh SET-false-only transaction",
  JSON.stringify(cleanupStatements) === JSON.stringify([
    "BEGIN",
    "GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET FALSE",
    "COMMIT"
  ])
    && !/\b(?:SET|RESET)\s+(?:LOCAL\s+)?ROLE\b/i.test(cleanupWithoutComments)
    && !/\bADMIN\b|\bGRANTED\s+BY\b|\bREVOKE\b/i.test(cleanupWithoutComments)
    && !/\bFUNCTION\b|\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|VIEW|MATERIALIZED\s+VIEW|TRIGGER)\b|\bauth\./i.test(cleanupWithoutComments)
);
record(
  "two-migration final state preserves one original membership row and disables effective paths",
  splitFinalState.membership.rowCount === 1
    && splitFinalState.membership.grantor === "supabase_admin"
    && splitFinalState.membership.admin === true
    && splitFinalState.membership.inherit === false
    && splitFinalState.membership.set === false
    && splitFinalState.currentRole === "postgres"
    && splitFinalState.temporarySet === false
    && !/\bREVOKE\s+(?:(?:ADMIN|SET)\s+OPTION\s+FOR\s+)?restaurant_membership_context_reader\s+FROM\s+postgres\b/i.test(`${ownerCorrectiveWithoutComments}\n${cleanupWithoutComments}`)
    && !/\bGRANTED\s+BY\b/i.test(`${ownerCorrectiveWithoutComments}\n${cleanupWithoutComments}`)
);
record(
  "failure recovery stops at remote 27 when ACL migration fails",
  /### `010000` fails[\s\S]*?Remote remains 27\.[\s\S]*?Stop immediately\.[\s\S]*?Do not run `020000`/.test(knownIssue)
);
record(
  "failure recovery permits exactly one cleanup retry at remote 28",
  /### `010000` succeeds and `020000` fails[\s\S]*?Remote is 28[\s\S]*?inspect the actual RPC ACL and membership option state[\s\S]*?retry `020000` once and only once[\s\S]*?No manual hotfix[\s\S]*?second failure requires an immediate stop/.test(knownIssue)
);
record(
  "remote 29 and final SET false gate live smoke and Freeze",
  /### Both migrations succeed[\s\S]*?Remote is 29[\s\S]*?SET=false[\s\S]*?Only then may credential-backed live smoke and the remaining Freeze gates proceed/.test(knownIssue)
);
record(
  "owner-context corrective preserves strict RPC owner and definitions",
  (migration.match(/OWNER TO restaurant_membership_context_reader;/g) ?? []).length === 3
    && !/(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(ownerCorrectiveWithoutComments)
);
record(
  "owner-context corrective changes no table data RLS view or trigger",
  !/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|VIEW|MATERIALIZED\s+VIEW|TRIGGER)\b/i.test(ownerCorrectiveWithoutComments)
);
record(
  "owner-context corrective has no managed Auth or elevated browser dependency",
  !/auth\.uid\s*\(|\bON\s+SCHEMA\s+auth\b|service[_-]?role/i.test(ownerCorrectiveWithoutComments)
);
record(
  "owner-context corrective has no Phase 2V-C N4 or remote content",
  !/Phase\s+2V-C|\bN4\b|https?:\/\/|supabase\s+(?:db|migration|link)/i.test(ownerCorrectiveMigration)
);

const result = {
  status: failures.length ? "failed" : "passed",
  mode: "offline deterministic contract simulation",
  phase: "TastKind Runtime Integration Phase 2V-B",
  passedChecks: checks.filter((check) => check.pass).length,
  failedChecks: failures.length,
  checks,
  failures,
  networkUsed: false,
  credentialUsed: false,
  developmentOperationExecuted: false,
  productionTouched: false,
  databaseWriteExecuted: false
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
