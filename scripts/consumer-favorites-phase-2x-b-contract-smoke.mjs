import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const favoriteRoot = path.join(featureRoot, "consumer-favorites");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-b-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "Contract assertion failed.") {
  if (!condition) throw new Error(`${name}: ${message}`);
  checks.push({ name, pass: true });
}

function session(actorId) {
  return {
    user: {
      userId: actorId,
      provider: "mock",
      isAnonymous: false,
      emailVerified: true,
      createdAt: "2026-07-01T00:00:00.000Z"
    },
    provider: "mock",
    issuedAt: "2026-07-18T00:00:00.000Z"
  };
}

function auth(value) {
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value }; },
    observeAuthState() { return () => {}; },
    async signIn() { return { ok: true, value: value ?? session("actor") }; },
    async signUp() { return { ok: true, value: value ?? session("actor") }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value }; }
  };
}

const restaurant = { kind: "restaurant", restaurantId: "restaurant-1" };
const menuItem = { kind: "menu_item", restaurantId: "restaurant-1", menuItemId: "menu-item-1" };
const otherRestaurant = { kind: "restaurant", restaurantId: "restaurant-2" };

try {
  const program = ts.createProgram(collectTsFiles(favoriteRoot), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: compiledRoot,
    rootDir: featureRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "Phase 2X-B TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-favorites", "index.js"));
  const favorite = requireFromTemp("./index.js");

  const defaults = favorite.getConsumerFavoriteRuntimeFlags({});
  expect(defaults.readSource === "disabled" && defaults.writeSource === "disabled", "default read and write sources are disabled");
  const missingValue = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: ""
  });
  expect(missingValue.readSource === "disabled" && missingValue.writeSource === "disabled", "missing source values fail closed to disabled");
  const unsupported = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "supabase",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "live"
  });
  expect(unsupported.readSource === "disabled" && unsupported.writeSource === "disabled" && unsupported.issues.length === 2, "unsupported sources do not fall back to mock");
  let unsupportedError = null;
  try { favorite.createConsumerFavoriteRepositories(unsupported); } catch (error) { unsupportedError = error; }
  expect(unsupportedError?.code === "favorite_configuration_invalid", "invalid source configuration is rejected");

  const disabled = favorite.createConsumerFavoriteRuntime({ authPort: auth(session("actor-a")), flags: defaults });
  expect((await disabled.service.getCurrentUserFavorite(restaurant)).status === "disabled", "disabled read fails closed");
  expect((await disabled.service.listCurrentUserFavorites({ entityType: "restaurant" })).status === "disabled", "disabled list fails closed");
  expect((await disabled.service.addCurrentUserFavorite(restaurant)).status === "disabled", "disabled add fails closed");
  expect((await disabled.service.removeCurrentUserFavorite(restaurant)).status === "disabled", "disabled remove fails closed");

  const mockFlags = { readSource: "mock", writeSource: "mock", issues: [] };
  let idSequence = 0;
  let timeSequence = 0;
  const times = [
    "2026-07-18T01:00:00.000Z",
    "2026-07-18T02:00:00.000Z",
    "2026-07-18T03:00:00.000Z",
    "2026-07-18T04:00:00.000Z"
  ];
  const runtime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")),
    actorId: "actor-a",
    clock: () => times[Math.min(timeSequence++, times.length - 1)],
    idGenerator: () => `favorite-id-${++idSequence}`,
    flags: mockFlags
  });

  const mixed = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a",
    flags: { readSource: "mock", writeSource: "disabled", issues: [] }
  });
  expect(mixed.readRepository.readSource === "mock" && mixed.writeRepository.writeSource === "disabled", "read and write source selection remains independent");
  let missingActorError = null;
  try { favorite.createConsumerFavoriteRuntime({ authPort: auth(session("actor-a")), flags: mockFlags }); } catch (error) { missingActorError = error; }
  expect(missingActorError?.code === "favorite_configuration_invalid", "mock source without an injected actor fails closed");

  const signedOut = favorite.createConsumerFavoriteRuntime({
    authPort: auth(null), actorId: "actor-a", flags: mockFlags
  });
  expect((await signedOut.service.getCurrentUserFavorite(restaurant)).status === "unauthenticated", "missing session returns unauthenticated read");
  expect((await signedOut.service.addCurrentUserFavorite(restaurant)).status === "unauthenticated", "missing session returns unauthenticated write");
  const authFailurePort = { ...auth(null), async getCurrentSession() { return { ok: false, error: new Error("private") }; } };
  const authFailure = favorite.createConsumerFavoriteRuntime({ authPort: authFailurePort, actorId: "actor-a", flags: mockFlags });
  const authFailureResult = await authFailure.service.getCurrentUserFavorite(restaurant);
  expect(authFailureResult.status === "unauthenticated" && authFailureResult.error.code === "favorite_authentication_failed", "authentication verification failure maps deterministically");
  const actorMismatch = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-b")), actorId: "actor-a", flags: mockFlags
  });
  const actorMismatchResult = await actorMismatch.service.getCurrentUserFavorite(restaurant);
  expect(actorMismatchResult.status === "unauthenticated" && actorMismatchResult.error.code === "favorite_authentication_failed", "injected mock actor must match the authenticated session");
  expect((await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "" })).status === "invalid_target", "invalid restaurant target fails closed");
  expect((await runtime.service.getCurrentUserFavorite({ kind: "menu_item", restaurantId: "restaurant-1", menuItemId: "" })).status === "invalid_target", "invalid menu-item target fails closed");
  expect((await runtime.service.getCurrentUserFavorite({ ...restaurant, userId: "forbidden" })).status === "invalid_target", "caller ownership field is rejected");
  expect((await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "fav-derived" })).status === "invalid_target", "fav-derived target identity is rejected");
  expect((await runtime.service.getCurrentUserFavorite(restaurant)).status === "missing", "restaurant missing returns missing");
  expect((await runtime.service.getCurrentUserFavorite(menuItem)).status === "missing", "menu item missing returns missing");

  const throwingRead = {
    readSource: "mock",
    async getCurrentUserFavorite() { throw new Error("private"); },
    async listCurrentUserFavorites() { throw new Error("private"); }
  };
  const throwingWrite = {
    writeSource: "mock",
    async addCurrentUserFavorite() { throw new Error("private"); },
    async removeCurrentUserFavorite() { throw new Error("private"); }
  };
  const failureService = new favorite.ConsumerFavoriteService({
    authPort: auth(session("actor-a")), readRepository: throwingRead, writeRepository: throwingWrite
  });
  const failedRead = await failureService.getCurrentUserFavorite(restaurant);
  const failedWrite = await failureService.addCurrentUserFavorite(restaurant);
  expect(failedRead.status === "read_failed" && failedRead.error.code === "favorite_read_failed", "repository read exception maps without leaking details");
  expect(failedWrite.status === "write_failed" && failedWrite.error.code === "favorite_write_failed", "repository write exception maps without leaking details");

  const addRestaurant = await runtime.service.addCurrentUserFavorite(restaurant);
  expect(addRestaurant.status === "added" && addRestaurant.record.favoriteId === "favorite-id-1" && addRestaurant.record.active, "restaurant add returns an active record with injected ID");
  const duplicateRestaurant = await runtime.service.addCurrentUserFavorite(restaurant);
  expect(duplicateRestaurant.status === "already_present" && duplicateRestaurant.record.favoriteId === "favorite-id-1", "duplicate restaurant add is idempotent");
  expect((await runtime.service.getCurrentUserFavorite(restaurant)).status === "available", "restaurant read returns active row");
  const removeRestaurant = await runtime.service.removeCurrentUserFavorite(restaurant);
  expect(removeRestaurant.status === "removed" && !removeRestaurant.record.active, "restaurant remove returns an inactive canonical record");
  expect((await runtime.service.getCurrentUserFavorite(restaurant)).status === "missing", "removed restaurant is excluded from current read");
  expect((await runtime.service.removeCurrentUserFavorite(restaurant)).status === "already_absent", "second restaurant remove is idempotent");
  const readdRestaurant = await runtime.service.addCurrentUserFavorite(restaurant);
  expect(readdRestaurant.status === "added" && readdRestaurant.record.favoriteId === "favorite-id-2" && readdRestaurant.record.active, "re-add creates a new active row");
  const restaurantHistory = runtime.writeRepository.getHistoryForContract(restaurant);
  expect(restaurantHistory.length === 2 && restaurantHistory[0].favoriteId === "favorite-id-1" && !restaurantHistory[0].active, "removed historical row is preserved without overwrite");

  const addMenu = await runtime.service.addCurrentUserFavorite(menuItem);
  expect(addMenu.status === "added" && addMenu.record.target.kind === "menu_item", "menu-item add succeeds independently");
  expect((await runtime.service.getCurrentUserFavorite(menuItem)).status === "available", "menu-item read succeeds");
  expect((await runtime.service.removeCurrentUserFavorite(menuItem)).status === "removed", "menu-item remove succeeds");
  expect((await runtime.service.getCurrentUserFavorite(restaurant)).status === "available", "menu-item removal does not affect restaurant state");

  const sharedStore = favorite.createMockConsumerFavoriteStore();
  const actorA = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", store: sharedStore,
    idGenerator: () => "actor-a-row", clock: () => "2026-07-18T05:00:00.000Z", flags: mockFlags
  });
  const actorB = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-b")), actorId: "actor-b", store: sharedStore,
    idGenerator: () => "actor-b-row", clock: () => "2026-07-18T05:00:00.000Z", flags: mockFlags
  });
  await actorA.service.addCurrentUserFavorite(otherRestaurant);
  expect((await actorB.service.getCurrentUserFavorite(otherRestaurant)).status === "missing", "mock actor cannot read another actor's favorite");
  expect((await actorB.service.removeCurrentUserFavorite(otherRestaurant)).status === "already_absent", "mock actor cannot mutate another actor's favorite");
  await actorB.service.addCurrentUserFavorite(otherRestaurant);
  expect(sharedStore.rows.length === 2, "same target remains isolated across explicitly shared actors");

  const isolatedOne = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", idGenerator: () => "isolated-one",
    clock: () => "2026-07-18T06:00:00.000Z", flags: mockFlags
  });
  const isolatedTwo = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", idGenerator: () => "isolated-two",
    clock: () => "2026-07-18T06:00:00.000Z", flags: mockFlags
  });
  await isolatedOne.service.addCurrentUserFavorite(restaurant);
  expect((await isolatedTwo.service.getCurrentUserFavorite(restaurant)).status === "missing", "separate runtime instances have isolated stores");

  const initialRows = [
    row("actor-a", "id-b", "restaurant-b", 1, "2026-07-18T08:00:00.000Z"),
    row("actor-a", "id-a", "restaurant-a", 1, "2026-07-18T08:00:00.000Z"),
    row("actor-a", "id-c", "restaurant-c", 1, "2026-07-18T09:00:00.000Z"),
    row("actor-a", "id-null-new", "restaurant-null-new", null, "2026-07-18T10:00:00.000Z"),
    row("actor-a", "id-null-old", "restaurant-null-old", null, "2026-07-18T07:00:00.000Z"),
    { ...row("actor-a", "id-removed", "restaurant-removed", 0, "2026-07-18T11:00:00.000Z"), removedAt: "2026-07-18T12:00:00.000Z" },
    menuRow("actor-a", "menu-row", "menu-1", 0, "2026-07-18T12:00:00.000Z")
  ];
  const ordered = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", initialRows, flags: mockFlags
  });
  const restaurantList = await ordered.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 50 });
  expect(restaurantList.status === "available" && restaurantList.records.length === 5, "list returns active rows only");
  expect(restaurantList.status === "available" && restaurantList.records.at(-1).sortOrder === null, "sortOrder ascending places null last");
  expect(restaurantList.status === "available" && restaurantList.records[0].favoriteId === "id-c", "createdAt descending is the second ordering key");
  expect(restaurantList.status === "available" && restaurantList.records[1].favoriteId === "id-a" && restaurantList.records[2].favoriteId === "id-b", "id ascending is the final ordering key");
  const menuList = await ordered.service.listCurrentUserFavorites({ entityType: "menu_item" });
  expect(menuList.status === "available" && menuList.records.length === 1 && menuList.records[0].target.kind === "menu_item", "per-entity list never combines restaurant and menu-item rows");
  expect((await ordered.service.listCurrentUserFavorites({})).status === "read_failed", "entityType is required");
  expect((await ordered.service.listCurrentUserFavorites({ entityType: "all" })).status === "read_failed", "combined cross-entity list is unsupported");
  expect((await ordered.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 51 })).status === "read_failed", "page size above 50 fails closed");
  expect((await ordered.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 0 })).status === "read_failed", "page size below 1 fails closed");
  expect((await ordered.service.listCurrentUserFavorites({ entityType: "restaurant", cursor: "not-a-cursor" })).status === "read_failed", "invalid cursor fails closed");

  const paginationRows = Array.from({ length: 21 }, (_, index) =>
    row("actor-a", `page-${String(index).padStart(2, "0")}`, `restaurant-page-${index}`, index, "2026-07-18T00:00:00.000Z")
  );
  const pagination = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", initialRows: paginationRows, flags: mockFlags
  });
  const firstPage = await pagination.service.listCurrentUserFavorites({ entityType: "restaurant" });
  expect(firstPage.status === "available" && firstPage.records.length === 20 && firstPage.nextCursor, "default page size is 20 with a next cursor");
  const firstPageRepeat = await pagination.service.listCurrentUserFavorites({ entityType: "restaurant" });
  expect(firstPage.status === "available" && firstPageRepeat.status === "available" && firstPage.nextCursor === firstPageRepeat.nextCursor, "opaque cursor is deterministic");
  const secondPage = await pagination.service.listCurrentUserFavorites({ entityType: "restaurant", cursor: firstPage.nextCursor });
  expect(secondPage.status === "available" && secondPage.records.length === 1 && secondPage.nextCursor === null, "cursor resumes after the exact ordering tuple");
  const decoded = favorite.decodeConsumerFavoriteCursor(firstPage.nextCursor);
  expect(Array.isArray(decoded) && decoded.length === 3, "opaque cursor encodes exactly sortOrder-createdAt-id tuple");

  const sourceFiles = collectTsFiles(favoriteRoot).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const publicFiles = ["types.ts", "ports.ts"].map((file) => fs.readFileSync(path.join(favoriteRoot, file), "utf8")).join("\n");
  const serviceSource = fs.readFileSync(path.join(favoriteRoot, "consumerFavoriteService.ts"), "utf8");
  expect(!/\buserId\b|\buser_id\b/.test(publicFiles) && !/(?:get|list|add|remove)CurrentUserFavorite(?:s)?\s*\([^)]*(?:userId|user_id)/.test(serviceSource), "public Favorites API contains no ownership argument");
  expect(!/from\s+["'][^"']*supabase|createClient|\b(?:client|supabase)\.from\s*\(|\b(?:client|supabase)\.rpc\s*\(/i.test(sourceFiles), "Favorites source contains no Supabase import or client call");
  expect(!/fetch\s*\(|XMLHttpRequest|WebSocket/.test(sourceFiles), "Favorites source contains no network API");
  expect(!/service_role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(sourceFiles), "Favorites source contains no privileged credential path");
  expect(!/Date\.now|Math\.random/.test(sourceFiles), "mock implementation uses no nondeterministic clock or ID primitive");
  expect(!/consumer-ratings/.test(sourceFiles), "Favorites architecture does not couple to rating state");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2X-B Favorites Disabled/Mock Contract Smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false,
    phase2YStarted: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-B Favorites Disabled/Mock Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false,
    phase2YStarted: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function row(actorId, favoriteId, restaurantId, sortOrder, createdAt) {
  return {
    actorId,
    favoriteId,
    target: { kind: "restaurant", restaurantId },
    collectionLabel: null,
    sortOrder,
    createdAt,
    removedAt: null
  };
}

function menuRow(actorId, favoriteId, menuItemId, sortOrder, createdAt) {
  return {
    actorId,
    favoriteId,
    target: { kind: "menu_item", restaurantId: "restaurant-1", menuItemId },
    collectionLabel: null,
    sortOrder,
    createdAt,
    removedAt: null
  };
}

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}
