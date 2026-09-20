#!/usr/bin/env node
// R2B-6: Integrated privileged validation / fresh apply. Disposable local PostgreSQL only. Never
// connects to Development or Production. Applies every migration from zero (127 historical +
// the 5 new R2B migrations) and then exercises the full Restaurant Catalog Authoring authority
// surface: positive flows, negative security, input validation, concurrency, and direct proof of
// the R2B-1 tenant-consistency triggers.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "restaurant-catalog-authoring-r2b-postgres-apply", ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const CANDIDATES = [
  "20260918010000_restaurant_catalog_tenant_consistency_r2b_1.sql",
  "20260918020000_restaurant_owner_menu_authoring_authority_r2b_2.sql",
  "20260918030000_restaurant_owner_menu_category_authoring_authority_r2b_3.sql",
  "20260918040000_restaurant_owner_menu_item_authoring_authority_r2b_4.sql",
  "20260918050000_restaurant_owner_branch_menu_item_linkage_authority_r2b_5.sql",
];
const PG_BIN = (process.env.R2B_PG_BIN ?? process.env.RA2GP1_PG_BIN ?? process.env.RA2IURLR2_PG_BIN ?? process.env.RA2IP2_PG_BIN ?? process.env.RA2HP1_PG_BIN)?.trim();
const PG_MODULES = (process.env.R2B_PG_MODULES ?? process.env.RA2GP1_PG_MODULES ?? process.env.RA2IURLR2_PG_MODULES ?? process.env.RA2IP2_PG_MODULES ?? process.env.RA2HP1_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set R2B_PG_BIN and R2B_PG_MODULES" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapSource.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) throw new Error("frozen PostgreSQL bootstrap unavailable");
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapEnd);
// P3H's Step-Up validator reads auth.sessions, which the frozen restaurant-track bootstrap does not
// create (same extension already established by scripts/staff-authority-p3-p6-p3k-postgres.mjs).
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [], failures = [];
function check(name, pass, detail) {
  const result = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(3, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.error(`     detail: ${JSON.stringify(detail).slice(0, 2000)}`);
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
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "r2b-apply-gate");
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
let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 25 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());

try {
  cluster = await startCluster();
  admin = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await admin.connect();
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP);
  await admin.query(BOOTSTRAP_EXTRA);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is non-superuser", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`migration applies: ${file}`, false, { code: error.code, position: error.position, message: String(error.message).slice(0, 500) }); throw error; }
  }
  // Exact successor awareness: the 5 R2B migrations are followed only by the authorized R2E, H3, H4 and ADMIN-AE1 migrations.
  const AUTHORIZED_TAIL = [...CANDIDATES, "20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql", "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql", "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql", "20260920010000_admin_operational_read_permissions_ae1.sql"];
  check("001. every migration applied; the 5 R2B migrations are followed only by the authorized R2E, H3, H4 and ADMIN-AE1 migrations, in order",
    applied === files.length && AUTHORIZED_TAIL.every((name, i) => files.at(-AUTHORIZED_TAIL.length + i) === name),
    { applied, total: files.length, tail: files.slice(-AUTHORIZED_TAIL.length) });

  await q("grant anon, authenticated, service_role to postgres");
  await q("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test'),($3,'stranger@invalid.test'),($4,'disabled@invalid.test'),($5,'staff@invalid.test'),($6,'inactive@invalid.test')", [A, B, STRANGER, DISABLED, NO_PERMISSION, INACTIVE]);
  await q("insert into public.restaurants(id,name,status) values ('r2b-a','R2B A','active'),('r2b-b','R2B B','active')");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) values ('r2b-a-branch','r2b-a','A Branch','active','Asia/Taipei'),('r2b-b-branch','r2b-b','B Branch','active','Asia/Taipei')");
  await q("insert into public.menus(id,restaurant_id,name,status) values ('r2b-a-menu','r2b-a','Existing A Menu','published'),('r2b-b-menu','r2b-b','Existing B Menu','published'),('r2b-a-archived-menu','r2b-a','Archived A Menu','archived')");
  await q("insert into public.menu_categories(id,menu_id,name,sort_order) values ('r2b-a-cat','r2b-a-menu','Mains',0),('r2b-b-cat','r2b-b-menu','Mains',0),('r2b-a-archived-cat','r2b-a-archived-menu','Old',0)");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('r2b-a-item','r2b-a','r2b-a-cat','Existing A Item','active'),('r2b-b-item','r2b-b','r2b-b-cat','Existing B Item','active'),('r2b-a-archived-item','r2b-a','r2b-a-cat','Archived A Item','archived')");

  const users = await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled'),($3,'disabled'),($4,'enabled') returning id,auth_user_id", [A, B, DISABLED, NO_PERMISSION]);
  const roles = await q("select id,role_key from public.restaurant_roles");
  const owner = roles.find((r) => r.role_key === "owner").id, staff = roles.find((r) => r.role_key === "staff").id;
  const uid = (actor) => users.find((u) => u.auth_user_id === actor).id;
  await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled')", [INACTIVE]);
  const inactiveUser = (await q("select id from public.restaurant_users where auth_user_id=$1", [INACTIVE]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'r2b-a',$5,'active'),
    ($2,'r2b-b',$5,'active'),
    ($3,'r2b-a',$5,'active'),
    ($4,'r2b-a',$6,'active'),
    ($7,'r2b-a',$5,'inactive')`,
    [uid(A), uid(B), uid(DISABLED), uid(NO_PERMISSION), owner, staff, inactiveUser]);
  // STRANGER deliberately gets no restaurant_users row at all: authenticated, but a true non-member.

  const call = async (actor, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try { await c.query("begin"); if (actor) await c.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]); await c.query("set local role authenticated"); const out = (await c.query(sql, params)).rows[0].out; await c.query("commit"); return out; }
    catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code, message: error.message }; }
    finally { await c.end(); }
  };
  const asRole = async (role, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try { await c.query("begin"); await c.query(`set local role ${role}`); const result = await c.query(sql, params); await c.query("commit"); return { rows: result.rows, thrown: null }; }
    catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code, message: error.message }; }
    finally { await c.end(); }
  };

  const createMenu = (actor, restaurantId, name) => call(actor, "select public.restaurant_owner_create_menu_v1($1,$2) as out", [restaurantId, name]);
  const previewMenu = (actor, restaurantId, menuId) => call(actor, "select public.restaurant_owner_preview_menu_v1($1,$2) as out", [restaurantId, menuId]);
  const setMenuName = (actor, menuId, expectedName, nextName, expectedVersion) => call(actor, "select public.restaurant_owner_set_menu_name_v1($1,$2,$3,$4::bigint) as out", [menuId, expectedName, nextName, expectedVersion]);
  const transitionMenu = (actor, menuId, expectedStatus, nextStatus, expectedVersion) => call(actor, "select public.restaurant_owner_transition_menu_status_v1($1,$2,$3,$4::bigint) as out", [menuId, expectedStatus, nextStatus, expectedVersion]);
  const createCategory = (actor, menuId, name, sortOrder) => call(actor, "select public.restaurant_owner_create_menu_category_v1($1,$2,$3::int) as out", [menuId, name, sortOrder ?? null]);
  const previewCategory = (actor, restaurantId, categoryId) => call(actor, "select public.restaurant_owner_preview_menu_category_v1($1,$2) as out", [restaurantId, categoryId]);
  const setCategoryContent = (actor, categoryId, expectedName, nextName, expectedSortOrder, nextSortOrder, expectedVersion) => call(actor, "select public.restaurant_owner_set_menu_category_content_v1($1,$2,$3,$4::int,$5::int,$6::bigint) as out", [categoryId, expectedName, nextName, expectedSortOrder, nextSortOrder, expectedVersion]);
  const createItem = (actor, restaurantId, categoryId, name, description, allergens) => call(actor, "select public.restaurant_owner_create_menu_item_v1($1,$2,$3,$4,$5::text[]) as out", [restaurantId, categoryId, name, description ?? null, allergens ?? null]);
  const previewItem = (actor, restaurantId, itemId) => call(actor, "select public.restaurant_owner_preview_menu_item_v1($1,$2) as out", [restaurantId, itemId]);
  const setItemContent = (actor, itemId, expName, nextName, expDesc, nextDesc, expAllergens, nextAllergens, expCategoryId, nextCategoryId, expectedVersion) =>
    call(actor, "select public.restaurant_owner_set_menu_item_content_v1($1,$2,$3,$4,$5,$6::text[],$7::text[],$8,$9,$10::bigint) as out",
      [itemId, expName, nextName, expDesc, nextDesc, expAllergens, nextAllergens, expCategoryId, nextCategoryId, expectedVersion]);
  const transitionItem = (actor, itemId, expectedStatus, nextStatus, expectedVersion) => call(actor, "select public.restaurant_owner_transition_menu_item_status_v1($1,$2,$3,$4::bigint) as out", [itemId, expectedStatus, nextStatus, expectedVersion]);
  const linkItem = (actor, branchId, itemId, price, availability) => call(actor, "select public.restaurant_owner_link_menu_item_to_branch_v1($1,$2,$3,$4) as out", [branchId, itemId, price, availability ?? null]);
  const previewPrice = (actor, restaurantId, branchId, branchMenuItemId) => call(actor, "select public.restaurant_owner_preview_branch_menu_item_price_v1($1,$2,$3) as out", [restaurantId, branchId, branchMenuItemId]);
  const setPrice = (actor, branchMenuItemId, expectedPrice, nextPrice, expectedVersion) => call(actor, "select public.restaurant_owner_set_branch_menu_item_price_v1($1,$2,$3,$4::bigint) as out", [branchMenuItemId, expectedPrice, nextPrice, expectedVersion]);

  // ===================== POSITIVE FLOWS =====================
  const menu = await createMenu(A, "r2b-a", "新菜單 Special Menu");
  check("002. Owner A creates own Menu", menu.ok === true && menu.status === "draft" && menu.nameVersion === "0" && menu.statusVersion === "0", menu);

  const category = await createCategory(A, menu.menuId, "主餐 Mains");
  check("003. Owner A creates Category under own Menu", category.ok === true && category.menuId === menu.menuId && category.sortOrder === 0, category);

  const item = await createItem(A, "r2b-a", category.menuCategoryId, "牛肉麵 Beef Noodle Soup", "溫暖濃郁的湯頭", ["牛肉", "麩質"]);
  check("004. Owner A creates Item under own Category", item.ok === true && item.status === "draft" && item.menuCategoryId === category.menuCategoryId, item);

  const renamedMenu = await setMenuName(A, menu.menuId, menu.name, "更新後菜單名稱", menu.nameVersion);
  check("005. Owner A edits own Menu name", renamedMenu.ok === true && renamedMenu.name === "更新後菜單名稱", renamedMenu);

  const editedCategory = await setCategoryContent(A, category.menuCategoryId, category.name, "主餐類", category.sortOrder, 5, category.contentVersion);
  check("006. Owner A edits own Category (rename + reorder)", editedCategory.ok === true && editedCategory.name === "主餐類" && editedCategory.sortOrder === 5, editedCategory);

  const editedItem = await setItemContent(A, item.menuItemId, item.name, "紅燒牛肉麵", item.description, "招牌紅燒湯頭", item.allergens, ["牛肉"], item.menuCategoryId, item.menuCategoryId, item.contentVersion);
  check("007. Owner A edits own Item content", editedItem.ok === true && editedItem.name === "紅燒牛肉麵" && JSON.stringify(editedItem.allergens) === JSON.stringify(["牛肉"]), editedItem);

  const publishedMenu = await transitionMenu(A, menu.menuId, "draft", "published", renamedMenu.nameVersion === undefined ? "0" : (await previewMenu(A, "r2b-a", menu.menuId)).statusVersion);
  check("008. Owner A transitions Menu draft to published", publishedMenu.ok === true && publishedMenu.status === "published", publishedMenu);

  const activatedItem = await transitionItem(A, item.menuItemId, "draft", "active", (await previewItem(A, "r2b-a", item.menuItemId)).statusVersion);
  check("009. Owner A transitions Item draft to active", activatedItem.ok === true && activatedItem.status === "active", activatedItem);

  const linked = await linkItem(A, "r2b-a-branch", item.menuItemId, "168", "available");
  check("010. Owner A links own Item to own Branch", linked.ok === true && linked.price === "168.00" && linked.branchId === "r2b-a-branch", linked);

  const pricePreview = await previewPrice(A, "r2b-a", "r2b-a-branch", linked.branchMenuItemId);
  check("011. new linked row is a normal branch_menu_items row for the FROZEN RA-2C price authority",
    pricePreview.ok === true && pricePreview.price === "168.00", pricePreview);
  const priceEdit = await setPrice(A, linked.branchMenuItemId, pricePreview.price, "199", pricePreview.priceVersion);
  check("012. the frozen RA-2C price control can edit the R2B-created row", priceEdit.ok === true && priceEdit.price === "199.00", priceEdit);

  // ===================== NEGATIVE SECURITY =====================
  check("013. anonymous denied (create menu)", (await asRole("anon", "select public.restaurant_owner_create_menu_v1($1,$2) as out", ["r2b-a", "x"])).thrown === "42501");
  check("014. authenticated non-member denied", (await createMenu(STRANGER, "r2b-a", "x")).errorCode === "permission_denied");
  check("015. inactive membership denied", (await createMenu(INACTIVE, "r2b-a", "x")).errorCode === "permission_denied");
  check("016. staff denied (no menu.write)", (await createMenu(NO_PERMISSION, "r2b-a", "x")).errorCode === "permission_denied");

  check("017. Owner A cannot create Menu under Restaurant B", (await createMenu(A, "r2b-b", "x")).errorCode === "permission_denied");
  check("018. Owner A cannot add Category to Restaurant B's Menu", (await createCategory(A, "r2b-b-menu", "x")).errorCode === "target_not_found");
  check("019. Owner A cannot create Item in Restaurant B's Category (p_restaurant_id=B)", (await createItem(A, "r2b-b", "r2b-b-cat", "x")).errorCode === "target_not_found");
  check("020. Owner A cannot create Item with mismatched restaurant_id/category tenant (p_restaurant_id=A, category=B's)", (await createItem(A, "r2b-a", "r2b-b-cat", "x")).errorCode === "target_not_found");

  const moveTarget = await setItemContent(A, item.menuItemId, editedItem.name, editedItem.name, editedItem.description, editedItem.description, editedItem.allergens, editedItem.allergens, editedItem.menuCategoryId, "r2b-b-cat", editedItem.contentVersion);
  check("021. Owner A cannot move Item into Restaurant B's Category", moveTarget.errorCode === "invalid_request", moveTarget);

  check("022. Owner A cannot link own Item to Restaurant B Branch", (await linkItem(A, "r2b-b-branch", item.menuItemId, "50")).errorCode === "target_not_found");
  check("023. Owner A cannot link Restaurant B Item to own Branch", (await linkItem(A, "r2b-a-branch", "r2b-b-item", "50")).errorCode === "target_not_found");

  check("024. anon raw INSERT into menu_items denied", (await asRole("anon", "insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('x','r2b-a','r2b-a-cat','x','draft')")).thrown === "42501");
  check("025. authenticated raw INSERT into menu_items denied (no direct table privilege at all)", (await asRole("authenticated", "insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('x','r2b-a','r2b-a-cat','x','draft')")).thrown === "42501");
  const sealedInjection = await asRole("restaurant_owner_menu_item_write_authority", "insert into public.menu_items(id,restaurant_id,menu_category_id,name,status,nutrition_badge_status) values ('inj','r2b-a','r2b-a-cat','x','draft','approved')");
  check("026. governed field cannot be injected even by the sealed writer itself (no INSERT grant on nutrition_badge_status)", sealedInjection.thrown === "42501", sealedInjection);
  const proc = (await q("select proargnames from pg_proc where proname='restaurant_owner_create_menu_item_v1'"))[0];
  check("027. create_menu_item_v1 has no nutrition_badge_status/badge_enabled/nutrition_id/tag_ids parameter at all", !JSON.stringify(proc.proargnames).match(/nutrition_badge_status|badge_enabled|nutrition_id|tag_ids/), proc);

  // ===================== INPUT VALIDATION =====================
  check("028. empty name rejected", (await createMenu(A, "r2b-a", "")).errorCode === "invalid_request");
  check("029. whitespace-only name rejected", (await createMenu(A, "r2b-a", "   ")).errorCode === "invalid_request");
  check("030. exactly 120 code points accepted", (await createMenu(A, "r2b-a", "字".repeat(120))).ok === true);
  check("031. 121 code points rejected", (await createMenu(A, "r2b-a", "字".repeat(121))).errorCode === "invalid_request");
  check("032. control character (TAB) in name rejected", (await createMenu(A, "r2b-a", `a${String.fromCharCode(9)}b`)).errorCode === "invalid_request");
  // A literal NUL byte cannot cross the Postgres wire protocol in a text parameter at all (Postgres
  // text is C-string-based) -- it never reaches this RPC's own validation, so \x01 (SOH) is used
  // instead: transmittable, and still one of the forbidden C0 control characters.
  check("033. control character (SOH, \\x01) in name rejected", (await createMenu(A, "r2b-a", `a${String.fromCharCode(1)}b`)).errorCode === "invalid_request");

  check("034. price 0 rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "0")).errorCode === "invalid_request");
  check("035. negative price rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "-5")).errorCode === "invalid_request");
  check("036. fractional price rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "10.5")).errorCode === "invalid_request");
  check("037. price over 999999 rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "1000000")).errorCode === "invalid_request");
  check("038. non-numeric price rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "abc")).errorCode === "invalid_request");
  check("039. invalid availability enum rejected", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "50", "bogus")).errorCode === "invalid_request");

  const freshMenuForTransition = await createMenu(A, "r2b-a", "Transition Test Menu");
  check("040. invalid status transition (published to draft) rejected",
    (await (async () => {
      const published = await transitionMenu(A, freshMenuForTransition.menuId, "draft", "published", freshMenuForTransition.statusVersion);
      return transitionMenu(A, freshMenuForTransition.menuId, "published", "draft", published.statusVersion);
    })()).errorCode === "invalid_transition");
  check("041. archived to anything rejected",
    (await (async () => {
      const p2 = await createMenu(A, "r2b-a", "Archive Test Menu");
      const arch = await transitionMenu(A, p2.menuId, "draft", "archived", p2.statusVersion);
      return transitionMenu(A, p2.menuId, "archived", "published", arch.statusVersion);
    })()).errorCode === "invalid_transition");

  check("042. nonexistent parent menu_id for category create -> target_not_found", (await createCategory(A, "does-not-exist", "x")).errorCode === "target_not_found");
  check("043. archived parent Menu rejects Category creation", (await createCategory(A, "r2b-a-archived-menu", "x")).errorCode === "parent_unavailable");
  check("044. archived parent Menu (via Category) rejects Item creation", (await createItem(A, "r2b-a", "r2b-a-archived-cat", "x")).errorCode === "parent_unavailable");
  check("045. archived Item rejects branch linkage", (await linkItem(A, "r2b-a-branch", "r2b-a-archived-item", "50")).errorCode === "parent_unavailable");
  await q("update public.restaurant_branches set status='archived' where id='r2b-b-branch'");
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) select id,'r2b-b',$1,'active' from public.restaurant_users where auth_user_id=$2 on conflict do nothing", [owner, A]);
  check("046. archived Branch rejects linkage", (await linkItem(B, "r2b-b-branch", "r2b-b-item", "50")).errorCode === "parent_unavailable");

  // ===================== CONCURRENCY =====================
  const raceMenu = await createMenu(A, "r2b-a", "Race Menu");
  const raceWinner = await setMenuName(A, raceMenu.menuId, raceMenu.name, "Race Winner", raceMenu.nameVersion);
  const raceLoser = await setMenuName(A, raceMenu.menuId, raceMenu.name, "Race Loser", raceMenu.nameVersion);
  check("047. two competing stale name edits: one succeeds", raceWinner.ok === true, raceWinner);
  check("048. two competing stale name edits: the other gets stale_state", raceLoser.errorCode === "stale_state", raceLoser);

  const raceItem = await createItem(A, "r2b-a", "r2b-a-cat", "Race Item");
  const firstLink = await linkItem(A, "r2b-a-branch", raceItem.menuItemId, "80");
  const duplicateLink = await linkItem(A, "r2b-a-branch", raceItem.menuItemId, "90");
  check("049. first branch linkage succeeds", firstLink.ok === true, firstLink);
  check("050. duplicate (branch, item) linkage reports already_linked, not a raw constraint error", duplicateLink.errorCode === "already_linked", duplicateLink);

  // ===================== TENANT CONSISTENCY TRIGGER (direct proof, privileged path) =====================
  const badMenuItemInsert = await asRole("postgres", "insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('bad-item','r2b-b','r2b-a-cat','x','draft')");
  check("051. privileged direct INSERT with mismatched menu_items.restaurant_id is rejected by the R2B-1 trigger", badMenuItemInsert.thrown === "P0001", badMenuItemInsert);

  const badBranchLinkInsertA = await asRole("postgres", "insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability) values ('bad-link-a','r2b-b','r2b-a-branch','r2b-a-item',50,'available')");
  check("052. privileged direct INSERT with branch_menu_items.restaurant_id != branch's restaurant_id is rejected", badBranchLinkInsertA.thrown === "P0001", badBranchLinkInsertA);

  const badBranchLinkInsertB = await asRole("postgres", "insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability) values ('bad-link-b','r2b-a','r2b-a-branch','r2b-b-item',50,'available')");
  check("053. privileged direct INSERT with branch_menu_items.restaurant_id != item's restaurant_id is rejected", badBranchLinkInsertB.thrown === "P0001", badBranchLinkInsertB);

  // ===================== PREDECESSOR SAFETY =====================
  const predecessorCols = (await q(`select
      has_column_privilege('restaurant_owner_branch_menu_item_write_authority','public.branch_menu_items','sold_out','UPDATE') sold_out_writer_ok,
      has_table_privilege('restaurant_owner_branch_menu_item_write_authority','public.menu_items','INSERT') sold_out_writer_widened,
      has_table_privilege('restaurant_owner_branch_menu_item_price_write_authority','public.menus','INSERT') price_writer_widened,
      has_table_privilege('restaurant_owner_about_write_authority','public.menu_items','INSERT') about_writer_widened
    `))[0];
  check("054. no frozen RA-2 predecessor writer was widened into R2B territory",
    predecessorCols.sold_out_writer_ok && !predecessorCols.sold_out_writer_widened && !predecessorCols.price_writer_widened && !predecessorCols.about_writer_widened,
    predecessorCols);
  const aboutStillWorks = await call(A, "select public.restaurant_owner_preview_about_v1($1) as out", ["r2b-a"]);
  check("055. a frozen RA-2G About RPC still functions unmodified against an R2B-created restaurant", aboutStillWorks.ok === true, aboutStillWorks);

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
