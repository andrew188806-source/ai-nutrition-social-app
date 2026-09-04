import fs from "node:fs";
import path from "node:path";
import {
  RA1CR1_CLIENT_ROLES,
  RA1CR1_GOVERNED_ROLES,
  RA1CR1_PROJECT_NAME,
  RA1CR1_PROJECT_REF,
  RA1CR1_RECONCILED_EXCLUSIONS,
  RA1CR1_REPOSITORY_ROLE_DEFINITIONS
} from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const sorted = (values) => [...values].sort();
const stripSqlComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)--[^\n]*/g, "$1");

export function discoverRepositoryRoleDefinitions(root = process.cwd()) {
  const definitions = [];
  const directory = path.join(root, "supabase/migrations");
  for (const entry of fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    const file = `supabase/migrations/${entry}`;
    const sql = stripSqlComments(fs.readFileSync(path.join(root, file), "utf8"));
    for (const match of sql.matchAll(/\bcreate\s+role\s+([a-z_][a-z0-9_]*)\b/gi)) {
      definitions.push({ role: match[1].toLowerCase(), migration: file });
    }
  }
  return definitions.sort((a, b) => a.role.localeCompare(b.role));
}

export function auditRepositoryRoleDefinitions(definitions) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const expected = RA1CR1_REPOSITORY_ROLE_DEFINITIONS.map(({ role, migration }) => `${role}|${migration}`);
  const observed = definitions.map(({ role, migration }) => `${role}|${migration}`);
  check("repository CREATE ROLE inventory contains exactly nineteen definitions", definitions.length === 19, definitions);
  check("every repository role definition has an explicit governed or excluded disposition",
    same(sorted(observed), sorted(expected)), { expected: sorted(expected), observed: sorted(observed) });
  check("governed sealed-role manifest contains exactly seventeen explicit roles",
    RA1CR1_GOVERNED_ROLES.length === 17 && new Set(RA1CR1_GOVERNED_ROLES.map((item) => item.role)).size === 17);
  check("the only repository exclusions are explicit and source-pinned",
    RA1CR1_RECONCILED_EXCLUSIONS.length === 2
    && RA1CR1_RECONCILED_EXCLUSIONS.every((item) => item.role && item.migration && item.reason));
  return checks;
}

export function auditDevelopmentSnapshot(snapshot) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  check("Development project pin is exact",
    snapshot.project?.id === RA1CR1_PROJECT_REF && snapshot.project?.name === RA1CR1_PROJECT_NAME, snapshot.project);
  const expectedRoles = sorted(RA1CR1_GOVERNED_ROLES.map((item) => item.role));
  const observedRoles = sorted((snapshot.roles ?? []).map((item) => item.role_name));
  check("live governed role set matches the explicit manifest", same(observedRoles, expectedRoles), { expectedRoles, observedRoles });
  check("no unmanifested platform creator-admin authority exception exists",
    Array.isArray(snapshot.unmanifestedAuthorityRoles) && snapshot.unmanifestedAuthorityRoles.length === 0,
    snapshot.unmanifestedAuthorityRoles);

  for (const roleName of expectedRoles) {
    const role = snapshot.roles.find((item) => item.role_name === roleName);
    check(`${roleName}: role exists`, Boolean(role), role);
    if (!role) continue;
    check(`${roleName}: sealed role attributes are exact`, role.rolcanlogin === false && role.rolinherit === false
      && role.rolbypassrls === false && role.rolsuper === false && role.rolcreatedb === false
      && role.rolcreaterole === false && role.rolreplication === false, role);
    const memberships = role.memberships ?? [];
    check(`${roleName}: only the platform creator-admin membership exists`, memberships.length === 1
      && memberships[0]?.member === "postgres" && memberships[0]?.grantor === "supabase_admin"
      && memberships[0]?.admin_option === true && memberships[0]?.inherit_option === false
      && memberships[0]?.set_option === false, memberships);
    check(`${roleName}: postgres is a member without runtime USAGE or SET`, role.postgres_member === true
      && role.postgres_usage === false && role.postgres_set === false,
    { member: role.postgres_member, usage: role.postgres_usage, set: role.postgres_set });
    const clients = (snapshot.clients ?? []).filter((item) => item.sealed_role === roleName);
    check(`${roleName}: every normal client/runtime role is measured`, same(sorted(clients.map((item) => item.client_role)), sorted(RA1CR1_CLIENT_ROLES)), clients);
    check(`${roleName}: clients have no MEMBER, USAGE, SET, or direct row`, clients.length === RA1CR1_CLIENT_ROLES.length
      && clients.every((item) => item.is_member === false && item.can_use === false
        && item.can_set === false && item.direct_rows === 0), clients);
  }

  const business = snapshot.business ?? {};
  check("accepted P1 target remains active at version 6",
    business.target_status === "active" && business.target_version === "6", business);
  check("P1 receipts remain retained", business.receipts_total === 11 && business.receipts_applied === 6
    && business.receipts_rejected === 4 && business.receipts_noop === 1, business);
  check("deny-by-default Platform Admin state remains restored", business.active_platform_admins === 0, business);
  check("dev-branch-xinyi remains untouched", business.protected_status === "active" && business.protected_active === true
    && business.protected_district === "大安區" && business.protected_address === "信義路四段 200 號"
    && business.protected_geocode_status === "pending" && business.protected_geocode_attempts === 0
    && business.protected_latitude === null && business.protected_longitude === null, business);
  return checks;
}

export function readClosureSources(root = process.cwd()) {
  const files = [
    "docs/platform-admin-sealed-role-control-plane-ra-1c-r1.md",
    "scripts/platform-admin-ra-1c-p1-development-acceptance.mjs",
    "scripts/platform-admin-ra-1c-r1-development-security.mjs",
    "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs"
  ];
  return Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")]));
}

export function auditClosureSources(sources) {
  const checks = [];
  const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  const p1 = sources["scripts/platform-admin-ra-1c-p1-development-acceptance.mjs"] ?? "";
  const development = sources["scripts/platform-admin-ra-1c-r1-development-security.mjs"] ?? "";
  const manifest = sources["scripts/platform-admin-ra-1c-r1-successor-manifest.mjs"] ?? "";
  const decision = sources["docs/platform-admin-sealed-role-control-plane-ra-1c-r1.md"] ?? "";
  check("P1 accepts only ADMIN TRUE creator rows", p1.includes("membership.admin_option is true")
    && p1.includes("membership.inherit_option is false") && p1.includes("membership.set_option is false"));
  check("P1 rejects postgres runtime USAGE and SET", p1.includes("postgres_runtime_path")
    && p1.includes("pg_has_role('postgres',sealed.role_name,'usage')")
    && p1.includes("pg_has_role('postgres',sealed.role_name,'set')"));
  check("P1 retains the client/runtime membership denial", p1.includes("client_role_residue")
    && p1.includes("'anon','authenticated','authenticator','service_role'"));
  check("P1 no longer requires the impossible zero-member condition", !p1.includes("postgres_writer_member === false")
    && !p1.includes("membership.admin_option is false"));
  check("Development gate is hard-pinned and read-only", development.includes(`RA1CR1_PROJECT_REF`)
    && development.includes("TASTKIND_PLATFORM_ADMIN_RA1C_R1_DEVELOPMENT_SECURITY")
    && !/\b(insert|update|delete|grant|revoke|alter|create|drop|truncate)\s+/i.test(development));
  check("Development gate measures MEMBER, USAGE, and SET", ["'MEMBER'", "'USAGE'", "'SET'"].every((value) => development.includes(value)));
  check("manifest is explicit rather than suffix-derived", manifest.includes("RA1CR1_GOVERNED_ROLES")
    && manifest.includes("candidate_allergen_write_authority") && !/endsWith\(|includes\(.*authority/.test(manifest));
  check("architecture decision names the trusted boundary", decision.includes("supabase_admin → postgres → governed sealed authority role"));
  check("architecture decision records the future redesign boundary", decision.includes("future control-plane redesign"));
  check("architecture decision preserves P1 acceptance evidence", decision.includes("active → inactive")
    && decision.includes("same-session") && decision.includes("version 6"));
  return checks;
}

export function validDevelopmentFixture() {
  const roles = RA1CR1_GOVERNED_ROLES.map(({ role }) => ({
    role_name: role, rolcanlogin: false, rolinherit: false, rolbypassrls: false, rolsuper: false,
    rolcreatedb: false, rolcreaterole: false, rolreplication: false,
    memberships: [{ member: "postgres", grantor: "supabase_admin", admin_option: true,
      inherit_option: false, set_option: false }],
    postgres_member: true, postgres_usage: false, postgres_set: false
  }));
  const clients = roles.flatMap(({ role_name }) => RA1CR1_CLIENT_ROLES.map((client_role) => ({
    sealed_role: role_name, client_role, is_member: false, can_use: false, can_set: false, direct_rows: 0
  })));
  return {
    project: { id: RA1CR1_PROJECT_REF, name: RA1CR1_PROJECT_NAME }, roles, clients,
    unmanifestedAuthorityRoles: [],
    business: {
      target_status: "active", target_version: "6", receipts_total: 11, receipts_applied: 6,
      receipts_rejected: 4, receipts_noop: 1, active_platform_admins: 0,
      protected_status: "active", protected_active: true, protected_district: "大安區",
      protected_address: "信義路四段 200 號", protected_geocode_status: "pending",
      protected_geocode_attempts: 0, protected_latitude: null, protected_longitude: null
    }
  };
}
