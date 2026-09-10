#!/usr/bin/env node
// Disposable local PostgreSQL gate. It never connects to Development or Production.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "restaurant-owner-about-ra-2g-p1-postgres-apply", ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations"), CANDIDATE = "20260910060000_restaurant_owner_about_authority.sql", CANDIDATE_R1 = "20260910070000_restaurant_owner_about_visibility_universe_r1.sql";
const PG_BIN = (process.env.RA2GP1_PG_BIN ?? process.env.RA2IURLR2_PG_BIN ?? process.env.RA2IP2_PG_BIN ?? process.env.RA2HP1_PG_BIN)?.trim();
const PG_MODULES = (process.env.RA2GP1_PG_MODULES ?? process.env.RA2IURLR2_PG_MODULES ?? process.env.RA2IP2_PG_MODULES ?? process.env.RA2HP1_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set RA2GP1_PG_BIN and RA2GP1_PG_MODULES" }, null, 2));
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
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2g-p1-apply-gate");
  fs.mkdirSync(base, { recursive: true });
  const dataDir = path.join(base, `data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const output = fs.openSync(logFile, "a");
  const processHandle = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"], { detached: true, windowsHide: true, stdio: ["ignore", output, output] });
  processHandle.unref();
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; kill(processHandle.pid); try { fs.closeSync(output); } catch {} try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {} try { fs.rmSync(logFile, { force: true }); } catch {} };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); await probe.end(); return { port, stop }; }
    catch { try { await probe.end(); } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  stop(); throw new Error("disposable PostgreSQL did not become ready");
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const DISABLED = "55555555-5555-4555-8555-555555555555";
const NO_PERMISSION = "66666666-6666-4666-8666-666666666666";
const INACTIVE = "77777777-7777-4777-8777-777777777777";
const WRITER = "restaurant_owner_about_write_authority";
const AUDIT = "restaurant_internal.restaurant_about_audit_log";
let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());

try {
  cluster = await startCluster();
  admin = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await admin.connect();
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is non-superuser", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`migration applies: ${file}`, false, { code: error.code, position: error.position, message: String(error.message).slice(0, 500) }); throw error; }
  }
  check("1. migration applies and About-R1 is the sole last successor", applied === files.length && files.at(-1) === CANDIDATE_R1, { applied, total: files.length, last: files.at(-1) });
  check("1b. P1 migration is still present unmodified, immediately before R1", files.includes(CANDIDATE)
    && files[files.indexOf(CANDIDATE_R1) - 1] === CANDIDATE, { files: files.slice(-3) });

  const permission = (await q("select count(*)::int n from public.role_permissions p join public.restaurant_roles r on r.id=p.role_id where p.permission_key='restaurant.profile.about.write' and p.permission_scope='restaurant' and r.role_key='owner' and r.status='active'"))[0].n;
  check("2. exact owner permission exists", permission === 1, { permission });
  const role = (await q("select rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname=$1", [WRITER]))[0];
  check("3. sealed role NOLOGIN", !role.rolcanlogin, role);
  check("4. NOINHERIT", !role.rolinherit, role);
  check("5. NOBYPASSRLS", !role.rolbypassrls, role);

  await q("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test'),($3,'stranger@invalid.test'),($4,'disabled@invalid.test'),($5,'staff@invalid.test'),($6,'inactive@invalid.test')", [A, B, STRANGER, DISABLED, NO_PERMISSION, INACTIVE]);
  await q("insert into public.restaurants(id,name,status,public_website_url) values ('g1-a','A','active',null),('g1-b','B','active',null)");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name,public_phone) values ('g1-ba','g1-a','A Branch','active','Asia/Taipei',null)");
  await q("insert into public.menus(id,restaurant_id,name,status) values ('g1-m','g1-a','Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name) values ('g1-c','g1-m','Main')");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('g1-i','g1-a','g1-c','Item','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('g1-bi','g1-a','g1-ba','g1-i',100,'available',false,'available')");
  const users = await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'disabled'),($5,'enabled'),($6,'enabled') returning id,auth_user_id", [A, B, STRANGER, DISABLED, NO_PERMISSION, INACTIVE]);
  const roles = await q("select id,role_key from public.restaurant_roles");
  const owner = roles.find((r) => r.role_key === "owner").id, staff = roles.find((r) => r.role_key === "staff").id;
  const uid = (actor) => users.find((u) => u.auth_user_id === actor).id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'g1-a',$7,'active'),($2,'g1-b',$7,'active'),($3,'g1-b',$7,'active'),($4,'g1-a',$7,'active'),($5,'g1-a',$8,'active'),($6,'g1-a',$7,'inactive')",
    [uid(A), uid(B), uid(STRANGER), uid(DISABLED), uid(NO_PERMISSION), uid(INACTIVE), owner, staff]);
  await q("grant anon, authenticated, service_role to postgres");

  const call = async (actor, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try { await c.query("begin"); if (actor) await c.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]); await c.query("set local role authenticated"); const out = (await c.query(sql, params)).rows[0].out; await c.query("commit"); return out; }
    catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code }; }
    finally { await c.end(); }
  };
  const preview = (actor, restaurant) => call(actor, "select public.restaurant_owner_preview_about_v1($1) as out", [restaurant]);
  const mutate = (actor, restaurant, operation, expected, next, version) => call(actor, "select public.restaurant_owner_set_about_v1($1,$2,$3,$4,$5::bigint) as out", [restaurant, operation, expected, next, version]);
  const rows = () => q("select restaurant_about,restaurant_about_source,restaurant_about_version from public.restaurants where id='g1-a'");
  const auditCount = async () => Number((await q(`select count(*) n from ${AUDIT}`))[0].n);
  const asAuthenticated = async (sql) => { const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" }); await c.connect(); try { await c.query("begin"); await c.query("set local role authenticated"); await c.query(sql); await c.query("commit"); return { thrown: null }; } catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code }; } finally { await c.end(); } };
  const asAnon = async (sql, params) => { const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" }); await c.connect(); try { await c.query("begin"); await c.query("set local role anon"); const out = (await c.query(sql, params)).rows[0].out; await c.query("commit"); return out; } catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code }; } finally { await c.end(); } };

  check("6. authenticated direct About column UPDATE denied", (await asAuthenticated("update public.restaurants set restaurant_about='hack' where id='g1-a'")).thrown === "42501");
  check("7. anon mutation denied", (await asAnon("select public.restaurant_owner_set_about_v1($1,$2,$3,$4,$5::bigint) as out", ["g1-a", "set", null, "x", "0"])).thrown === "42501");
  check("8. unauthenticated mutation rejected", (await mutate(null, "g1-a", "set", null, "x", "0")).errorCode === "unauthenticated");

  const initial = await preview(A, "g1-a");
  check("9. Owner A preview succeeds", initial.ok === true && initial.restaurantAbout === null && initial.restaurantAboutVersion === "0", initial);
  const first = await mutate(A, "g1-a", "set", null, "台北巷弄中的家常料理小店。", "0");
  check("10. Owner A SET succeeds", first.ok === true && first.restaurantAbout === "台北巷弄中的家常料理小店。", first);
  const afterFirst = (await rows())[0];
  check("11. source becomes RESTAURANT_PROVIDED", afterFirst.restaurant_about_source === "RESTAURANT_PROVIDED", afterFirst);
  check("12. version 0 to 1", first.restaurantAboutVersion === "1" && afterFirst.restaurant_about_version === "1", { first, afterFirst });
  check("13. exactly one audit event", await auditCount() === 1, { count: await auditCount() });
  const projected = (await q("select restaurant_about from public.consumer_public_restaurant_about_v1 where restaurant_id='g1-a'"))[0];
  check("14. public projection immediately reflects About", projected?.restaurant_about === "台北巷弄中的家常料理小店。", projected);

  const auditsAfterFirst = await auditCount();
  const noChange = await mutate(A, "g1-a", "set", first.restaurantAbout, first.restaurantAbout, first.restaurantAboutVersion);
  check("15. identical SET is NO_CHANGE", noChange.errorCode === "no_change", noChange);
  check("16. no version change on NO_CHANGE", (await rows())[0].restaurant_about_version === "1");
  check("17. no audit on NO_CHANGE", await auditCount() === auditsAfterFirst);

  const trimmed = await mutate(A, "g1-a", "set", first.restaurantAbout, "  outer trim test  ", "1");
  check("18. outer ASCII trim correct", trimmed.ok === true && trimmed.restaurantAbout === "outer trim test", trimmed);
  const interior = await mutate(A, "g1-a", "set", trimmed.restaurantAbout, "a  b   c", trimmed.restaurantAboutVersion);
  check("19. interior spaces preserved", interior.ok === true && interior.restaurantAbout === "a  b   c", interior);
  const lf = await mutate(A, "g1-a", "set", interior.restaurantAbout, "line one\nline two", interior.restaurantAboutVersion);
  check("20. LF preserved", lf.ok === true && lf.restaurantAbout === "line one\nline two", lf);
  const emoji = await mutate(A, "g1-a", "set", lf.restaurantAbout, "好吃😀好玩", lf.restaurantAboutVersion);
  check("21. Unicode/emoji accepted", emoji.ok === true && emoji.restaurantAbout === "好吃😀好玩", emoji);

  const exact800 = "文".repeat(800);
  const at800 = await mutate(A, "g1-a", "set", emoji.restaurantAbout, exact800, emoji.restaurantAboutVersion);
  check("22. exactly 800 code points accepted", at800.ok === true && [...at800.restaurantAbout].length === 800, at800);
  const over801 = await mutate(A, "g1-a", "set", at800.restaurantAbout, "文".repeat(801), at800.restaurantAboutVersion);
  check("23. 801 rejected", over801.errorCode === "invalid_request", over801);
  const wsOnly = await mutate(A, "g1-a", "set", at800.restaurantAbout, "   \n   ", at800.restaurantAboutVersion);
  check("24. whitespace-only rejected", wsOnly.errorCode === "invalid_request", wsOnly);
  const tab = await mutate(A, "g1-a", "set", at800.restaurantAbout, `a${String.fromCharCode(9)}b`, at800.restaurantAboutVersion);
  check("25. TAB rejected", tab.errorCode === "invalid_request", tab);
  const cr = await mutate(A, "g1-a", "set", at800.restaurantAbout, `a${String.fromCharCode(13)}b`, at800.restaurantAboutVersion);
  check("26. CR rejected", cr.errorCode === "invalid_request", cr);
  const nul = await mutate(A, "g1-a", "set", at800.restaurantAbout, `a${String.fromCharCode(0)}b`, at800.restaurantAboutVersion);
  check("27. NUL/control rejected", nul.errorCode === "invalid_request" || nul.thrown !== undefined, nul);

  const current = await preview(A, "g1-a");
  check("28. cross-restaurant denied", (await mutate(B, "g1-a", "set", current.restaurantAbout, "x", current.restaurantAboutVersion)).errorCode === "target_not_found");
  check("29. non-owner denied", (await mutate(NO_PERMISSION, "g1-a", "set", current.restaurantAbout, "x", current.restaurantAboutVersion)).errorCode === "target_not_found");
  check("30. disabled user denied", (await mutate(DISABLED, "g1-a", "set", current.restaurantAbout, "x", current.restaurantAboutVersion)).errorCode === "permission_denied");
  check("31. inactive membership denied", (await mutate(INACTIVE, "g1-a", "set", current.restaurantAbout, "x", current.restaurantAboutVersion)).errorCode === "target_not_found");
  check("32. stale expected value denied", (await mutate(A, "g1-a", "set", "wrong-stale-value", "x", current.restaurantAboutVersion)).errorCode === "stale_state");
  check("33. stale expected version denied", (await mutate(A, "g1-a", "set", current.restaurantAbout, "x", "0")).errorCode === "stale_state");

  const clear = await mutate(A, "g1-a", "clear", current.restaurantAbout, null, current.restaurantAboutVersion);
  check("34. CLEAR succeeds", clear.ok === true, clear);
  check("35. About becomes NULL", clear.restaurantAbout === null, clear);
  const afterClear = (await rows())[0];
  check("36. source becomes NULL", afterClear.restaurant_about_source === null, afterClear);
  check("37. version increments once", Number(clear.restaurantAboutVersion) === Number(current.restaurantAboutVersion) + 1, { clear, current });
  const auditsAfterClear = await auditCount();
  const clearAction = (await q(`select action from ${AUDIT} order by created_at desc limit 1`))[0].action;
  check("38. one CLEAR audit", clearAction === "CLEAR", { clearAction });
  const clearAgain = await mutate(A, "g1-a", "clear", null, null, clear.restaurantAboutVersion);
  check("39. CLEAR from NULL is NO_CHANGE", clearAgain.errorCode === "no_change", clearAgain);
  check("40. no version/audit change on null CLEAR", (await rows())[0].restaurant_about_version === clear.restaurantAboutVersion && await auditCount() === auditsAfterClear);

  const preInjection = await preview(A, "g1-a");
  const sourceInjection = await call(A, "select public.restaurant_owner_set_about_v1($1,$2,$3,$4,$5::bigint) as out",
    ["g1-a", "set", preInjection.restaurantAbout, "no source param exists to inject", preInjection.restaurantAboutVersion]);
  check("41. source cannot be supplied by browser (no such parameter exists)", sourceInjection.ok === true && (await rows())[0].restaurant_about_source === "RESTAURANT_PROVIDED", sourceInjection);
  await mutate(A, "g1-a", "clear", sourceInjection.restaurantAbout, null, sourceInjection.restaurantAboutVersion);
  check("42. direct table DML cannot bypass RPC", (await asAuthenticated("update public.restaurants set restaurant_about='bypass', restaurant_about_source='RESTAURANT_PROVIDED' where id='g1-a'")).thrown === "42501");
  const auditAcl = (await q("select has_table_privilege('authenticated',$1,'SELECT') auth_read, has_table_privilege('anon',$1,'SELECT') anon_read", [AUDIT]))[0];
  check("43. audit private", !auditAcl.auth_read && !auditAcl.anon_read, auditAcl);
  const projectionColumns = (await q("select column_name from information_schema.columns where table_schema='public' and table_name='consumer_public_restaurant_about_v1' order by ordinal_position")).map((r) => r.column_name);
  check("44. public projection hides internal provenance/audit", JSON.stringify(projectionColumns) === JSON.stringify(["restaurant_id", "restaurant_about"]), projectionColumns);
  await q("insert into public.restaurants(id,name,status) values ('g1-hidden','Hidden','draft')");
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'g1-hidden',$2,'active')", [uid(A), owner]);
  const hiddenSet = await mutate(A, "g1-hidden", "set", null, "should not be publicly visible", "0");
  const hiddenProjection = await q("select count(*)::int n from public.consumer_public_restaurant_about_v1 where restaurant_id='g1-hidden'");
  check("45. projection does not broaden public restaurant visibility (About set on a non-active restaurant stays hidden)",
    hiddenSet.ok === true && hiddenSet.restaurantAbout === "should not be publicly visible" && hiddenProjection[0].n === 0,
    { hiddenSet, hiddenProjection });
  const catalogueCols = (await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='consumer_public_restaurant_catalog_v4' and column_name like '%about%'"))[0].n;
  const catalogueCount = (await q("select count(*)::int n from public.consumer_public_restaurant_catalog_v4 where restaurant_id='g1-a'"))[0].n;
  check("46. catalogue v4 structure/cardinality unchanged", catalogueCols === 0 && catalogueCount === 1, { catalogueCols, catalogueCount });
  check("47. P1A unchanged", (await q("select public_phone from public.restaurant_branches where id='g1-ba'"))[0].public_phone === null);
  check("48. P1B unchanged", (await q("select public_website_url from public.restaurants where id='g1-a'"))[0].public_website_url === null);
  const socialCount = (await q("select count(*)::int n from public.restaurant_public_social_links where restaurant_id='g1-a'"))[0].n;
  check("49. P2 unchanged", socialCount === 0, { socialCount });
  const urlR2Acl = (await q("select has_function_privilege('authenticated','public.restaurant_owner_set_public_website_v2(uuid,text,text,text,text,bigint)','EXECUTE') auth, has_function_privilege('service_role','public.restaurant_owner_set_public_website_v2(uuid,text,text,text,text,bigint)','EXECUTE') service"))[0];
  check("50. URL-R2 unchanged", !urlR2Acl.auth && urlR2Acl.service, urlR2Acl);

  const preClaim = await preview(A, "g1-a");
  const claimSet = await mutate(A, "g1-a", "set", preClaim.restaurantAbout, "本店主打高蛋白、無麩質、無花生餐點。", preClaim.restaurantAboutVersion);
  check("51. claim-like prose does not mutate nutrition (no nutrition tables exist/changed)", claimSet.ok === true, { preClaim, claimSet });
  const nutritionUnaffected = (await q("select count(*)::int n from public.branch_menu_items where id='g1-bi' and price='100.00' and availability='available' and sold_out=false and branch_specific_status='available'"))[0].n;
  check("52. does not mutate allergens/ingredients (offering facts untouched)", nutritionUnaffected === 1, { nutritionUnaffected });
  // These checks scan CODE, not the file's own explanatory prose -- the migration's top comment
  // deliberately names every isolated system (nutrition/allergen/ingredient/REC/Taste/GEO/Meal
  // Buddy/temporal) to document the boundary, which would otherwise false-positive a naive
  // whole-file scan. Strip -- comment lines first, matching the guard script's own convention.
  const migrationBare = fs.readFileSync(path.join(MIGRATIONS, CANDIDATE), "utf8").replace(/^\s*--.*$/gm, "");
  check("53. does not mutate ingredients (no ingredient table touched by this migration)", !migrationBare.match(/ingredient|allergen/i));
  check("54. does not mutate REC/Taste (no such object referenced)", !migrationBare.match(/taste|\brec\b/i));
  check("55. does not mutate GEO (no such object referenced)", !migrationBare.match(/geocode|latitude|longitude/i));
  check("56. does not mutate Meal Buddy (no such object referenced)", !migrationBare.match(/meal_buddy/i));
  check("57. does not mutate temporal (no such object referenced)", !migrationBare.match(/temporal|weekly_hours|special_hour/i));
  check("58. does not create moderation authority (no review/approval objects)", !migrationBare.match(/review_queue|pending_review|moderat|reviewer|review_state|approve_description|reject_description|claim_approval|content_moderator/i));

  await mutate(A, "g1-a", "clear", claimSet.restaurantAbout, null, claimSet.restaurantAboutVersion);

  // ===================== RA-2G-P1-R1: public visibility universe closure =====================
  const publicAbout = (restaurantId) => q("select restaurant_about from public.consumer_public_restaurant_about_v1 where restaurant_id=$1", [restaurantId]);
  const catalogueRows = (restaurantId) => q("select count(*)::int n from public.consumer_public_restaurant_catalog_v4 where restaurant_id=$1", [restaurantId]);

  // A. Active restaurant with an eligible catalogue row + About -> catalogue present, About present.
  // g1-a has an extensive mutation history from the checks above (this is a shared fixture, not a
  // fresh one), so read its actual live state rather than assuming NULL/version 0.
  const aBeforeSet = await preview(A, "g1-a");
  const aSet = await mutate(A, "g1-a", "set", aBeforeSet.restaurantAbout, "Restaurant A is catalogue-eligible.", aBeforeSet.restaurantAboutVersion);
  check("A. eligible restaurant: catalogue present", (await catalogueRows("g1-a"))[0].n >= 1);
  check("A. eligible restaurant: About present", aSet.ok === true && (await publicAbout("g1-a"))[0]?.restaurant_about === "Restaurant A is catalogue-eligible.", { aSet, aBeforeSet });

  // B. Active restaurant with About but NO eligible catalogue row -> catalogue absent, About absent.
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) select id,'g1-b',(select id from public.restaurant_roles where role_key='owner'),'active' from public.restaurant_users where auth_user_id=$1", [A]);
  const bSet = await mutate(A, "g1-b", "set", null, "Restaurant B has no catalogue-eligible rows.", "0");
  check("B. About SET succeeds even though restaurant is catalogue-ineligible", bSet.ok === true, bSet);
  check("B. catalogue-ineligible restaurant: catalogue absent", (await catalogueRows("g1-b"))[0].n === 0);
  check("B. catalogue-ineligible restaurant: About absent from public projection (THE DEFECT CLOSED)", (await publicAbout("g1-b")).length === 0, await publicAbout("g1-b"));

  // C. Draft/inactive restaurant with About -> catalogue absent, About absent.
  const cState = (await q("select restaurant_about,restaurant_about_version from public.restaurants where id='g1-hidden'"))[0];
  const cSet = cState.restaurant_about ? { ok: true } : await mutate(A, "g1-hidden", "set", cState.restaurant_about, "Draft restaurant C.", cState.restaurant_about_version);
  check("C. draft restaurant: catalogue absent", (await catalogueRows("g1-hidden"))[0].n === 0);
  check("C. draft restaurant: About absent from public projection", (await publicAbout("g1-hidden")).length === 0, { cSet, publicC: await publicAbout("g1-hidden") });

  // D. Restaurant with catalogue eligibility but About NULL -> catalogue present, About absent.
  await q("insert into public.restaurants(id,name,status) values ('g1-d','D','active')");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name,public_phone) values ('g1-d-ba','g1-d','D Branch','active','Asia/Taipei',null)");
  await q("insert into public.menus(id,restaurant_id,name,status) values ('g1-d-m','g1-d','Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name) values ('g1-d-c','g1-d-m','Main')");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('g1-d-i','g1-d','g1-d-c','Item','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('g1-d-bi','g1-d','g1-d-ba','g1-d-i',100,'available',false,'available')");
  check("D. catalogue-eligible, About NULL: catalogue present", (await catalogueRows("g1-d"))[0].n >= 1);
  check("D. catalogue-eligible, About NULL: About absent", (await publicAbout("g1-d")).length === 0);

  // E. Multiple eligible catalogue rows for restaurant A -> About projection still exactly ONE row.
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('g1-i2','g1-a','g1-c','Item Two','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('g1-bi2','g1-a','g1-ba','g1-i2',150,'available',false,'available')");
  const aCatalogueRowsAfter = (await catalogueRows("g1-a"))[0].n;
  check("E. restaurant A now has multiple catalogue rows", aCatalogueRowsAfter >= 2, { aCatalogueRowsAfter });
  check("E. About projection returns exactly ONE row for restaurant A", (await publicAbout("g1-a")).length === 1, await publicAbout("g1-a"));

  // F. SET/CLEAR/version/audit behavior unchanged (identical CAS semantics as before R1).
  const aCurrent = await preview(A, "g1-a");
  const fClear = await mutate(A, "g1-a", "clear", aCurrent.restaurantAbout, null, aCurrent.restaurantAboutVersion);
  check("F. CLEAR still succeeds with unchanged CAS/version/audit semantics", fClear.ok === true && fClear.restaurantAbout === null, fClear);
  check("F. About absent from public projection after CLEAR (still catalogue-eligible)", (await publicAbout("g1-a")).length === 0);

  // G. public About columns unchanged.
  const projectionColumnsR1 = (await q("select column_name from information_schema.columns where table_schema='public' and table_name='consumer_public_restaurant_about_v1' order by ordinal_position")).map((r) => r.column_name);
  check("G. public About columns unchanged", JSON.stringify(projectionColumnsR1) === JSON.stringify(["restaurant_id", "restaurant_about"]), projectionColumnsR1);

  // H. anon/authenticated grants unchanged.
  const r1Acl = (await q("select has_table_privilege('anon','public.consumer_public_restaurant_about_v1','SELECT') anon_r, has_table_privilege('authenticated','public.consumer_public_restaurant_about_v1','SELECT') auth_r"))[0];
  check("H. anon/authenticated grants unchanged", r1Acl.anon_r && r1Acl.auth_r, r1Acl);

  // I. catalogue v4 definition unchanged (row count for the whole disposable dataset stable).
  const catalogueDefinition = (await q("select pg_get_viewdef('public.consumer_public_restaurant_catalog_v4'::regclass) def"))[0].def;
  check("I. catalogue v4 definition unchanged (no reference to About)", !catalogueDefinition.toLowerCase().includes("restaurant_about"));

  // J. catalogue cardinality unchanged (About mutations above never altered catalogue row counts).
  check("J. catalogue cardinality for A unchanged by About mutations", (await catalogueRows("g1-a"))[0].n === aCatalogueRowsAfter);

  // K. phone/website/social unchanged.
  check("K. P1A phone unchanged", (await q("select public_phone from public.restaurant_branches where id='g1-ba'"))[0].public_phone === null);
  check("K. P1B website unchanged", (await q("select public_website_url from public.restaurants where id='g1-a'"))[0].public_website_url === null);
  const socialCountR1 = (await q("select count(*)::int n from public.restaurant_public_social_links where restaurant_id='g1-a'"))[0].n;
  check("K. P2 social unchanged", socialCountR1 === 0, { socialCountR1 });

  // L. no moderation authority introduced.
  check("L. no moderation authority introduced (R1 migration text)", !fs.readFileSync(path.join(MIGRATIONS, CANDIDATE_R1), "utf8")
    .replace(/^\s*--.*$/gm, "").match(/review_queue|pending_review|moderat|reviewer|approve_description|reject_description/i));
} catch (error) {
  if (!failures.length) check("harness completed without unexpected error", false, { code: error.code, message: String(error.message).slice(0, 500) });
} finally {
  try { await runner?.end(); } catch {}
  try { await admin?.end(); } catch {}
  cluster?.stop(); clearTimeout(watchdog);
}

console.log(JSON.stringify({
  suite: SUITE, status: failures.length ? "failed" : "passed", database: "disposable local PostgreSQL",
  migrationsApplied: applied, total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  productionTouched: false, developmentTouched: false
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
