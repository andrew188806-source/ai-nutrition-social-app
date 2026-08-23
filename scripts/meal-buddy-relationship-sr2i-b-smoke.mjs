#!/usr/bin/env node
// Executes the production Mobile repository and controllers with deterministic local clients.
// No network, database, credentials or repository writes.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const cache = new Map();
function resolveFile(value) { return [value, `${value}.ts`, `${value}.tsx`, path.join(value, "index.ts")].find((file) => fs.existsSync(file)); }
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file
  }).outputText;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = (name) => name.startsWith(".") ? load(resolveFile(path.resolve(path.dirname(file), name))) : require_(name);
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}

const { SupabaseMealBuddyRelationshipRepository } = load(path.join(root, "apps/mobile/features/meal-buddy-relationships/repository.ts"));
const { MealBuddyRelationshipProfileController, MealBuddyRelationshipInboxController } = load(path.join(root, "apps/mobile/features/meal-buddy-relationships/controller.ts"));
const { ExecutorMealBuddyRelationshipRepository } = load(path.join(root, "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts"));
const { MealBuddyRelationshipService } = load(path.join(root, "supabase/functions/_shared/meal-buddy-relationship-api/service.ts"));
const { SocialRuntimeExecutorTransport } = load(path.join(root, "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts"));
const checks = []; const failures = [];
function check(name, condition) { checks.push(name); console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures.push(name); }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const item = (state, relationshipRef = "mbr1.relationship", displayName = "小食", mascotAvatarKey = "PB") => Object.freeze({
  relationshipRef,
  state,
  counterpart: Object.freeze({ displayName, mascotAvatarKey })
});
const success = (...relationships) => Object.freeze({ ok: true, value: Object.freeze({ relationships: Object.freeze(relationships) }) });
const failure = (errorCode = "server_unavailable") => Object.freeze({ ok: false, errorCode });
const authPort = {
  source: "supabase-live",
  async getCurrentSession() { return { ok: true, value: { accessToken: "local", refreshToken: "local", expiresAt: null, user: { userId: "actor-local", email: "local@example.invalid" } } }; }
};

const calls = [];
let nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [] }, error: null };
const client = { functions: { async invoke(name, options) { calls.push({ name, body: options.body }); return nextResponse; } } };
const repository = new SupabaseMealBuddyRelationshipRepository(authPort, client);

await repository.read("scr1.candidate");
check("01 read invokes the frozen endpoint with exact scr1 request", calls.at(-1).name === "meal-buddy-relationship" && JSON.stringify(calls.at(-1).body) === JSON.stringify({ operation: "read", candidateRef: "scr1.candidate" }));
await repository.send("scr1.candidate");
check("02 send invokes one exact candidate-target request", calls.at(-1).body.operation === "send" && Object.keys(calls.at(-1).body).sort().join(",") === "candidateRef,operation");
await repository.list();
check("03 list invokes no graph target or scope", JSON.stringify(calls.at(-1).body) === JSON.stringify({ operation: "list" }));
await repository.accept("mbr1.relationship");
check("04 accept invokes exact actor-bound relationship ref", JSON.stringify(calls.at(-1).body) === JSON.stringify({ operation: "accept", relationshipRef: "mbr1.relationship" }));
await repository.decline("mbr1.relationship"); await repository.cancel("mbr1.relationship");
check("05 decline and cancel use mbr1 without raw identity", calls.slice(-2).every((call) => call.body.relationshipRef === "mbr1.relationship" && !JSON.stringify(call.body).includes("userId")));
const callCount = calls.length;
check("06 mbc1 cannot be used as candidate identity", !(await repository.send("mbc1.card")).ok && calls.length === callCount);
check("07 wrong relationship prefix fails before transport", !(await repository.accept("scr1.candidate")).ok && calls.length === callCount);

nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ ...item("outgoing_pending", "mbr1.x"), targetUserId: "forbidden" }] }, error: null };
check("08 unexpected response fields fail closed", !(await repository.send("scr1.candidate")).ok);
nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [item("accepted", "mbr1.x")] }, error: null };
check("09 send renders a server-returned race state instead of local intent", (await repository.send("scr1.candidate")).value.relationships[0].state === "accepted");
nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [item("none", "mbr1.x")] }, error: null };
check("10 none is valid for decline/cancel but invalid in list", (await repository.cancel("mbr1.x")).ok && !(await repository.list()).ok);
nextResponse = { data: null, error: { context: { async json() { return { error: { code: "invalid_request", message: "opaque" } }; } } } };
check("11 frozen server error maps to safe closed code", (await repository.send("scr1.candidate")).errorCode === "invalid_request");
nextResponse = { data: null, error: { context: { async json() { return { error: { code: "database_detail", message: "secret" } }; } } } };
check("12 unknown raw server errors collapse safely", (await repository.send("scr1.candidate")).errorCode === "server_unavailable");

class ProfileRepository {
  source = "supabase-live";
  reads = []; sends = []; accepts = []; declines = []; cancels = [];
  readResults = [success()]; sendResults = [success(item("outgoing_pending"))];
  acceptResults = [success(item("accepted"))]; declineResults = [success(item("none"))]; cancelResults = [success(item("none"))];
  async read(ref) { this.reads.push(ref); return this.readResults.shift() ?? success(); }
  async send(ref) { this.sends.push(ref); return this.sendResults.shift() ?? success(item("outgoing_pending")); }
  async accept(ref) { this.accepts.push(ref); return this.acceptResults.shift() ?? success(item("accepted")); }
  async decline(ref) { this.declines.push(ref); return this.declineResults.shift() ?? success(item("none")); }
  async cancel(ref) { this.cancels.push(ref); return this.cancelResults.shift() ?? success(item("none")); }
  list() { return Promise.resolve(success()); }
}

const profileRepo = new ProfileRepository();
const profile = new MealBuddyRelationshipProfileController(profileRepo);
await profile.setContext("viewer-a", 1, "scr1.person");
check("13 canonical empty read becomes none with no fabricated mbr1", profile.getState().phase === "ready" && profile.getState().relationship.state === "none" && profile.getState().relationship.relationshipRef === "");
await profile.send();
check("14 none send becomes canonical outgoing pending", profileRepo.sends.length === 1 && profile.getState().relationship.state === "outgoing_pending");
await profile.cancel();
check("15 sender cancel uses returned mbr1 and resolves to canonical none", profileRepo.cancels[0] === "mbr1.relationship" && profile.getState().relationship.state === "none");
profileRepo.readResults.push(success(item("incoming_pending", "mbr1.incoming")));
await profile.load();
await profile.accept();
check("16 incoming accept uses mbr1 and becomes canonical accepted", profileRepo.accepts[0] === "mbr1.incoming" && profile.getState().relationship.state === "accepted");

profileRepo.readResults.push(success(item("incoming_pending", "mbr1.decline")));
await profile.load(); await profile.decline();
check("17 incoming decline resolves to canonical none", profileRepo.declines[0] === "mbr1.decline" && profile.getState().relationship.state === "none");

const reverseRepo = new ProfileRepository();
reverseRepo.sendResults = [success(item("incoming_pending", "mbr1.reverse"))];
const reverseProfile = new MealBuddyRelationshipProfileController(reverseRepo);
await reverseProfile.setContext("viewer-b", 1, "scr1.person-a"); await reverseProfile.send();
check("18 reverse send remains server-canonical incoming pending and never auto-accepts", reverseProfile.getState().relationship.state === "incoming_pending");

const duplicateRepo = new ProfileRepository();
const sendDeferred = deferred(); duplicateRepo.send = async (ref) => { duplicateRepo.sends.push(ref); return sendDeferred.promise; };
const duplicateProfile = new MealBuddyRelationshipProfileController(duplicateRepo);
await duplicateProfile.setContext("viewer-a", 1, "scr1.person");
const firstSend = duplicateProfile.send(); const secondSend = await duplicateProfile.send();
check("19 unresolved send disables duplicate action", duplicateRepo.sends.length === 1 && secondSend === false && duplicateProfile.getState().pendingAction === "send");
sendDeferred.resolve(success(item("outgoing_pending"))); await firstSend;

const failedRepo = new ProfileRepository();
failedRepo.sendResults = [failure("invalid_request")]; failedRepo.readResults = [success(), success()];
const failedProfile = new MealBuddyRelationshipProfileController(failedRepo);
await failedProfile.setContext("viewer-a", 1, "scr1.person"); await failedProfile.send();
check("20 failed send does not fabricate pending and reconciles read", failedProfile.getState().relationship.state === "none" && failedRepo.reads.length === 2);

const staleRepo = new ProfileRepository();
const staleRead = deferred(); staleRepo.read = async (ref) => { staleRepo.reads.push(ref); return staleRepo.reads.length === 1 ? staleRead.promise : success(item("accepted", "mbr1.viewer-b")); };
const staleProfile = new MealBuddyRelationshipProfileController(staleRepo);
const actorA = staleProfile.setContext("viewer-a", 1, "scr1.person-a"); await tick();
const actorB = staleProfile.setContext("viewer-b", 2, "scr1.person-b"); await actorB;
staleRead.resolve(success(item("outgoing_pending", "mbr1.viewer-a"))); await actorA;
check("21 late viewer A profile read cannot populate viewer B", staleProfile.getState().relationship.relationshipRef === "mbr1.viewer-b");

class InboxRepository extends ProfileRepository {
  lists = [];
  listResults = [success(item("incoming_pending", "mbr1.inbox-in"), item("outgoing_pending", "mbr1.inbox-out"), item("accepted", "mbr1.inbox-ok"))];
  async list() { this.lists.push(true); return this.listResults.shift() ?? success(); }
}
const inboxRepo = new InboxRepository();
const inbox = new MealBuddyRelationshipInboxController(inboxRepo);
await inbox.setActor("viewer-a", 1);
check("22 list exposes incoming outgoing and accepted actor-relative states", inbox.getState().relationships.map((entry) => entry.state).join(",") === "incoming_pending,outgoing_pending,accepted");
inboxRepo.listResults.push(success(item("outgoing_pending", "mbr1.inbox-out"), item("accepted", "mbr1.inbox-ok")));
await inbox.accept("mbr1.inbox-in");
check("23 inbox accepts incoming with its exact mbr1 then reloads list", inboxRepo.accepts[0] === "mbr1.inbox-in" && inboxRepo.lists.length === 2 && !inbox.getState().relationships.some((entry) => entry.relationshipRef === "mbr1.inbox-in"));
inboxRepo.listResults.push(success(item("accepted", "mbr1.inbox-ok")));
await inbox.cancel("mbr1.inbox-out");
check("24 inbox cancel removes resolved outgoing according to canonical list", inboxRepo.cancels[0] === "mbr1.inbox-out" && inbox.getState().relationships.length === 1);

const inboxFailureRepo = new InboxRepository();
inboxFailureRepo.listResults = [success(item("incoming_pending", "mbr1.fail")), success(item("incoming_pending", "mbr1.fail"))];
inboxFailureRepo.acceptResults = [failure("server_unavailable")];
const inboxFailure = new MealBuddyRelationshipInboxController(inboxFailureRepo);
await inboxFailure.setActor("viewer-a", 1); await inboxFailure.accept("mbr1.fail");
check("25 failed accept retains reloaded incoming state", inboxFailure.getState().relationships[0].state === "incoming_pending" && inboxFailure.getState().errorCode === "server_unavailable");

const inboxDuplicateRepo = new InboxRepository();
inboxDuplicateRepo.listResults = [success(item("incoming_pending", "mbr1.tap")), success(item("accepted", "mbr1.tap"))];
const acceptDeferred = deferred(); inboxDuplicateRepo.accept = async (ref) => { inboxDuplicateRepo.accepts.push(ref); return acceptDeferred.promise; };
const inboxDuplicate = new MealBuddyRelationshipInboxController(inboxDuplicateRepo);
await inboxDuplicate.setActor("viewer-a", 1);
const firstAccept = inboxDuplicate.accept("mbr1.tap"); const secondAccept = await inboxDuplicate.accept("mbr1.tap");
check("26 unresolved accept rejects repeated tap", inboxDuplicateRepo.accepts.length === 1 && secondAccept === false);
acceptDeferred.resolve(success(item("accepted", "mbr1.tap"))); await firstAccept;

const staleInboxRepo = new InboxRepository();
const listDeferred = deferred(); staleInboxRepo.list = async () => staleInboxRepo.lists.length++ === 0 ? listDeferred.promise : success(item("accepted", "mbr1.viewer-b"));
const staleInbox = new MealBuddyRelationshipInboxController(staleInboxRepo);
const inboxA = staleInbox.setActor("viewer-a", 1); await tick();
await staleInbox.setActor("viewer-b", 2);
listDeferred.resolve(success(item("incoming_pending", "mbr1.viewer-a"))); await inboxA;
check("27 late viewer A list cannot populate viewer B", staleInbox.getState().relationships[0].relationshipRef === "mbr1.viewer-b");
await staleInbox.setActor(null, 3);
check("28 sign-out clears canonical relationship UI", staleInbox.getState().phase === "signed_out");

const profileUi = fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx"), "utf8");
const inboxUi = fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx"), "utf8");
const realScreen = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
check("29 accepted relationship has no chat or message action", !/(chat|message|聊天|訊息)/i.test(profileUi + inboxUi));
check("30 real relationship flow never calls demo invite or chat stores", /isRealCandidateMode \? \(\s*<MealBuddyRelationshipInbox/.test(realScreen) && !profileUi.includes("createMealBuddy") && !inboxUi.includes("createMealBuddy"));
check("31 UI never renders raw canonical state names or opaque refs", !/<Text[^>]*>\s*(?:outgoing_pending|incoming_pending|accepted|\{relationship\.relationshipRef\})/i.test(profileUi + inboxUi));
check("32 no relationship state is persisted locally", !/(AsyncStorage|storage\.set|setItem)/.test(fs.readFileSync(path.join(root, "apps/mobile/features/meal-buddy-relationships/controller.ts"), "utf8")));

nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ relationshipRef: "mbr1.missing", state: "incoming_pending" }] }, error: null };
check("33 missing counterpart identity fails the closed Mobile contract", !(await repository.list()).ok);
nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ ...item("incoming_pending", "mbr1.private"), counterpart: { displayName: "小食", mascotAvatarKey: "PB", publicBio: "forbidden" } }] }, error: null };
check("34 extra counterpart profile field fails the closed Mobile contract", !(await repository.list()).ok);
nextResponse = { data: { policyVersion: "meal-buddy-relationship-v1", relationships: [{ ...item("incoming_pending", "mbr1.bad-avatar"), counterpart: { displayName: "小食", mascotAvatarKey: "" } }] }, error: null };
check("35 malformed counterpart identity fails the closed Mobile contract", !(await repository.list()).ok);

const namedInboxRepo = new InboxRepository();
namedInboxRepo.listResults = [success(
  item("incoming_pending", "mbr1.same-a", "同名飯友", "PB"),
  item("incoming_pending", "mbr1.same-b", "同名飯友", "VG")
)];
const namedInbox = new MealBuddyRelationshipInboxController(namedInboxRepo);
await namedInbox.setActor("viewer-named", 1);
await namedInbox.accept("mbr1.same-b");
check("36 duplicate display names cannot change lifecycle targeting", namedInboxRepo.accepts[0] === "mbr1.same-b");
namedInboxRepo.listResults.push(success(item("accepted", "mbr1.same-a", "更新後名稱", "TE")));
await namedInbox.load();
check("37 later list presentation uses current profile identity", namedInbox.getState().relationships[0].counterpart.displayName === "更新後名稱");
check("38 inbox visibly renders counterpart name and mascot without rendering mbr1", inboxUi.includes("relationship.counterpart.displayName") && inboxUi.includes("relationship.counterpart.mascotAvatarKey") && !/<Text[^>]*>\s*\{relationship\.relationshipRef\}/.test(inboxUi));

const backendActorA = "00000000-0000-4000-8000-0000000000aa";
const backendActorC = "00000000-0000-4000-8000-0000000000cc";
const counterpartIds = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const backendProfiles = new Map(counterpartIds.map((id, index) => [id, { display_name: `飯友 ${index + 1}`, mascot_avatar_key: ["PB", "VG", "TE", "MD"][index % 4] }]));
const projectionCalls = [];
const driver = {
  async withTransaction(operation) {
    return await operation({
      async queryObject(text, parameters) {
        if (text.includes("list_meal_buddy_relationships")) {
          if (parameters[0] !== backendActorA) return [];
          return counterpartIds.map((counterpart_user_id, index) => ({
            relation_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            counterpart_user_id,
            relative_state: index % 3 === 0 ? "incoming_pending" : index % 3 === 1 ? "outgoing_pending" : "accepted"
          }));
        }
        if (text.includes("project_exposed_social_profiles")) {
          const ids = parameters[1]; projectionCalls.push(Object.freeze([...ids]));
          return ids.flatMap((id, exposure_ordinal) => {
            const profile = backendProfiles.get(id);
            return profile ? [{ exposure_ordinal, ...profile }] : [];
          });
        }
        throw new Error("unexpected_statement");
      }
    });
  },
  async close() {}
};
const backendRepository = new ExecutorMealBuddyRelationshipRepository(new SocialRuntimeExecutorTransport(driver));
const backendRows = await backendRepository.list(backendActorA);
check("39 relationship profile composition batches beyond ten without exposure capping", backendRows.length === 11 && projectionCalls.length === 2 && projectionCalls[0].length === 10 && projectionCalls[1].length === 1);
check("40 repository composes only current name and mascot onto each actor-relative row", Object.keys(backendRows[0].counterpart).sort().join(",") === "displayName,mascotAvatarKey" && backendRows[0].counterpart.displayName === "飯友 1");
backendProfiles.set(counterpartIds[0], { display_name: "現在的名稱", mascot_avatar_key: "MD" });
check("41 repository reads current profile data without relationship snapshot", (await backendRepository.list(backendActorA))[0].counterpart.displayName === "現在的名稱");
const backendService = new MealBuddyRelationshipService(
  backendRepository,
  { async open() { throw new Error("candidate_not_used_for_list"); } },
  { async seal(_actor, relationId) { return `mbr1.opaque-${relationId.slice(-2)}`; }, async open() { throw new Error("relationship_not_used_for_list"); } }
);
const publicList = await backendService.execute(backendActorA, { operation: "list" }, new Date("2026-08-23T00:00:00.000Z"));
const publicBytes = JSON.stringify(publicList);
check("42 public list exposes minimal counterpart summary and no raw UUID", publicList.relationships.length === 11 && publicList.relationships.every((entry) => Object.keys(entry.counterpart).sort().join(",") === "displayName,mascotAvatarKey") && !counterpartIds.some((id) => publicBytes.includes(id)) && !publicBytes.includes("relation_id"));
check("43 arbitrary viewer C cannot query A relationship identities", (await backendService.execute(backendActorC, { operation: "list" }, new Date("2026-08-23T00:00:00.000Z"))).relationships.length === 0);
backendProfiles.delete(counterpartIds[0]);
check("44 missing current public profile fails closed instead of returning anonymous identity", await (async () => { try { await backendRepository.list(backendActorA); return false; } catch { return true; } })());

console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-b-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, repositoryBytesModified: false }, null, 2));
if (failures.length) process.exitCode = 1;
