#!/usr/bin/env node
// SR-2E headless Development Mobile acceptance.
//
// Runs the REAL Mobile feature modules — the live Supabase adapter, the shared validator, the
// service, the mascot adapter and the card — against the deployed Development social-candidate-list
// Edge Function through a real authenticated session. No device, simulator or Expo runtime is
// involved, matching the established headless Development Mobile smoke precedent.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_CANDIDATE_SR2E_DEVELOPMENT_MOBILE_SMOKE=1.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_CANDIDATE_SR2E_DEVELOPMENT_MOBILE_SMOKE";
const MARKER = "5e2e0de5";
const P = `${MARKER}-0000-4000-8000-`;
const ACTOR = `${P}00000000000a`;
const CANDIDATES = Array.from({ length: 5 }, (_, index) => `${P}${String(201 + index).padStart(12, "0")}`);
const MASCOT_KEYS = ["PB", "VG", "TE", "MD", "ZZ-unknown"];

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
    suite: "social-candidate-sr2e-development-mobile-smoke",
    status: "skipped",
    reason: `set ${OPT_IN}=1 to run this Development-only acceptance`
  }, null, 2));
  process.exit(0);
}
const MANAGEMENT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!MANAGEMENT_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

// --- Development-only management channel -------------------------------------------------------
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

// --- real Mobile module loader ------------------------------------------------------------------
const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };
const reactNativeStub = new Proxy({ StyleSheet: { create: (s) => s }, Platform: { OS: "ios", select: (s) => s.ios } },
  { get: (t, k) => (k in t ? t[k] : String(k)) });
const stubCache = new Map([["react/jsx-runtime", jsxRuntime], ["react-native", reactNativeStub]]);
function externalStub(specifier) {
  if (stubCache.has(specifier)) return stubCache.get(specifier);
  try { return require_(specifier); } catch {
    const stub = new Proxy(function inert() {}, {
      get: (_t, k) => (k === "default" ? stub : (k === "__esModule" ? true : stub)),
      apply: () => undefined, construct: () => ({})
    });
    stubCache.set(specifier, stub);
    return stub;
  }
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
const feature = load(path.join(root, "apps/mobile/features/social-candidates/index.ts"));

const texts = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
  if (typeof node === "object" && node.props) texts(node.props.children, out);
  return out;
};

const profileRow = (id, label, mascot, bio) =>
  `('${id}'::uuid,'sr2e_${MARKER}_${label}','Display ${label}','Anon ${label}','${mascot}',${bio})`;

let fixturesCreated = false;
const { anon, serviceRole } = await apiKeys();
const password = `Sr2e-${crypto.randomUUID()}`;

try {
  // --- Development fixtures --------------------------------------------------------------------
  const created = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: ACTOR, email: `sr2e-actor-${MARKER}@example.com`, password, email_confirm: true })
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

  // --- real authenticated session --------------------------------------------------------------
  const tokenRes = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `sr2e-actor-${MARKER}@example.com`, password })
  });
  const tokenBody = await tokenRes.json();
  if (!tokenBody.access_token) throw new Error("Development sign-in failed");
  const accessToken = tokenBody.access_token;

  // A minimal stand-in for the SDK's Functions client that forwards the real session exactly as
  // supabase-js does. The Mobile adapter, validator, service and card under test are the real ones.
  const candidateClient = {
    functions: {
      invoke: async (functionName) => {
        const res = await fetch(`https://${DEV_REF}.supabase.co/functions/v1/${functionName}`, {
          method: "POST",
          headers: { apikey: anon, Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) {
          return { data: null, error: { name: "FunctionsHttpError", context: { json: () => res.json() } } };
        }
        return { data: await res.json(), error: null };
      }
    }
  };
  const authPort = {
    getCurrentSession: async () => ({ ok: true, value: { user: { id: ACTOR }, provider: "email", issuedAt: new Date().toISOString() } })
  };

  const service = feature.createSocialCandidateService(
    "supabase-live", true, { authPort, candidateClient }, { candidateSource: "supabase-live", issues: [] }
  );
  check("00 the live repository is the supabase-live adapter", service.source === "supabase-live", service.source);

  const outcome = await service.listSocialCandidates();
  check("01 an authenticated Development read succeeds", outcome.ok, outcome.ok ? null : outcome.error.code);
  if (!outcome.ok) throw new Error(`live read failed: ${outcome.error.code}`);

  const { policyVersion, candidates } = outcome.value;
  check("02 the envelope carries exactly policyVersion and candidates",
    JSON.stringify(Object.keys(outcome.value).sort()) === JSON.stringify(["candidates", "policyVersion"]));
  check("03 the policy version is social-candidate-api-v1", policyVersion === "social-candidate-api-v1");
  check("04 the live response passed the shared validator", Array.isArray(candidates));
  check("05 the candidate count is within the frozen Premium bound", candidates.length <= 10, candidates.length);
  check("06 every candidate carries exactly the five public fields",
    candidates.every((c) => JSON.stringify(Object.keys(c).sort())
      === JSON.stringify(["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"])));

  const serialized = JSON.stringify(outcome.value);
  const forbidden = [ACTOR, ...CANDIDATES, MARKER, "sr2e_", "Anon ",
    "userId", "user_id", "profileId", "profile_id", "exposureIndex", "exposure_ordinal",
    "rankingState", "score", "similarity", "truncated", "hasMore", "isPremium", "premium",
    "entitlement", "plan_code", "verification", "real_avatar_url", "diet_summary",
    "nutrition_goal_summary", "latitude", "longitude", "distance", "age_years", "gender"];
  const leaks = forbidden.filter((needle) => serialized.includes(needle));
  check("07 no forbidden identifier, ranking, entitlement or private value reaches the Mobile model", leaks.length === 0, leaks);

  check("08 every candidateRef is opaque and is not a raw identifier",
    candidates.every((c) => c.candidateRef.startsWith("scr1.") && !CANDIDATES.includes(c.candidateRef) && c.candidateRef !== ACTOR));
  check("09 candidateRefs are distinct within one response",
    new Set(candidates.map((c) => c.candidateRef)).size === candidates.length);

  const second = await service.listSocialCandidates();
  check("10 a repeated read preserves the same candidate order",
    second.ok && JSON.stringify(second.value.candidates.map((c) => c.displayName))
      === JSON.stringify(candidates.map((c) => c.displayName)));
  check("11 a refresh may return different references for the same candidates",
    second.ok && candidates.length > 0 && second.value.candidates[0].candidateRef !== candidates[0].candidateRef);

  // --- real mascot + card behaviour over live data ------------------------------------------------
  const known = candidates.filter((c) => feature.resolveSocialCandidateMascot(c.mascotAvatarKey).resolvedFromKey);
  const unknown = candidates.filter((c) => !feature.resolveSocialCandidateMascot(c.mascotAvatarKey).resolvedFromKey);
  check("12 a live known mascot assetKey resolves through the adapter", known.length > 0, { known: known.length, unknown: unknown.length });
  check("13 a live unknown mascot key falls back without removing the candidate",
    unknown.every((c) => feature.resolveSocialCandidateMascot(c.mascotAvatarKey).mascotId.length > 0));
  check("14 every live candidate renders through the real card",
    candidates.every((c) => texts(feature.SocialCandidateCard({ candidate: c })).join(" ").includes(c.displayName)));
  check("15 the rendered card never exposes the opaque reference",
    candidates.every((c) => !texts(feature.SocialCandidateCard({ candidate: c })).join(" ").includes("scr1.")));
  check("16 a live null public bio renders without invented filler",
    candidates.filter((c) => c.publicBio === null)
      .every((c) => !texts(feature.SocialCandidateCard({ candidate: c })).join(" ").includes("null")));
  check("17 candidates unwilling to chat are still present",
    candidates.some((c) => c.willingToChat === false) || candidates.length === 0,
    candidates.map((c) => c.willingToChat));

  console.log(JSON.stringify({
    suite: "social-candidate-sr2e-development-mobile-smoke",
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
delete from public.consumer_private_profiles where user_id::text like '${MARKER}-%';
delete from public.consumer_profiles where user_id::text like '${MARKER}-%';
delete from auth.users where id::text like '${MARKER}-%';
commit;`);
    const residue = await sql(`select count(*)::int as remaining from public.consumer_profiles where user_id::text like '${MARKER}-%'`);
    console.log(JSON.stringify({ phase: "cleanup", remaining: residue?.[0]?.remaining ?? null }));
  }
}
process.exit(failures.length === 0 ? 0 : 1);
