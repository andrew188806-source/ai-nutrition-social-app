#!/usr/bin/env node
// SR-2F headless Development composition acceptance.
//
// Unlike the SR-2E Development smoke, nothing about the transport is hand-built here: the REAL
// createConsumerRuntimeComposition runs, the REAL SupabaseConsumerClientFactory builds a REAL
// @supabase/supabase-js client, the REAL SupabaseConsumerAuthAdapter performs a REAL Development
// sign-in, and the Social candidate list is then read through exactly the dependencies SR-2F bound.
// No Authorization header, actor identifier or second client is constructed anywhere.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_CANDIDATE_SR2F_DEVELOPMENT_COMPOSITION_SMOKE=1.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
// Mobile dependencies — @supabase/supabase-js above all — are installed under apps/mobile, so
// external specifiers must resolve exactly where the Mobile app itself resolves them. Falling back
// to the repository root would silently stub the very SDK this acceptance exists to exercise.
const requireMobile = createRequire(path.join(root, "apps/mobile/package.json"));

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_CANDIDATE_SR2F_DEVELOPMENT_COMPOSITION_SMOKE";
const SUITE = "social-candidate-sr2f-development-composition-smoke";
const MARKER = "5f2f0de5";
const P = `${MARKER}-0000-4000-8000-`;
const ACTOR = `${P}00000000000a`;
const CANDIDATES = Array.from({ length: 5 }, (_, index) => `${P}${String(301 + index).padStart(12, "0")}`);
const MASCOT_KEYS = ["PB", "VG", "TE", "MD", "ZZ-unknown"];

const COMPOSITION = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";
const BINDING = "apps/mobile/features/social-candidates/runtimeBinding.ts";
const FACTORIES = "apps/mobile/features/social-candidates/factories.ts";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(condition ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: `set ${OPT_IN}=1 to run this Development-only acceptance`
  }, null, 2));
  process.exit(0);
}
const MANAGEMENT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!MANAGEMENT_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function apiKeys() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}` }
  });
  const keys = await res.json();
  const pick = (name) => keys.find((entry) => entry.name === name)?.api_key;
  return { anon: pick("anon"), serviceRole: pick("service_role") };
}

// --- real module graph, real Supabase SDK -------------------------------------------------------
const asyncStorageApi = (() => {
  const store = new Map();
  return {
    getAllKeys: async () => [...store.keys()],
    multiGet: async (keys) => keys.map((key) => [key, store.get(key) ?? null]),
    multiSet: async (pairs) => { for (const [key, value] of pairs) store.set(key, value); },
    multiRemove: async (keys) => { for (const key of keys) store.delete(key); },
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async (key) => { store.delete(key); },
    clear: async () => { store.clear(); }
  };
})();
const stubCache = new Map([
  ["react/jsx-runtime", { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" }],
  ["react-native", new Proxy({
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: "ios", select: (spec) => spec.ios },
    AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) }
  }, { get: (target, key) => (key in target ? target[key] : String(key)) })],
  ["react-native-url-polyfill/auto", {}],
  ["@react-native-async-storage/async-storage", { __esModule: true, default: asyncStorageApi, ...asyncStorageApi }]
]);
const stubbedSpecifiers = [];
function externalStub(specifier) {
  if (stubCache.has(specifier)) return stubCache.get(specifier);
  // @supabase/supabase-js resolves here to the REAL installed SDK: the transport under test.
  for (const resolver of [requireMobile, require_]) {
    try { return resolver(specifier); } catch { /* try the next resolver */ }
  }
  stubbedSpecifiers.push(specifier);
  const stub = new Proxy(function inert() {}, {
    get: (_t, key) => (key === "default" ? stub : (key === "__esModule" ? true : stub)),
    apply: () => undefined, construct: () => ({})
  });
  stubCache.set(specifier, stub);
  return stub;
}
const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, allowJs: true },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (specifier === "@haocu/shared") return load(path.join(root, "packages/shared/src/index.ts"));
    if (!specifier.startsWith(".")) return externalStub(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const fromRoot = (relative) => load(path.join(root, relative));

const profileRow = (id, label, mascot, bio) =>
  `('${id}'::uuid,'sr2f_${MARKER}_${label}','Display ${label}','Anon ${label}','${mascot}',${bio})`;

let fixturesCreated = false;
const { anon, serviceRole } = await apiKeys();
const email = `sr2f-actor-${MARKER}@example.com`;
const password = `Sr2f-${crypto.randomUUID()}`;

try {
  // --- Development fixtures ----------------------------------------------------------------------
  const created = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: ACTOR, email, password, email_confirm: true })
  });
  if (!created.ok) throw new Error(`actor create failed: ${created.status}`);
  fixturesCreated = true;

  await sql(`
begin;
insert into auth.users (id) values ${CANDIDATES.map((id) => `('${id}'::uuid)`).join(",")};
insert into public.consumer_profiles (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, public_bio)
values
 ${profileRow(ACTOR, "actor", "PB", "'actor bio'")},
 ${CANDIDATES.map((id, index) => profileRow(id, `c${index}`, MASCOT_KEYS[index], index === 0 ? "null" : `'bio ${index}'`)).join(",\n ")};
update public.consumer_profiles set willing_to_chat = true
 where user_id::text like '${MARKER}-%' and right(user_id::text, 1) in ('1','3','5');
insert into public.social_participation (user_id, state, opted_in_at) values
 ('${ACTOR}'::uuid,'opted_in', timestamptz '2026-01-01T00:00:00Z'),
 ${CANDIDATES.map((id) => `('${id}'::uuid,'opted_in', timestamptz '2026-01-02T00:00:00Z')`).join(",\n ")};
commit;`);

  // --- the real composition, against the real Development project --------------------------------
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE = "supabase-live";
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE = "supabase-live";
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED = "true";
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED = "false";
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL = `https://${DEV_REF}.supabase.co`;
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY = anon;
  process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE = "supabase-live";

  const composition = fromRoot(COMPOSITION);
  const binding = fromRoot(BINDING);
  const factories = fromRoot(FACTORIES);

  check("00 nothing is bound before the composition runs",
    Object.keys(binding.getSocialCandidateRuntimeDependencies() ?? {}).length === 0);

  const result = composition.createConsumerRuntimeComposition();
  check("01 the real live composition succeeds against Development", result.ok === true, result.errorCode);
  if (!result.ok) throw new Error(`composition failed: ${result.errorCode}`);

  const bound = binding.getSocialCandidateRuntimeDependencies();
  check("02 the composition bound exactly authPort and candidateClient",
    JSON.stringify(Object.keys(bound ?? {}).sort()) === JSON.stringify(["authPort", "candidateClient"]),
    Object.keys(bound ?? {}));
  check("03 the bound authPort is the identical instance the runtime controller uses",
    bound.authPort === result.value.controller.options.authPort);
  check("04 the bound authPort wraps the bound client's own auth surface",
    bound.authPort.authClient === bound.candidateClient.auth);
  check("05 the bound client is a real Supabase SDK client, not a hand-built transport",
    typeof bound.candidateClient.functions?.invoke === "function" && typeof bound.candidateClient.auth?.getSession === "function");
  check("05b the real Supabase SDK was loaded rather than stubbed",
    !stubbedSpecifiers.includes("@supabase/supabase-js"), { stubbedSpecifiers });

  // --- a real Development sign-in through the composed runtime ------------------------------------
  const service = factories.createSocialCandidateService("supabase-live", true, bound);
  check("06 the composed dependencies yield the supabase-live repository", service.source === "supabase-live", service.source);

  const beforeSignIn = await service.listSocialCandidates();
  check("07 an unauthenticated read fails closed before sign-in",
    !beforeSignIn.ok && beforeSignIn.error.code === "authentication_required",
    beforeSignIn.ok ? "unexpectedly succeeded" : beforeSignIn.error.code);

  const signedIn = await result.value.controller.signIn(email, password);
  check("08 a real Development sign-in succeeds through the composed runtime", signedIn === true);

  const outcome = await service.listSocialCandidates();
  check("09 the same bound dependencies now read Development successfully",
    outcome.ok, outcome.ok ? null : outcome.error.code);
  if (!outcome.ok) throw new Error(`live read failed: ${outcome.error.code}`);

  const { policyVersion, candidates } = outcome.value;
  check("10 the envelope carries exactly policyVersion and candidates",
    JSON.stringify(Object.keys(outcome.value).sort()) === JSON.stringify(["candidates", "policyVersion"]));
  check("11 the policy version is social-candidate-api-v1", policyVersion === "social-candidate-api-v1");
  check("12 the candidate count is within the frozen bound", candidates.length <= 10, candidates.length);
  check("13 every candidate carries exactly the five public fields",
    candidates.every((entry) => JSON.stringify(Object.keys(entry).sort())
      === JSON.stringify(["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"])));

  const serialized = JSON.stringify(outcome.value);
  const forbidden = [ACTOR, ...CANDIDATES, MARKER, "sr2f_", "Anon ",
    "userId", "user_id", "profileId", "profile_id", "exposureIndex", "exposure_ordinal",
    "rankingState", "score", "similarity", "truncated", "hasMore", "isPremium", "premium",
    "entitlement", "plan_code", "verification", "real_avatar_url", "diet_summary",
    "nutrition_goal_summary", "latitude", "longitude", "distance", "age_years", "gender"];
  const leaks = forbidden.filter((needle) => serialized.includes(needle));
  check("14 no forbidden identifier, ranking or private value reaches the composed Mobile model",
    leaks.length === 0, leaks);
  check("15 every candidateRef is opaque and is not a raw identifier",
    candidates.every((entry) => entry.candidateRef.startsWith("scr1.")
      && !CANDIDATES.includes(entry.candidateRef) && entry.candidateRef !== ACTOR));

  // --- the binding carries capability, never a session --------------------------------------------
  await result.value.controller.signOut();
  const afterSignOut = await service.listSocialCandidates();
  check("16 after sign-out the very same bound dependencies fail closed again",
    !afterSignOut.ok && afterSignOut.error.code === "authentication_required",
    afterSignOut.ok ? "unexpectedly succeeded" : afterSignOut.error.code);
  check("17 the binding itself was never re-bound or cleared across the session lifecycle",
    binding.getSocialCandidateRuntimeDependencies().authPort === bound.authPort
    && binding.getSocialCandidateRuntimeDependencies().candidateClient === bound.candidateClient);

  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length === 0 ? "passed" : "failed",
    projectRef: DEV_REF,
    liveCandidateCount: candidates.length,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    productionTouched: false
  }, null, 2));
} finally {
  if (fixturesCreated) {
    await sql(`
begin;
delete from public.social_participation where user_id::text like '${MARKER}-%';
delete from public.consumer_profiles where user_id::text like '${MARKER}-%';
delete from auth.users where id::text like '${MARKER}-%';
commit;`).catch(() => undefined);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
