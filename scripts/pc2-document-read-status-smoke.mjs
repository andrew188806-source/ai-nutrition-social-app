import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import { FIXTURE_BUNDLE } from "./pc2-consumer-onboarding-fixtures.mjs";
const cache = new Map();
const jsx = (type, props) => ({ type, props });
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const require = name => {
    if (name === "react-native") return { View: "View", Text: "Text", Pressable: "Pressable" };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name) + (name.endsWith("DocumentStatusNotice") ? ".tsx" : ".ts"));
    throw Error("Unexpected dependency");
  };
  vm.runInNewContext(source, { module, exports: module.exports, require, setTimeout, clearTimeout, URL, URLSearchParams }, { filename: file });
  return module.exports;
}
const { ConsumerOnboardingController, pc2RouteDestination } = load("apps/mobile/features/consumer-onboarding/controller.ts");
const { DocumentStatusNotice } = load("apps/mobile/features/consumer-onboarding/DocumentStatusNotice.tsx");
const { pc2Copy } = load("apps/mobile/features/consumer-onboarding/copy.ts");
const rows = [];
const check = (name, pass) => { assert.ok(pass, name); rows.push(name); console.log("PASS " + name); };
const wait = () => new Promise(r => setTimeout(r, 1));
const settled = async c => { for (let i = 0; i < 300 && c.getSnapshot().pending; i++) await wait(); assert.equal(c.getSnapshot().pending, false); };
function nodes(tree) { if (!tree || typeof tree !== "object") return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(tree) { if (typeof tree === "string") return tree; if (!tree || typeof tree !== "object") return ""; return [tree.props?.children].flat(Infinity).map(text).join(""); }
const notice = c => DocumentStatusNotice({ snapshot: c.getSnapshot(), retry: () => c.refresh(), disabled: c.getSnapshot().pending });
const base = { documentsAvailable: true, onboardingComplete: false, coreEligible: false, trainingGranted: false, preparationCompatibility: false, ageAttested: false, agePolicyVersion: "social-adult-self-attestation-v1", socialQualified: false, participation: "not_participating", socialEligible: false };
let actor = null, reply = { available: true, bundle: FIXTURE_BUNDLE }, state = { ...base }, fail = false, blocked = null, writes = [], reads = 0;
const client = { rpc: async (name, args) => {
  if (name === "get_consumer_required_documents") { reads++; if (blocked) await blocked; if (fail) return { error: { code: "PGRST202" }, data: null }; return { error: null, data: reply }; }
  if (name === "get_authenticated_consumer_participation_state") return { error: null, data: state };
  writes.push({ name, args }); state = { ...base, onboardingComplete: true, coreEligible: true, trainingGranted: true };
  return { error: null, data: state };
}};
const c = new ConsumerOnboardingController({ authPort: { getCurrentSession: async () => ({ ok: true, value: actor ? { user: { userId: actor } } : null }) }, client, redirect: "haocu://auth-callback", invalidateAccess() {}, timeoutMs: 30 });
check("initial snapshot shows loading rather than unopened", text(notice(c)) === pc2Copy.documentsLoading);
let release; blocked = new Promise(r => { release = r; }); c.bindScope(null, 0);
check("pending document read shows only loading", c.getSnapshot().documentStatus === "loading" && text(notice(c)) === pc2Copy.documentsLoading);
fail = true; blocked = null; release(); await settled(c);
check("missing RPC is a read failure, never unopened", c.getSnapshot().documentStatus === "error" && text(notice(c)).includes(pc2Copy.documentsReadFailed) && !text(notice(c)).includes(pc2Copy.unavailable));
const retry = nodes(notice(c)).find(n => n.type === "Pressable");
check("failed read exposes enabled retry control", retry && !retry.props.disabled);
fail = false; const before = reads; await retry.props.onPress();
check("retry performs a new RPC and restores current documents", reads === before + 1 && c.getSnapshot().documentStatus === "available" && c.getSnapshot().bundle && notice(c) === null);
reply = { available: false, bundle: null }; await c.refresh();
check("only explicit successful unavailable response shows unopened", c.getSnapshot().documentStatus === "unavailable" && text(notice(c)).includes(pc2Copy.unavailable));
check("unopened documents cannot submit explicit consent", !(await c.complete("synthetic", true, true, true)) && writes.length === 0);
reply = { available: true, bundle: { ...FIXTURE_BUNDLE, documents: [] } }; await c.refresh();
check("malformed document response is a failure, never unopened", c.getSnapshot().documentStatus === "error");
reply = { available: true, bundle: FIXTURE_BUNDLE }; actor = "new-synthetic"; c.bindScope(actor, 1); await settled(c);
check("new authenticated account remains gated without recorded consent", !c.getSnapshot().state.coreEligible && writes.length === 0 && pc2RouteDestination("restaurants", true, c.getSnapshot()) === "/onboarding");
check("missing required checkbox cannot create consent", !(await c.complete("synthetic", true, false, true)) && writes.length === 0);
await c.complete("synthetic", true, true, true);
check("explicit completion records exact presented versions and rereads server eligibility", writes.length === 1 && writes[0].args.p_presented_documents.length === 3 && c.getSnapshot().state.coreEligible && pc2RouteDestination("restaurants", true, c.getSnapshot()) === null);
c.bindScope(null, 2); await settled(c); c.bindScope(actor, 3); await settled(c);
check("relogin recognizes persisted canonical consent without another write", c.getSnapshot().state.coreEligible && writes.length === 1);
actor = "existing-unconsented"; state = { ...base }; c.bindScope(actor, 4); await settled(c);
check("existing unconsented account remains gated after login", !c.getSnapshot().state.coreEligible && writes.length === 1);
actor = null; c.bindScope(null, 5); await settled(c);
blocked = new Promise(r => { release = r; }); const timed = c.refresh(); await timed;
check("timeout shows read failure and keeps eligibility unknown", c.getSnapshot().documentStatus === "error" && c.getSnapshot().bundle === null && c.getSnapshot().uncertain);
blocked = null; release(); await wait(); await wait();
check("late timeout response cannot restore documents or eligibility", c.getSnapshot().documentStatus === "error" && c.getSnapshot().bundle === null);
await c.refresh();
check("timeout retry recovers documents", c.getSnapshot().documentStatus === "available");
blocked = new Promise(r => { release = r; }); const old = c.refresh(); actor = "next-account"; state = { ...base }; blocked = null; c.bindScope(actor, 6); await settled(c); release(); await old;
check("older document read cannot overwrite the new account snapshot", c.getSnapshot().documentStatus === "available" && !c.getSnapshot().state.coreEligible);
console.log(JSON.stringify({ suite: "pc2-document-read-status", total: rows.length, failed: 0, networkUsed: false, fixtures: "synthetic RPC and shallow notice rendering; no live account or DB writes" }));
