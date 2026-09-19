#!/usr/bin/env node
// R2E — disposable local PostgreSQL 17 gate. Never connects to Development or Production. Applies
// every migration from zero (127 historical + 5 R2B + 1 R2E) and proves the draft-item display-name
// visibility repair end to end, plus its negative/status-independence boundary.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "restaurant-owner-display-name-draft-visibility-r2e-postgres-apply";
const PG_BIN = (process.env.R2E_PG_BIN ?? process.env.R2B_PG_BIN ?? process.env.RA2GP1_PG_BIN)?.trim();
const PG_MODULES = (process.env.R2E_PG_MODULES ?? process.env.R2B_PG_MODULES ?? process.env.RA2GP1_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set R2E_PG_BIN and R2E_PG_MODULES" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapSource.indexOf("\n`;", bootstrapStart);
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapEnd);
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = []; const check = (name, pass, detail) => { checks.push({name, pass: Boolean(pass)}); console.log(`${pass?"PASS":"FAIL"} ${checks.length} ${name}`); if (!pass && detail !== undefined) console.error(`     detail: ${JSON.stringify(detail).slice(0,1500)}`); };
function kill(pid) { if (!pid) return; if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} } }
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); }); server.on("error", reject); });
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "r2e-apply-gate");
  fs.mkdirSync(base, { recursive: true });
  const dataDir = path.join(base, `data-${process.pid}-${Date.now()}`); const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort(); const output = fs.openSync(logFile, "a");
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

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const STRANGER = "44444444-4444-4444-8444-444444444444", DISABLED = "55555555-5555-4555-8555-555555555555";
const NO_PERMISSION = "66666666-6666-4666-8666-666666666666", INACTIVE = "77777777-7777-4777-8777-777777777777";
let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());

try {
  cluster = await startCluster();
  admin = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" }); await admin.connect();
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP); await admin.query(BOOTSTRAP_EXTRA);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" }); await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is non-superuser", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`migration applies: ${file}`, false, { code: error.code, position: error.position, message: String(error.message).slice(0, 800) }); throw error; }
  }
  check("001. every migration applied; total is exactly 135; R2E is followed only by the authorized H3 and H4 hardening migrations",
    applied === files.length && files.length === 135 && files.slice(-3).join("|") === ["20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql", "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql", "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql"].join("|"),
    { applied, total: files.length, last: files.slice(-3) });

  await q("grant anon, authenticated, service_role to postgres");
  await q("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test'),($3,'stranger@invalid.test'),($4,'disabled@invalid.test'),($5,'staff@invalid.test'),($6,'inactive@invalid.test')", [A, B, STRANGER, DISABLED, NO_PERMISSION, INACTIVE]);
  await q("insert into public.restaurants(id,name,status) values ('r2e-a','R2E A','active'),('r2e-b','R2E B','active')");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) values ('r2e-a-branch','r2e-a','A Branch','active','Asia/Taipei'),('r2e-b-branch','r2e-b','B Branch','active','Asia/Taipei')");
  const users = await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'disabled'),($5,'enabled'),($6,'enabled') returning id,auth_user_id", [A, B, STRANGER, DISABLED, NO_PERMISSION, INACTIVE]);
  const roles = await q("select id,role_key from public.restaurant_roles");
  const owner = roles.find((r) => r.role_key === "owner").id, staff = roles.find((r) => r.role_key === "staff").id;
  const uid = (actor) => users.find((u) => u.auth_user_id === actor).id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'r2e-a',$7,'active'),($2,'r2e-b',$7,'active'),($3,'r2e-b',$7,'active'),($4,'r2e-a',$7,'active'),($5,'r2e-a',$8,'active'),($6,'r2e-a',$7,'inactive')",
    [uid(A), uid(B), uid(STRANGER), uid(DISABLED), uid(NO_PERMISSION), uid(INACTIVE), owner, staff]);

  const call = async (actor, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" }); await c.connect();
    try { await c.query("begin"); if (actor) await c.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]); await c.query("set local role authenticated"); const out = (await c.query(sql, params)).rows[0].out; await c.query("commit"); return out; }
    catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code }; }
    finally { await c.end(); }
  };
  const createMenu = (actor, restaurantId, name) => call(actor, "select public.restaurant_owner_create_menu_v1($1,$2) as out", [restaurantId, name]);
  const createCategory = (actor, menuId, name) => call(actor, "select public.restaurant_owner_create_menu_category_v1($1,$2,$3::int) as out", [menuId, name, null]);
  const createItem = (actor, restaurantId, categoryId, name) => call(actor, "select public.restaurant_owner_create_menu_item_v1($1,$2,$3,$4,$5::text[]) as out", [restaurantId, categoryId, name, null, null]);
  const linkItem = (actor, branchId, itemId, price) => call(actor, "select public.restaurant_owner_link_menu_item_to_branch_v1($1,$2,$3,$4) as out", [branchId, itemId, price, null]);
  const previewName = (actor, restaurantId, branchId, bmi) => call(actor, "select public.restaurant_owner_preview_branch_menu_item_display_name_v1($1,$2,$3) as out", [restaurantId, branchId, bmi]);
  const setName = (actor, bmi, operation, expected, next, version) => call(actor, "select public.restaurant_owner_set_branch_menu_item_display_name_v1($1,$2,$3,$4,$5::bigint) as out", [bmi, operation, expected, next, version]);

  // --- §11 REQUIRED POSITIVE: draft menu -> draft category -> draft item -> valid linkage ----------
  const menu = await createMenu(A, "r2e-a", "R2E Draft Menu");
  check("002. draft Menu created", menu.ok === true && menu.status === "draft", menu);
  const category = await createCategory(A, menu.menuId, "R2E Draft Category");
  check("003. Category created under draft Menu", category.ok === true, category);
  const item = await createItem(A, "r2e-a", category.menuCategoryId, "R2E Draft Item");
  check("004. draft Item created", item.ok === true && item.status === "draft", item);
  const link = await linkItem(A, "r2e-a-branch", item.menuItemId, "42");
  check("005. valid branch_menu_items linkage created against the still-draft Item", link.ok === true, link);

  const preview1 = await previewName(A, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("006. RA-2F preview on the draft-item linkage: PASS (THE REPAIR TARGET)", preview1.ok === true && preview1.state === "ready"
    && preview1.branchSpecificDisplayName === null && preview1.canonicalDisplayName === "R2E Draft Item", preview1);

  const set1 = await setName(A, link.branchMenuItemId, "set", null, "分店限定草稿名稱", preview1.branchSpecificDisplayNameVersion);
  check("007. RA-2F SET custom name on the draft-item linkage: PASS", set1.ok === true && set1.branchSpecificDisplayName === "分店限定草稿名稱", set1);

  const preview2 = await previewName(A, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("008. preview returns the custom value", preview2.ok === true && preview2.branchSpecificDisplayName === "分店限定草稿名稱", preview2);

  const clear1 = await setName(A, link.branchMenuItemId, "clear", "分店限定草稿名稱", null, set1.branchSpecificDisplayNameVersion);
  check("009. RA-2F CLEAR on the draft-item linkage: PASS", clear1.ok === true && clear1.branchSpecificDisplayName === null, clear1);

  const preview3 = await previewName(A, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("010. preview falls back to the draft menu_items.name", preview3.ok === true && preview3.branchSpecificDisplayName === null
    && preview3.canonicalDisplayName === "R2E Draft Item", preview3);

  // --- §13 STATUS-INDEPENDENCE: active item, then archived item -------------------------------------
  const activate = await call(A, "select public.restaurant_owner_transition_menu_item_status_v1($1,$2,$3,$4::bigint) as out", [item.menuItemId, "draft", "active", item.statusVersion]);
  check("011. Item transitioned to active", activate.ok === true, activate);
  const previewActive = await previewName(A, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("012. RA-2F preview on the now-ACTIVE item's linkage: still PASS (status-independent)", previewActive.ok === true, previewActive);

  const archive = await call(A, "select public.restaurant_owner_transition_menu_item_status_v1($1,$2,$3,$4::bigint) as out", [item.menuItemId, "active", "archived", activate.statusVersion]);
  check("013. Item transitioned to archived", archive.ok === true, archive);
  const previewArchived = await previewName(A, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("014. RA-2F preview on the now-ARCHIVED item's linkage: still PASS (status-independent)", previewArchived.ok === true, previewArchived);

  // --- §12 NEGATIVES --------------------------------------------------------------------------------
  const menuB = await createMenu(B, "r2e-b", "R2E B Menu");
  const categoryB = await createCategory(B, menuB.menuId, "R2E B Category");
  const itemB = await createItem(B, "r2e-b", categoryB.menuCategoryId, "R2E B Item");
  const linkB = await linkItem(B, "r2e-b-branch", itemB.menuItemId, "10");
  check("015. B fixtures set up", linkB.ok === true, linkB);

  const crossTenant = await previewName(A, "r2e-b", "r2e-b-branch", linkB.branchMenuItemId);
  check("016. Owner A cannot preview display name for Restaurant B's item/linkage", crossTenant.ok === false && crossTenant.errorCode === "target_not_found", crossTenant);
  const crossTenantSet = await setName(A, linkB.branchMenuItemId, "set", null, "hack", "0");
  check("016b. Owner A cannot SET display name for Restaurant B's linkage", crossTenantSet.ok === false && crossTenantSet.errorCode === "target_not_found", crossTenantSet);

  // STRANGER owns Restaurant B, not Restaurant A -- from Restaurant A's perspective they are simply
  // a caller with no authority over THIS restaurant, which the RPC (correctly, matching every
  // sibling RA-2/R2B RPC's own established behavior) reports as target_not_found, not
  // permission_denied: the coarse gate only checks "does this caller hold display_name.write
  // ANYWHERE", and STRANGER does (for Restaurant B), so the specific-row join is what fails.
  const nonOwner = await previewName(STRANGER, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("017. caller who owns an unrelated restaurant cannot use RA-2F preview against Restaurant A", nonOwner.ok === false && nonOwner.errorCode === "target_not_found", nonOwner);

  const inactiveResult = await previewName(INACTIVE, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("018. inactive membership denied", inactiveResult.ok === false && inactiveResult.errorCode === "permission_denied", inactiveResult);

  const staffResult = await previewName(NO_PERMISSION, "r2e-a", "r2e-a-branch", link.branchMenuItemId);
  check("019. staff role denied (no display_name.write permission)", staffResult.ok === false && staffResult.errorCode === "permission_denied", staffResult);

  const anonResult = await call(null, "select public.restaurant_owner_preview_branch_menu_item_display_name_v1($1,$2,$3) as out", ["r2e-a", "r2e-a-branch", link.branchMenuItemId]);
  check("020. anonymous denied", anonResult.errorCode === "unauthenticated" || anonResult.thrown !== undefined, anonResult);

  // --- boundary: sealed role has no raw browser visibility, no UPDATE, no widened columns -----------
  const grantCheck = (await q(`select
      has_table_privilege('anon','public.menu_items','SELECT') anon_select,
      has_table_privilege('authenticated','public.menu_items','SELECT') auth_select,
      has_table_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','UPDATE') role_update,
      has_table_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','INSERT') role_insert,
      has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','description','SELECT') role_desc,
      has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','status','SELECT') role_status,
      has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','id','SELECT') role_id,
      has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','name','SELECT') role_name,
      has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority','public.menu_items','restaurant_id','SELECT') role_restaurant_id
  `))[0];
  check("021. sealed role: no raw browser visibility, no write authority, exactly {id,name,restaurant_id} readable, nothing broader",
    grantCheck.anon_select === false && grantCheck.auth_select === false && grantCheck.role_update === false && grantCheck.role_insert === false
    && grantCheck.role_desc === false && grantCheck.role_status === false
    && grantCheck.role_id === true && grantCheck.role_name === true && grantCheck.role_restaurant_id === true, grantCheck);

  // --- active-item behavior unchanged: a brand-new active item (mirrors pre-R2B/pre-R2E world) ------
  const menuA2 = await createMenu(A, "r2e-a", "R2E Legacy-Style Menu");
  const categoryA2 = await createCategory(A, menuA2.menuId, "R2E Legacy-Style Category");
  const itemA2 = await createItem(A, "r2e-a", categoryA2.menuCategoryId, "R2E Legacy-Style Item");
  const activateA2 = await call(A, "select public.restaurant_owner_transition_menu_item_status_v1($1,$2,$3,$4::bigint) as out", [itemA2.menuItemId, "draft", "active", itemA2.statusVersion]);
  const linkA2 = await linkItem(A, "r2e-a-branch", itemA2.menuItemId, "20");
  const previewA2 = await previewName(A, "r2e-a", "r2e-a-branch", linkA2.branchMenuItemId);
  check("022. active-item display-name preview behavior is unchanged by this repair", previewA2.ok === true && previewA2.canonicalDisplayName === "R2E Legacy-Style Item", previewA2);

  // --- predecessor safety: no other RA-2 sealed role was widened -----------------------------------
  const predecessorCheck = (await q(`select
      has_column_privilege('restaurant_owner_menu_item_write_authority','public.menu_items','name','UPDATE') item_writer_ok,
      has_table_privilege('restaurant_owner_branch_menu_item_write_authority','public.menu_items','SELECT') sold_out_widened,
      has_table_privilege('restaurant_owner_branch_menu_item_price_write_authority','public.menu_items','SELECT') price_widened,
      has_table_privilege('restaurant_owner_branch_menu_item_availability_write_authority','public.menu_items','SELECT') availability_widened,
      has_table_privilege('restaurant_owner_branch_menu_item_visibility_write_authority','public.menu_items','SELECT') visibility_widened,
      has_table_privilege('restaurant_owner_branch_menu_item_creation_authority','public.menu_items','UPDATE') linkage_creator_widened
  `))[0];
  check("023. no sibling RA-2/R2B sealed role was widened by this migration (item-writer's own pre-existing grant is untouched, everyone else stays at zero)",
    predecessorCheck.item_writer_ok === true && predecessorCheck.sold_out_widened === false && predecessorCheck.price_widened === false
    && predecessorCheck.availability_widened === false && predecessorCheck.visibility_widened === false && predecessorCheck.linkage_creator_widened === false,
    predecessorCheck);

} catch (error) {
  if (!checks.some((c) => !c.pass)) check("harness completed without unexpected error", false, { code: error.code, message: String(error.message).slice(0, 800) });
} finally {
  try { await runner?.end(); } catch {}
  try { await admin?.end(); } catch {}
  cluster?.stop(); clearTimeout(watchdog);
}

const failures = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: SUITE, status: failures.length ? "failed" : "passed", database: "disposable local PostgreSQL",
  migrationsApplied: applied, total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  productionTouched: false, developmentTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
