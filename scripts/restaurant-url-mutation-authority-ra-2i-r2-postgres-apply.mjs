#!/usr/bin/env node
// Disposable local PostgreSQL gate. It never connects to Development or Production.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-url-mutation-authority-ra-2i-r2-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const CANDIDATE = "20260910050000_restaurant_url_server_only_mutation_authority.sql";
const PG_BIN = (process.env.RA2IURLR2_PG_BIN ?? process.env.RA2IP2_PG_BIN ?? process.env.RA2HP1_PG_BIN)?.trim();
const PG_MODULES = (process.env.RA2IURLR2_PG_MODULES ?? process.env.RA2IP2_PG_MODULES ?? process.env.RA2HP1_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set RA2IURLR2_PG_BIN and RA2IURLR2_PG_MODULES" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapSource.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) throw new Error("frozen PostgreSQL bootstrap unavailable");
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapEnd);
const checks = [], failures = [];
function check(name, pass, detail) {
  const result = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
function kill(pid) {
  if (!pid) return;
  if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} }
}
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
  server.on("error", reject);
});
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2i-url-r2-apply");
  const data = path.join(base, `data-${process.pid}-${Date.now()}`), log = `${data}.log`;
  fs.mkdirSync(base, { recursive: true });
  const init = child.spawnSync(exe("initdb"), ["-D", data, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort(), output = fs.openSync(log, "a");
  const processHandle = child.spawn(exe("postgres"), ["-D", data, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"], { detached: true, windowsHide: true, stdio: ["ignore", output, output] });
  processHandle.unref(); let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; kill(processHandle.pid); try { fs.closeSync(output); } catch {} try { fs.rmSync(data, { recursive: true, force: true }); } catch {} try { fs.rmSync(log, { force: true }); } catch {} };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); await probe.end(); return { port, stop }; }
    catch { try { await probe.end(); } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  stop(); throw new Error("PostgreSQL did not become ready");
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DISABLED = "33333333-3333-4333-8333-333333333333";
const NO_PERMISSION = "44444444-4444-4444-8444-444444444444";
const INACTIVE = "55555555-5555-4555-8555-555555555555";
const UNKNOWN = "66666666-6666-4666-8666-666666666666";
const WEBSITE_V1 = "public.restaurant_owner_set_public_website_v1(text,text,text,text,bigint)";
const WEBSITE_V2 = "public.restaurant_owner_set_public_website_v2(uuid,text,text,text,text,bigint)";
const SOCIAL_V1 = "public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)";
const SOCIAL_V2 = "public.restaurant_owner_set_public_social_link_v2(uuid,text,text,text,text,text,bigint)";
let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());
try {
  cluster = await startCluster();
  admin = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await admin.connect(); await admin.query(BOOTSTRAP); await runner.connect();
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  const identity = (await runner.query("select current_user,current_setting('is_superuser') superuser")).rows[0];
  check("migration runner is non-superuser", identity.current_user === "postgres" && identity.superuser === "off", identity);
  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied++; }
    catch (error) { check(`migration applies: ${file}`, false, { code: error.code, position: error.position, message: String(error.message).slice(0, 500) }); throw error; }
  }
  check("full chain applies with R2 last", applied === files.length && files.at(-1) === CANDIDATE, { applied, total: files.length, last: files.at(-1) });
  await q("grant anon, authenticated, service_role to postgres");

  const acl = (await q(`select
    has_function_privilege('authenticated',$1,'EXECUTE') website_v1_auth,
    has_function_privilege('authenticated',$2,'EXECUTE') website_v2_auth,
    has_function_privilege('anon',$2,'EXECUTE') website_v2_anon,
    has_function_privilege('service_role',$2,'EXECUTE') website_v2_service,
    has_function_privilege('authenticated',$3,'EXECUTE') social_v1_auth,
    has_function_privilege('authenticated',$4,'EXECUTE') social_v2_auth,
    has_function_privilege('anon',$4,'EXECUTE') social_v2_anon,
    has_function_privilege('service_role',$4,'EXECUTE') social_v2_service`, [WEBSITE_V1, WEBSITE_V2, SOCIAL_V1, SOCIAL_V2]))[0];
  check("website RPC execute boundary is exact", !acl.website_v1_auth && !acl.website_v2_auth && !acl.website_v2_anon && acl.website_v2_service, acl);
  check("social RPC execute boundary is exact", !acl.social_v1_auth && !acl.social_v2_auth && !acl.social_v2_anon && acl.social_v2_service, acl);
  const flags = await q("select rolname,rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname in ('restaurant_owner_public_website_write_authority','restaurant_owner_public_social_links_write_authority') order by rolname");
  check("sealed writers remain NOLOGIN NOINHERIT NOBYPASSRLS", flags.length === 2 && flags.every((role) => !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls), flags);
  const rls = await q("select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.restaurants'::regclass,'public.restaurant_public_social_links'::regclass) order by relname");
  // public.restaurants has never had FORCE ROW LEVEL SECURITY set by any predecessor migration
  // (confirmed by grep across every prior .sql file) -- only ENABLE. Only the newer
  // restaurant_public_social_links table (P2) forces it. R2 does not and must not change either
  // table's RLS enable/force flags -- it only swaps the actor source inside existing policies.
  const restaurants = rls.find((row) => row.relname === "restaurants");
  const socialLinks = rls.find((row) => row.relname === "restaurant_public_social_links");
  check("website and social tables keep their existing RLS enable/force posture", rls.length === 2
    && restaurants?.relrowsecurity === true && restaurants?.relforcerowsecurity === false
    && socialLinks?.relrowsecurity === true && socialLinks?.relforcerowsecurity === true, rls);

  await q("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test'),($3,'disabled@invalid.test'),($4,'staff@invalid.test'),($5,'inactive@invalid.test')", [A, B, DISABLED, NO_PERMISSION, INACTIVE]);
  await q("insert into public.restaurants(id,name,status) values ('r2-a','A','active'),('r2-b','B','active')");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name,public_phone) values ('r2-ba','r2-a','A Branch','active','Asia/Taipei','02-1234'),('r2-bb','r2-b','B Branch','active','Asia/Taipei',null)");
  const users = await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled'),($3,'disabled'),($4,'enabled'),($5,'enabled') returning id,auth_user_id", [A, B, DISABLED, NO_PERMISSION, INACTIVE]);
  const roles = await q("select id,role_key from public.restaurant_roles");
  const owner = roles.find((role) => role.role_key === "owner").id, staff = roles.find((role) => role.role_key === "staff").id;
  const user = (actor) => users.find((entry) => entry.auth_user_id === actor).id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'r2-a',$6,'active'),($2,'r2-b',$6,'active'),($3,'r2-a',$6,'active'),($4,'r2-a',$7,'active'),($5,'r2-a',$6,'inactive')", [user(A), user(B), user(DISABLED), user(NO_PERMISSION), user(INACTIVE), owner, staff]);
  await q("insert into public.menus(id,restaurant_id,name,status) values ('r2-m','r2-a','Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name) values ('r2-c','r2-m','Main')");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('r2-i','r2-a','r2-c','Item','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('r2-bi','r2-a','r2-ba','r2-i',100,'available',false,'available')");

  async function roleQuery(role, sql, params = []) {
    const connection = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await connection.connect();
    try { await connection.query("begin"); await connection.query(`set local role ${role}`); const result = await connection.query(sql, params); await connection.query("commit"); return { rows: result.rows }; }
    catch (error) { try { await connection.query("rollback"); } catch {} return { thrown: error.code }; }
    finally { await connection.end(); }
  }
  const website = (actor, restaurant, operation, expected, next, version) => roleQuery("service_role", "select public.restaurant_owner_set_public_website_v2($1::uuid,$2,$3,$4,$5,$6::bigint) out", [actor, restaurant, operation, expected, next, version]).then((result) => result.rows?.[0]?.out ?? result);
  const social = (actor, restaurant, provider, operation, expected, next, version) => roleQuery("service_role", "select public.restaurant_owner_set_public_social_link_v2($1::uuid,$2,$3,$4,$5,$6,$7::bigint) out", [actor, restaurant, provider, operation, expected, next, version]).then((result) => result.rows?.[0]?.out ?? result);

  check("authenticated direct old website RPC is denied", (await roleQuery("authenticated", "select public.restaurant_owner_set_public_website_v1('r2-a','set',null,'https://example.com/',0)")).thrown === "42501");
  check("authenticated direct new website RPC is denied", (await roleQuery("authenticated", "select public.restaurant_owner_set_public_website_v2(null,'r2-a','clear',null,null,0)")).thrown === "42501");
  check("authenticated direct old social RPC is denied", (await roleQuery("authenticated", "select public.restaurant_owner_set_public_social_link_v1('r2-a','instagram','set',null,'https://instagram.com/a',0)")).thrown === "42501");
  check("authenticated direct new social RPC is denied", (await roleQuery("authenticated", "select public.restaurant_owner_set_public_social_link_v2(null,'r2-a','instagram','clear',null,null,0)")).thrown === "42501");
  check("anon direct new mutation RPCs are denied", (await roleQuery("anon", "select public.restaurant_owner_set_public_website_v2(null,'r2-a','clear',null,null,0)")).thrown === "42501" && (await roleQuery("anon", "select public.restaurant_owner_set_public_social_link_v2(null,'r2-a','instagram','clear',null,null,0)")).thrown === "42501");
  check("authenticated direct table DML remains denied", (await roleQuery("authenticated", "update public.restaurants set public_website_url='https://evil.invalid/' where id='r2-a'")).thrown === "42501" && (await roleQuery("authenticated", "insert into public.restaurant_public_social_links(restaurant_id,provider,public_url,public_url_version) values ('r2-a','instagram','https://instagram.com/evil',1)")).thrown === "42501");

  const websiteSet = await website(A, "r2-a", "set", null, "https://example.com/b", "0");
  check("actor A mutates Restaurant A website", websiteSet.ok && websiteSet.publicWebsiteUrl === "https://example.com/b" && websiteSet.publicWebsiteUrlVersion === "1", websiteSet);
  check("actor A cannot mutate Restaurant B website", (await website(A, "r2-b", "set", null, "https://example.com/b", "0")).errorCode === "target_not_found");
  check("unknown actor is rejected", (await website(UNKNOWN, "r2-a", "clear", "https://example.com/b", null, "1")).errorCode === "permission_denied");
  check("disabled restaurant user is rejected", (await website(DISABLED, "r2-a", "clear", "https://example.com/b", null, "1")).errorCode === "permission_denied");
  check("actor without permission is rejected", (await website(NO_PERMISSION, "r2-a", "clear", "https://example.com/b", null, "1")).errorCode === "target_not_found");
  check("inactive membership is rejected", (await website(INACTIVE, "r2-a", "clear", "https://example.com/b", null, "1")).errorCode === "target_not_found");
  check("NULL actor is rejected", (await website(null, "r2-a", "clear", "https://example.com/b", null, "1")).errorCode === "unauthenticated");
  check("canonical-equivalent website SET is NO_CHANGE", (await website(A, "r2-a", "set", "https://example.com/b", "https://example.com/b", "1")).errorCode === "no_change");
  const httpSet = await website(A, "r2-a", "set", "https://example.com/b", "http://example.com/", "1");
  check("P1B HTTP remains accepted", httpSet.ok && httpSet.publicWebsiteUrl === "http://example.com/", httpSet);

  const socialSet = await social(A, "r2-a", "instagram", "set", null, "https://instagram.com/b", "0");
  check("actor A mutates Restaurant A social link", socialSet.ok && socialSet.publicUrl === "https://instagram.com/b" && socialSet.publicUrlVersion === "1", socialSet);
  check("actor A cannot mutate Restaurant B social link", (await social(A, "r2-b", "instagram", "set", null, "https://instagram.com/b", "0")).errorCode === "target_not_found");
  check("canonical-equivalent social SET is NO_CHANGE", (await social(A, "r2-a", "instagram", "set", "https://instagram.com/b", "https://instagram.com/b", "1")).errorCode === "no_change");
  check("P2 HTTP remains rejected", (await social(A, "r2-a", "instagram", "set", "https://instagram.com/b", "http://instagram.com/b", "1")).errorCode === "invalid_request");
  check("P2 provider binding remains exact", (await social(A, "r2-a", "instagram", "set", "https://instagram.com/b", "https://facebook.com/b", "1")).errorCode === "invalid_request");

  const context = await roleQuery("service_role", "select public.restaurant_owner_set_public_website_v2($1::uuid,'r2-a','set','http://example.com/','https://example.org/',2) out, current_setting('restaurant.url_mutation_actor',true) actor", [A]);
  check("actor context is cleared before v2 returns", context.rows?.[0]?.out?.ok && context.rows[0].actor === "", context);
  // A fresh connection (new backend/transaction, matching how PostgREST issues one request per
  // connection) must never see a GUC value left over from a previous v2 call. Probe the GUC
  // directly via the built-in current_setting(), which needs no special grant, rather than through
  // the sealed restaurant_url_actor_v1() wrapper (service_role itself intentionally has no EXECUTE
  // on that function -- only the two sealed writer roles do, since it is meant to be read from
  // inside their own SECURITY DEFINER bodies, not called directly by the service caller).
  // A brand-new connection/backend has never called set_config() for this custom GUC at all in its
  // own session lifetime, so current_setting(name, true) correctly returns NULL there (not ''),
  // which is an even stronger isolation signal than the same-session '' reset proven just above.
  check("actor context does not persist to a later call", (await roleQuery("service_role", "select current_setting('restaurant.url_mutation_actor',true) actor")).rows?.[0]?.actor === null);
  const failedThenFresh = await website(UNKNOWN, "r2-a", "clear", "https://example.org/", null, "999");
  check("failure path leaves no actor residue", failedThenFresh.errorCode === "permission_denied");
  const freshAfterFailure = await roleQuery("service_role", "select current_setting('restaurant.url_mutation_actor',true) actor");
  check("actor context clean after a failed call", freshAfterFailure.rows?.[0]?.actor === null);
  const actorBThenA = await website(B, "r2-a", "clear", "https://example.org/", null, "3");
  check("actor B call after actor A resolves as B, not A (cross-actor isolation)", actorBThenA.errorCode === "target_not_found");
  const stillA = await website(A, "r2-a", "set", "https://example.org/", "https://example.net/", "3");
  check("subsequent actor A call still resolves correctly after B's attempt", stillA.ok && stillA.publicWebsiteUrl === "https://example.net/");

  // Pooled-backend reuse (the actual concern behind this gate): reuse ONE physical connection
  // across multiple separate transactions -- matching how PgBouncer/Supavisor multiplex logical
  // requests onto shared backends -- and prove the GUC never survives from one transaction to the
  // next on that SAME connection, not merely that a fresh connection never had it.
  const pooled = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await pooled.connect();
  try {
    await pooled.query("begin"); await pooled.query("set local role service_role");
    const pooledSet = (await pooled.query(
      "select public.restaurant_owner_set_public_website_v2($1::uuid,'r2-a','clear','https://example.net/',null,4) out",
      [A])).rows[0].out;
    check("pooled txn 1: actor A mutation succeeds", pooledSet.ok && pooledSet.publicWebsiteUrl === null, pooledSet);
    await pooled.query("commit");

    await pooled.query("begin"); await pooled.query("set local role service_role");
    // Once this placeholder GUC has been instantiated at all in a backend (even transaction-locally
    // in an earlier, already-committed transaction), current_setting keeps returning its
    // session-level base value ('' -- the implicit default a first-referenced custom GUC gets),
    // not NULL, on later transactions in that SAME backend -- unlike a backend that never touched
    // it at all (checked above). This is not a leak: restaurant_url_actor_v1() itself normalizes
    // '' to NULL via nullif(...,'') before ever comparing it to anything, so '' and NULL are
    // functionally identical "no actor" states to every real consumer of this GUC.
    const pooledClean = (await pooled.query("select current_setting('restaurant.url_mutation_actor',true) actor")).rows[0].actor;
    check("pooled txn 2 (same connection): no residue from txn 1's actor", pooledClean === null || pooledClean === "", { pooledClean });
    const pooledB = (await pooled.query(
      "select public.restaurant_owner_set_public_website_v2($1::uuid,'r2-a','set',null,'https://example.invalid/',0) out",
      [B])).rows[0].out;
    check("pooled txn 2: resolves strictly as actor B, no leakage from txn 1's actor A", pooledB.errorCode === "target_not_found", pooledB);
    await pooled.query("commit");
  } finally { await pooled.end(); }

  const websiteAudit = (await q("select actor_auth_user_id::text actor,previous_version,next_version from restaurant_internal.restaurant_public_website_audit_log where restaurant_id='r2-a' order by created_at"));
  const socialAudit = (await q("select actor_auth_user_id::text actor,provider,previous_version,next_version from restaurant_internal.restaurant_public_social_link_audit_log where restaurant_id='r2-a' order by created_at"));
  check("website audit actor and versions remain end-user scoped", websiteAudit.length === 5 && websiteAudit.every((row) => row.actor === A && Number(row.next_version) === Number(row.previous_version) + 1), websiteAudit);
  check("social audit actor and versions remain end-user scoped", socialAudit.length === 1 && socialAudit[0].actor === A && socialAudit[0].provider === "instagram" && Number(socialAudit[0].next_version) === Number(socialAudit[0].previous_version) + 1, socialAudit);
  check("P1A phone remains unchanged", (await q("select public_phone from public.restaurant_branches where id='r2-ba'"))[0].public_phone === "02-1234");
  check("catalogue v4 remains one row per branch", Number((await q("select count(*) n from public.consumer_public_restaurant_catalog_v4 where restaurant_id='r2-a'"))[0].n) === 1);
  check("P2 public projection remains separate", (await q("select public_url from public.consumer_public_restaurant_social_links_v1 where restaurant_id='r2-a' and provider='instagram'"))[0].public_url === "https://instagram.com/b");
} catch (error) {
  if (!failures.length) check("harness completes", false, { code: error.code, message: String(error.message).slice(0, 500) });
} finally {
  try { await runner?.end(); } catch {} try { await admin?.end(); } catch {}
  cluster?.stop(); clearTimeout(watchdog);
}
console.log(JSON.stringify({ suite: SUITE, status: failures.length ? "failed" : "passed", database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failures.length, failed: failures.length, developmentTouched: false, productionTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
