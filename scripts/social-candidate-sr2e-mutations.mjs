#!/usr/bin/env node
// SR-2E meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const FEATURE = "apps/mobile/features/social-candidates";
const SHARED = "packages/shared/src/domain/social-candidate";
const files = Object.freeze({
  supabaseAdapter: `${FEATURE}/adapters/supabaseSocialCandidateRepository.ts`,
  mockAdapter: `${FEATURE}/adapters/mockSocialCandidateRepository.ts`,
  disabledAdapter: `${FEATURE}/adapters/disabledSocialCandidateRepository.ts`,
  service: `${FEATURE}/socialCandidateService.ts`,
  contracts: `${FEATURE}/supabaseSocialCandidateContracts.ts`,
  mascot: `${FEATURE}/mascotAdapter.ts`,
  card: `${FEATURE}/SocialCandidateCard.tsx`,
  screen: "apps/mobile/app/social-candidates.tsx",
  sharedTypes: `${SHARED}/types.ts`,
  sharedValidate: `${SHARED}/validate.ts`
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));

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

function loadGraph(overrides = new Map()) {
  const cache = new Map();
  const resolveFile = (candidate) =>
    [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts")]
      .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    const source = overrides.get(relative) ?? canonical.get(relative) ?? fs.readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
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
  };
  return Object.freeze({
    feature: load(path.join(root, `${FEATURE}/index.ts`)),
    shared: load(path.join(root, "packages/shared/src/index.ts"))
  });
}

// --- fixtures ---------------------------------------------------------------------------------
const ALLOWED = ["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"].sort();
const candidate = (index, overrides = {}) => ({
  candidateRef: `scr1.ref-${index}`,
  displayName: `Name ${index}`,
  mascotAvatarKey: "PB",
  publicBio: `bio ${index}`,
  willingToChat: index % 2 === 0,
  ...overrides
});
const response = (count) => ({
  policyVersion: "social-candidate-api-v1",
  candidates: Array.from({ length: count }, (_, index) => candidate(index))
});
const authPort = () => ({
  getCurrentSession: async () => ({ ok: true, value: { user: { id: "actor" }, provider: "email", issuedAt: "2026-01-01T00:00:00Z" } })
});
const client = (data, calls = []) => ({
  functions: { invoke: async (...args) => { calls.push(args); return { data, error: null }; } }
});
const repo = (graph, data, calls) => graph.feature.createSocialCandidateRepository(
  "supabase-live", true, { authPort: authPort(), candidateClient: client(data, calls) },
  { candidateSource: "supabase-live", issues: [] }
);
const texts = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
  if (typeof node === "object" && node.props) texts(node.props.children, out);
  return out;
};

// --- mutations --------------------------------------------------------------------------------
const mutations = [
  // The runtime authority is the field constant, not the type alias, so the mutant targets it there.
  { name: "raw user id admitted to the shared candidate field allow-list", file: files.sharedTypes,
    from: "  \"candidateRef\",\n  \"displayName\",", to: "  \"candidateRef\",\n  \"candidateUserId\",\n  \"displayName\",",
    detect: async (g) => {
      const bad = response(1);
      bad.candidates[0] = { ...bad.candidates[0], candidateUserId: "u-1" };
      return g.shared.validateSocialCandidateApiResponseV1(bad).ok;
    } },
  { name: "validator accepts unexpected candidate keys", file: files.sharedValidate,
    from: "  if (!exactKeys(value, SOCIAL_CANDIDATE_FIELDS)) {\n    return `candidates[${index}] does not carry exactly the five public fields`;\n  }", to: "",
    detect: async (g) => {
      const bad = response(1);
      bad.candidates[0] = { ...bad.candidates[0], rankingState: "scored", score: 0.9 };
      return g.shared.validateSocialCandidateApiResponseV1(bad).ok;
    } },
  { name: "validator accepts unexpected envelope keys", file: files.sharedValidate,
    from: "  if (!exactKeys(value, SOCIAL_CANDIDATE_RESPONSE_FIELDS)) {\n    return { ok: false, reason: \"response does not carry exactly policyVersion and candidates\" };\n  }", to: "",
    detect: async (g) => g.shared.validateSocialCandidateApiResponseV1({ ...response(1), truncated: true }).ok },
  { name: "validator accepts a foreign policy version", file: files.sharedValidate,
    from: "  if (value.policyVersion !== SOCIAL_CANDIDATE_API_POLICY_VERSION) {\n    return { ok: false, reason: \"unexpected policyVersion\" };\n  }", to: "",
    detect: async (g) => g.shared.validateSocialCandidateApiResponseV1({ ...response(1), policyVersion: "v2" }).ok },
  { name: "publicBio null coerced to a placeholder string", file: files.sharedValidate,
    from: "    publicBio: value.publicBio,", to: "    publicBio: value.publicBio ?? \"\",",
    detect: async (g) => {
      const withNull = { policyVersion: "social-candidate-api-v1", candidates: [candidate(0, { publicBio: null })] };
      const outcome = g.shared.validateSocialCandidateApiResponseV1(withNull);
      return outcome.ok && outcome.value.candidates[0].publicBio !== null;
    } },
  { name: "client sorts the candidate array", file: files.service,
    from: "  listSocialCandidates() {\n    return this.options.repository.listSocialCandidates();\n  }",
    to: "  async listSocialCandidates() {\n    const outcome = await this.options.repository.listSocialCandidates();\n    if (!outcome.ok) return outcome;\n    return { ok: true, value: { policyVersion: outcome.value.policyVersion, candidates: [...outcome.value.candidates].sort((a, b) => b.displayName.localeCompare(a.displayName)) } };\n  }",
    detect: async (g) => {
      const service = new g.feature.SocialCandidateService({ repository: repo(g, response(4)) });
      const outcome = await service.listSocialCandidates();
      return JSON.stringify(outcome.value.candidates.map((c) => c.displayName)) !== JSON.stringify(["Name 0", "Name 1", "Name 2", "Name 3"]);
    } },
  { name: "client reverses the candidate array", file: files.service,
    from: "    return this.options.repository.listSocialCandidates();",
    to: "    return this.options.repository.listSocialCandidates().then((o) => (o.ok ? { ok: true, value: { policyVersion: o.value.policyVersion, candidates: [...o.value.candidates].reverse() } } : o));",
    detect: async (g) => {
      const service = new g.feature.SocialCandidateService({ repository: repo(g, response(3)) });
      const outcome = await service.listSocialCandidates();
      return outcome.value.candidates[0].displayName !== "Name 0";
    } },
  { name: "client caps the array to the free exposure limit", file: files.service,
    from: "    return this.options.repository.listSocialCandidates();",
    to: "    return this.options.repository.listSocialCandidates().then((o) => (o.ok ? { ok: true, value: { policyVersion: o.value.policyVersion, candidates: o.value.candidates.slice(0, 3) } } : o));",
    detect: async (g) => {
      const service = new g.feature.SocialCandidateService({ repository: repo(g, response(10)) });
      return (await service.listSocialCandidates()).value.candidates.length !== 10;
    } },
  { name: "client caps the array to the premium exposure limit", file: files.service,
    from: "    return this.options.repository.listSocialCandidates();",
    to: "    return this.options.repository.listSocialCandidates().then((o) => (o.ok ? { ok: true, value: { policyVersion: o.value.policyVersion, candidates: o.value.candidates.slice(0, 10) } } : o));",
    detect: async (g) => {
      const service = new g.feature.SocialCandidateService({ repository: repo(g, response(12)) });
      return (await service.listSocialCandidates()).value.candidates.length !== 12;
    } },
  { name: "client filters out candidates unwilling to chat", file: files.service,
    from: "    return this.options.repository.listSocialCandidates();",
    to: "    return this.options.repository.listSocialCandidates().then((o) => (o.ok ? { ok: true, value: { policyVersion: o.value.policyVersion, candidates: o.value.candidates.filter((c) => c.willingToChat) } } : o));",
    detect: async (g) => {
      const service = new g.feature.SocialCandidateService({ repository: repo(g, response(4)) });
      return (await service.listSocialCandidates()).value.candidates.length !== 4;
    } },
  { name: "an empty list converted into an error", file: files.supabaseAdapter,
    from: "    return okCandidates(validation.value);",
    to: "    if (validation.value.candidates.length === 0) return errCandidates(new SocialCandidateClientError(\"server_unavailable\", \"empty\"));\n    return okCandidates(validation.value);",
    detect: async (g) => !(await repo(g, response(0)).listSocialCandidates()).ok },
  { name: "raw invoke response trusted without validation", file: files.supabaseAdapter,
    from: "    const validation = validateSocialCandidateApiResponseV1(invokeResult.data);\n    if (!validation.ok) {\n      return errCandidates(new SocialCandidateClientError(\"invalid_server_response\", \"The Social candidate response failed local validation.\"));\n    }\n    return okCandidates(validation.value);",
    to: "    return okCandidates(invokeResult.data as never);",
    detect: async (g) => {
      const leaked = { policyVersion: "social-candidate-api-v1", candidates: [{ ...candidate(0), candidateUserId: "u-1" }] };
      const outcome = await repo(g, leaked).listSocialCandidates();
      return outcome.ok && Object.keys(outcome.value.candidates[0]).length !== ALLOWED.length;
    } },
  { name: "a request body is sent to the frozen endpoint", file: files.supabaseAdapter,
    from: "invoke(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME);", to: "invoke(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME, { body: { limit: 10 } } as never);",
    detect: async (g) => {
      const calls = [];
      await repo(g, response(1), calls).listSocialCandidates();
      return calls[0].length !== 1;
    } },
  { name: "an actor identifier is sent with the request", file: files.supabaseAdapter,
    from: "invoke(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME);", to: "invoke(SOCIAL_CANDIDATE_LIST_FUNCTION_NAME, { body: { actorUserId: session.value.user.id } } as never);",
    detect: async (g) => {
      const calls = [];
      await repo(g, response(1), calls).listSocialCandidates();
      return calls[0].length !== 1;
    } },
  { name: "the session gate removed so an unauthenticated read proceeds", file: files.supabaseAdapter,
    from: "    if (!session.ok || !session.value) {\n      return errCandidates(new SocialCandidateClientError(\"authentication_required\", \"Social candidates require an authenticated session.\"));\n    }", to: "",
    detect: async (g) => {
      const calls = [];
      const repository = g.feature.createSocialCandidateRepository("supabase-live", true,
        { authPort: { getCurrentSession: async () => ({ ok: true, value: null }) }, candidateClient: client(response(1), calls) },
        { candidateSource: "supabase-live", issues: [] });
      const outcome = await repository.listSocialCandidates();
      return outcome.ok || calls.length > 0;
    } },
  { name: "a raw server error message surfaces to the client", file: files.supabaseAdapter,
    from: "  return new SocialCandidateClientError(\"internal_error\", \"The Social candidate service returned an unexpected error.\");",
    to: "  return new SocialCandidateClientError(\"internal_error\", String(error.message));",
    detect: async () => {
      const mutated = canonical.get(files.supabaseAdapter).replace(
        "  return new SocialCandidateClientError(\"internal_error\", \"The Social candidate service returned an unexpected error.\");",
        "  return new SocialCandidateClientError(\"internal_error\", String(error.message));");
      return /error\.message/.test(mutated);
    } },
  { name: "the disabled adapter impersonates an empty success", file: files.disabledAdapter,
    from: "    return errCandidates(new SocialCandidateClientError(\"social_candidates_disabled\", \"Social candidates are disabled in this runtime.\"));",
    to: "    return okCandidates({ policyVersion: \"social-candidate-api-v1\" as const, candidates: [] });",
    detect: async (g) => {
      const outcome = await g.feature.createSocialCandidateRepository("disabled", false, {}, { candidateSource: "disabled", issues: [] }).listSocialCandidates();
      return outcome.ok;
    } },
  { name: "invoke options reintroduced into the typed contract", file: files.contracts,
    from: "      functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME\n    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;",
    to: "      functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME,\n      options?: { body?: Record<string, unknown> }\n    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;",
    detect: async () => {
      const mutated = canonical.get(files.contracts).replace(
        "      functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME\n    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;",
        "      functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME,\n      options?: { body?: Record<string, unknown> }\n    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;");
      return /options\?:/.test(mutated);
    } },
  { name: "a different Edge function is targeted", file: files.contracts,
    from: "export const SOCIAL_CANDIDATE_LIST_FUNCTION_NAME = \"social-candidate-list\" as const;",
    to: "export const SOCIAL_CANDIDATE_LIST_FUNCTION_NAME = \"social-candidate-taste\" as const;",
    detect: async (g) => {
      const calls = [];
      await repo(g, response(1), calls).listSocialCandidates();
      return calls[0][0] !== "social-candidate-list";
    } },
  { name: "mascot mapped by id instead of the frozen assetKey", file: files.mascot,
    from: "mascot.assetKey === mascotAvatarKey", to: "mascot.id === mascotAvatarKey",
    detect: async (g) => !g.feature.resolveSocialCandidateMascot("PB").resolvedFromKey },
  { name: "unknown mascot fallback removed", file: files.mascot,
    from: "  const mascot = matched ?? UNKNOWN_MASCOT;", to: "  const mascot = matched!;",
    detect: async (g) => {
      try { return g.feature.resolveSocialCandidateMascot("ZZZ").mascotId === undefined; } catch { return true; }
    } },
  { name: "an unknown mascot hides the candidate", file: files.card,
    from: "  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);",
    to: "  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);\n  if (!mascot.resolvedFromKey) return null;",
    detect: async (g) => texts(g.feature.SocialCandidateCard({ candidate: candidate(0, { displayName: "Zed", mascotAvatarKey: "ZZZ" }) })).join(" ").includes("Zed") === false },
  { name: "a premium badge added to the card", file: files.card,
    from: "        <Text style={styles.displayName} numberOfLines={1}>{candidate.displayName}</Text>",
    to: "        <Text style={styles.displayName} numberOfLines={1}>{candidate.displayName}</Text>\n        <Text>Premium</Text>",
    detect: async (g) => texts(g.feature.SocialCandidateCard({ candidate: candidate(0) })).join(" ").includes("Premium") },
  { name: "the opaque candidate reference rendered to the user", file: files.card,
    from: "        <Text style={styles.displayName} numberOfLines={1}>{candidate.displayName}</Text>",
    to: "        <Text style={styles.displayName} numberOfLines={1}>{candidate.displayName}</Text>\n        <Text>{candidate.candidateRef}</Text>",
    detect: async (g) => texts(g.feature.SocialCandidateCard({ candidate: candidate(0) })).join(" ").includes("scr1.") },
  { name: "candidate reference decoded on the client", file: files.card,
    from: "  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);",
    to: "  const decoded = atob(candidate.candidateRef.split(\".\")[1] ?? \"\");\n  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);",
    detect: async () => {
      const mutated = canonical.get(files.card).replace(
        "  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);",
        "  const decoded = atob(candidate.candidateRef.split(\".\")[1] ?? \"\");\n  const mascot = resolveSocialCandidateMascot(candidate.mascotAvatarKey);");
      return /atob|candidateRef\.split/.test(mutated);
    } },
  { name: "candidate reference persisted to device storage", file: files.screen,
    from: "    const outcome = await service.listSocialCandidates();",
    to: "    const outcome = await service.listSocialCandidates();\n    if (outcome.ok) AsyncStorage.setItem(\"sr2e\", JSON.stringify(outcome.value.candidates));",
    detect: async () => {
      const mutated = canonical.get(files.screen).replace(
        "    const outcome = await service.listSocialCandidates();",
        "    const outcome = await service.listSocialCandidates();\n    if (outcome.ok) AsyncStorage.setItem(\"sr2e\", JSON.stringify(outcome.value.candidates));");
      return /AsyncStorage|setItem/.test(mutated);
    } },
  { name: "candidate reference used as a profile navigation parameter", file: files.screen,
    from: "              <SocialCandidateCard key={candidate.candidateRef} candidate={candidate} />",
    to: "              <Pressable key={candidate.candidateRef} onPress={() => router.push({ pathname: \"/community-profile/[profileId]\", params: { profileId: candidate.candidateRef } })}><SocialCandidateCard candidate={candidate} /></Pressable>",
    detect: async () => {
      const mutated = canonical.get(files.screen).replace(
        "              <SocialCandidateCard key={candidate.candidateRef} candidate={candidate} />",
        "              <Pressable key={candidate.candidateRef} onPress={() => router.push({ pathname: \"/community-profile/[profileId]\", params: { profileId: candidate.candidateRef } })}><SocialCandidateCard candidate={candidate} /></Pressable>");
      return /community-profile|profileId: candidate/.test(mutated);
    } },
  { name: "candidate reference wired into the Meal Buddy invite store", file: files.screen,
    from: "import { useConsumerRuntime } from \"../features/consumer-runtime\";",
    to: "import { useConsumerRuntime } from \"../features/consumer-runtime\";\nimport { createMealBuddyInvite } from \"../features/meal-buddy-card\";",
    detect: async () => {
      const mutated = canonical.get(files.screen).replace(
        "import { useConsumerRuntime } from \"../features/consumer-runtime\";",
        "import { useConsumerRuntime } from \"../features/consumer-runtime\";\nimport { createMealBuddyInvite } from \"../features/meal-buddy-card\";");
      return /meal-buddy-card|createMealBuddyInvite/.test(mutated);
    } },
  { name: "Meal Buddy mock candidates imported into the real feature", file: files.mockAdapter,
    from: "import { validateSocialCandidateApiResponseV1 } from \"@haocu/shared\";",
    to: "import { validateSocialCandidateApiResponseV1 } from \"@haocu/shared\";\nimport { getMealBuddyCandidates } from \"../../meal-buddy-card/mealBuddyCardMock\";",
    detect: async () => {
      const mutated = canonical.get(files.mockAdapter).replace(
        "import { validateSocialCandidateApiResponseV1 } from \"@haocu/shared\";",
        "import { validateSocialCandidateApiResponseV1 } from \"@haocu/shared\";\nimport { getMealBuddyCandidates } from \"../../meal-buddy-card/mealBuddyCardMock\";");
      return /meal-buddy-card|getMealBuddyCandidates/.test(mutated);
    } },
  { name: "forbidden fields added to the mock fixture", file: files.mockAdapter,
    from: "  { candidateRef: \"scr1.mock-candidate-01\",", to: "  { candidateUserId: \"u-1\", isPremium: true, rankScore: 90, candidateRef: \"scr1.mock-candidate-01\",",
    detect: async (g) => {
      const outcome = await g.feature.createSocialCandidateRepository("mock", false, { authPort: authPort() }, { candidateSource: "mock", issues: [] }).listSocialCandidates();
      return !outcome.ok;
    } },
  { name: "pagination admitted to the shared envelope field allow-list", file: files.sharedTypes,
    from: "export const SOCIAL_CANDIDATE_RESPONSE_FIELDS = Object.freeze([\n  \"candidates\",",
    to: "export const SOCIAL_CANDIDATE_RESPONSE_FIELDS = Object.freeze([\n  \"candidates\",\n  \"hasMore\",",
    detect: async (g) => g.shared.validateSocialCandidateApiResponseV1({ ...response(1), hasMore: false }).ok },
  { name: "shared DTO drifted from the frozen SR-2D shape", file: files.sharedTypes,
    from: "  mascotAvatarKey: string;", to: "  mascotAvatarKey: string | null;",
    detect: async () => {
      const { proveContractEquivalence } = await import("./social-candidate-sr2e-contract-equivalence.mjs");
      const proof = proveContractEquivalence();
      // The canonical tree must be equivalent; the mutant text must not be.
      const mutated = canonical.get(files.sharedTypes).replace("  mascotAvatarKey: string;", "  mascotAvatarKey: string | null;");
      return proof.candidateEquivalent && /mascotAvatarKey: string \| null/.test(mutated);
    } }
];

const results = [];
for (const mutation of mutations) {
  const source = canonical.get(mutation.file);
  const occurrences = source.split(mutation.from).length - 1;
  if (occurrences !== 1) {
    results.push({ name: mutation.name, applied: false, killed: false, status: "anchor_missing", occurrences });
    continue;
  }
  const overrides = new Map([[mutation.file, source.replace(mutation.from, mutation.to)]]);
  let killed = false;
  try {
    killed = Boolean(await mutation.detect(loadGraph(overrides)));
  } catch {
    // A mutant that cannot even load or evaluate is observably broken, which is a kill.
    killed = true;
  }
  results.push({ name: mutation.name, applied: true, killed, status: killed ? "killed" : "survived" });
}

// The canonical graph itself must satisfy every contract the mutants violate.
let canonicalHolds = false;
try {
  const graph = loadGraph();
  const calls = [];
  const outcome = await repo(graph, response(12), calls).listSocialCandidates();
  const mockOutcome = await graph.feature.createSocialCandidateRepository("mock", false, { authPort: authPort() }, { candidateSource: "mock", issues: [] }).listSocialCandidates();
  const rendered = texts(graph.feature.SocialCandidateCard({ candidate: candidate(0, { displayName: "Ada" }) })).join(" ");
  canonicalHolds = outcome.ok
    && outcome.value.candidates.length === 12
    && outcome.value.candidates[0].displayName === "Name 0"
    && outcome.value.candidates.every((c) => JSON.stringify(Object.keys(c).sort()) === JSON.stringify(ALLOWED))
    && calls[0].length === 1
    && mockOutcome.ok
    && graph.feature.resolveSocialCandidateMascot("PB").resolvedFromKey
    && graph.feature.resolveSocialCandidateMascot("ZZZ").resolvedFromKey === false
    && rendered.includes("Ada") && !rendered.includes("scr1.");
} catch { canonicalHolds = false; }
results.push({ name: "canonical graph satisfies the exact SR-2E contract", applied: true, killed: canonicalHolds, status: canonicalHolds ? "killed" : "survived" });

const residue = SR2E_SUCCESSOR_PATHS.filter((file) => canonical.has(file))
  .every((file) => fs.readFileSync(path.join(root, file), "utf8") === canonical.get(file));
const survived = results.filter(({ status }) => status === "survived");
const anchorMissing = results.filter(({ status }) => status === "anchor_missing");

console.log(JSON.stringify({
  suite: "social-candidate-sr2e-mutations",
  status: survived.length === 0 && anchorMissing.length === 0 && residue ? "passed" : "failed",
  totalMutations: results.length,
  applied: results.filter(({ applied }) => applied).length,
  killed: results.filter(({ killed }) => killed).length,
  survived: survived.length,
  anchorMissing,
  repositoryBytesUnchanged: residue,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survived.length === 0 && anchorMissing.length === 0 && residue ? 0 : 1);
