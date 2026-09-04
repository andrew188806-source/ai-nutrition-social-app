#!/usr/bin/env node
import {
  auditClosureSources,
  auditDevelopmentSnapshot,
  readClosureSources,
  validDevelopmentFixture
} from "./platform-admin-ra-1c-r1-contract.mjs";

const clone = (value) => structuredClone(value);
const baseline = validDevelopmentFixture();
if (auditDevelopmentSnapshot(baseline).some((item) => !item.pass)
  || auditClosureSources(readClosureSources()).some((item) => !item.pass)) {
  console.error("Baseline must pass before mutations run"); process.exit(1);
}
const mutations = [];
const live = (name, mutate) => mutations.push({ name, run() {
  const fixture = clone(baseline); mutate(fixture); return auditDevelopmentSnapshot(fixture);
} });
const firstRole = (fixture) => fixture.roles[0];
live("ADMIN row treated as runtime USAGE", (fixture) => { firstRole(fixture).postgres_usage = true; });
live("INHERIT changed true", (fixture) => { firstRole(fixture).memberships[0].inherit_option = true; });
live("SET changed true", (fixture) => { firstRole(fixture).memberships[0].set_option = true; firstRole(fixture).postgres_set = true; });
live("client membership introduced", (fixture) => {
  const client = fixture.clients.find((item) => item.sealed_role === firstRole(fixture).role_name);
  client.is_member = true; client.direct_rows = 1;
});
live("grantor changed away from supabase_admin", (fixture) => { firstRole(fixture).memberships[0].grantor = "postgres"; });
live("member changed away from postgres", (fixture) => { firstRole(fixture).memberships[0].member = "authenticated"; });
live("arbitrary role accepted without manifest", (fixture) => { fixture.unmanifestedAuthorityRoles.push({ role_name: "arbitrary_authority" }); });
live("sealed role LOGIN enabled", (fixture) => { firstRole(fixture).rolcanlogin = true; });
live("BYPASSRLS enabled", (fixture) => { firstRole(fixture).rolbypassrls = true; });
mutations.push({ name: "P1 returns to impossible admin_option must be false invariant", run() {
  const sources = readClosureSources();
  const file = "scripts/platform-admin-ra-1c-p1-development-acceptance.mjs";
  sources[file] = sources[file].replace("membership.admin_option is true", "membership.admin_option is false");
  return auditClosureSources(sources);
} });

const results = mutations.map((mutation) => {
  const failures = mutation.run().filter((item) => !item.pass);
  const killed = failures.length > 0;
  console.log(`${killed ? "KILLED" : "SURVIVED"} ${mutation.name}${failures[0] ? ` -> ${failures[0].name}` : ""}`);
  return { name: mutation.name, killed, killedBy: failures[0]?.name };
});
const survivors = results.filter((item) => !item.killed);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-r1-mutations", total: results.length,
  killed: results.length - survivors.length, survivors: survivors.length, results }, null, 2));
if (survivors.length) process.exitCode = 1;
