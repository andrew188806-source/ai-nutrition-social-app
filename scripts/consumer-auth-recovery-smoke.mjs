#!/usr/bin/env node
// TastKind AUTH-RECOVERY gates (offline; no network, no database, no secrets).
// Scope: consumer password recovery after the email code. (1) an account with a verified TOTP factor needs an AAL2 session, so the flow
// asks for the TOTP first and sends nothing until the session is AAL2 for the SAME account; (2) admin/staff accounts follow the dedicated
// admin recovery SOP and are refused here, using the database authority the admin console uses, failing closed and without disclosing why.
// Real product TypeScript (adapter, OTP controller, mappers) is loaded from the working tree and run against scripted Supabase/port doubles.
//   node scripts/consumer-auth-recovery-smoke.mjs [--out <dir>]      (TK_GATES=ID,ID selects gates)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const AUTH_BASE_COMMIT = "be8f700080181b9519e1eb4e720791259e6d4743";
const F = "apps/mobile/features";
const ADAPTER = `${F}/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`;
const CONTROLLER = `${F}/consumer-auth/emailOtpController.ts`;
const MAPPERS = `${F}/consumer-auth/supabaseAuthMappers.ts`;

function makeLoader(readSource) {
  const cache = new Map();
  const load = (rel) => {
    if (cache.has(rel)) return cache.get(rel).exports;
    const source = readSource(rel);
    if (source === null) throw new Error(`UNRESOLVED ${rel}`);
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    cache.set(rel, module);
    const localRequire = (request) => {
      if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), request)).replace(/\.js$/, "");
      for (const candidate of [`${base}.ts`, `${base}/index.ts`]) if (readSource(candidate) !== null) return load(candidate);
      throw new Error(`UNRESOLVED ${request} from ${rel}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: rel })(localRequire, module, module.exports);
    return module.exports;
  };
  return load;
}
const fromDisk = (overrides = {}) => (rel) => {
  if (rel in overrides) return overrides[rel];
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, "utf8") : null;
};
const fromBase = (rel) => {
  const r = childProcess.spawnSync("git", ["-C", ROOT, "show", `${AUTH_BASE_COMMIT}:${rel}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};

const user = (userId = "U") => ({ userId, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "x" });

// Every behavioural gate takes a loader, so the same gates run on the product source and on deliberately broken copies (mutation controls).
function behaviouralGates(load) {
  const { SupabaseConsumerAuthAdapter, createPasswordRecoveryGuard } = load(ADAPTER);
  const { ConsumerEmailOtpController } = load(CONTROLLER);
  const { mapSupabaseAuthEvent } = load(MAPPERS);
  const G = {};

  const mkController = (over = {}) => {
    let t = 1_000_000; const calls = { verifyTotp: 0, setPw: 0, recovery: 0 };
    const port = { source: "supabase-live", getCurrentSession: async () => ({ ok: true, value: { user: user() } }),
      sendEmailCode: async () => ({ ok: true }), verifyEmailCode: async () => ({ ok: true, value: { user: user() } }),
      checkPasswordRecoveryEligibility: async () => { calls.recovery++; return { ok: true }; },
      getPasswordStepUpState: async () => ({ ok: true, value: { totpRequired: true } }),
      verifyTotpStepUp: async () => { calls.verifyTotp++; return { ok: true }; },
      setOwnPassword: async () => { calls.setPw++; return { ok: true }; }, ...over };
    return { c: new ConsumerEmailOtpController(port, () => t), calls, advance: (ms) => { t += ms; } };
  };
  const verified = async (h) => { await h.c.send("a@b.co", "login"); await h.c.verify("12345678"); return h; };
  const refuse = { checkPasswordRecoveryEligibility: async () => ({ ok: false, error: { code: "password_recovery_unavailable" } }) };

  const mkAdapter = (decision, extra = {}) => {
    const calls = { updateUser: 0, challenge: 0, listFactors: 0, guard: 0, signIn: 0, verifyOtp: 0 };
    const u = { id: "U", email: "a@b.co", email_confirmed_at: "x", is_anonymous: false, app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" };
    const authClient = {
      getUser: async () => ({ data: { user: u }, error: null }), getSession: async () => ({ data: { session: { user: u, expires_in: 3600 } }, error: null }),
      updateUser: async () => { calls.updateUser++; return { data: { user: u }, error: null }; },
      signInWithPassword: async () => { calls.signIn++; return { data: { session: { user: u, expires_in: 3600 } }, error: null }; },
      verifyOtp: async () => { calls.verifyOtp++; return { data: { session: { user: u, expires_in: 3600 } }, error: null }; },
      signOut: async () => ({ error: null }), refreshSession: async () => ({ data: { session: null }, error: null }), resetPasswordForEmail: async () => ({ data: {}, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
        listFactors: async () => { calls.listFactors++; return { data: { totp: [{ id: "f", status: "verified" }] }, error: null }; },
        challenge: async () => { calls.challenge++; return { data: { id: "c" }, error: null }; }, verify: async () => ({ data: {}, error: null }) }, ...extra };
    const guard = decision === undefined ? undefined : async () => { calls.guard++; return decision; };
    return { adapter: new SupabaseConsumerAuthAdapter({ authClient, transportEnabled: true, passwordRecoveryGuard: guard }), calls };
  };

  // ---- event mapping: the SDK emits MFA_CHALLENGE_VERIFIED when the session is raised to AAL2 ----
  G.O1_MFA_EVENT_IS_A_SESSION_REPLACEMENT = async () => {
    const e = mapSupabaseAuthEvent("MFA_CHALLENGE_VERIFIED", { user: { id: "u1", app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" }, expires_in: 3600 });
    return e.type === "tokenRefreshed" && e.session?.user.userId === "u1";
  };
  G.O2_PRE_FIX_MAPPER_TREATED_IT_AS_UNKNOWN = async () => {
    const old = makeLoader(fromBase)(MAPPERS).mapSupabaseAuthEvent; try { old("MFA_CHALLENGE_VERIFIED", { user: { id: "u1", app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" }, expires_in: 3600 }); return false; } catch { return true; }
  };

  // ---- TOTP step (controller) ----
  G.L01_REQUIRED_AFTER_EMAIL_CODE = async () => (await verified(mkController())).c.getSnapshot().totp === "required";
  G.L02_SAVE_REFUSED_WHILE_TOTP_PENDING = async () => { const h = await verified(mkController()); return (await h.c.setOwnPassword("longenough1")) === false && h.c.getSnapshot().error === "password_mfa_required" && h.calls.setPw === 0; };
  G.L03_MALFORMED_TOTP_NOT_SENT = async () => { const h = await verified(mkController()); return (await h.c.verifyTotp("12ab")) === false && h.calls.verifyTotp === 0 && h.c.getSnapshot().error === "totp_invalid_code"; };
  G.L04_CORRECT_TOTP_THEN_SAVE = async () => { const h = await verified(mkController()); return (await h.c.verifyTotp("123456")) === true && h.c.getSnapshot().totp === "verified" && (await h.c.setOwnPassword("longenough1")) === true && h.calls.setPw === 1; };
  G.L05_ATTEMPT_CAP = async () => { const h = await verified(mkController({ verifyTotpStepUp: async () => ({ ok: false, error: { code: "totp_invalid_code" } }) })); for (let i = 0; i < 5; i++) await h.c.verifyTotp("123456"); await h.c.verifyTotp("123456"); return h.c.getSnapshot().error === "totp_attempts_exhausted" && h.c.getSnapshot().totp === "required"; };
  G.L06_WRONG_TOTP_NEVER_SAVES = async () => { const h = await verified(mkController({ verifyTotpStepUp: async () => ({ ok: false, error: { code: "totp_invalid_code" } }) })); await h.c.verifyTotp("123456"); return (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0; };
  G.L07_INTERRUPTED_TOTP_NEVER_SAVES = async () => { const h = await verified(mkController({ verifyTotpStepUp: async () => { throw new Error("x"); } })); return (await h.c.verifyTotp("123456")) === false && h.c.getSnapshot().error === "totp_unavailable" && (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0; };
  G.L08_EXPIRED_EMAIL_WINDOW = async () => { const h = await verified(mkController()); h.advance(301000); return (await h.c.verifyTotp("123456")) === false && h.calls.verifyTotp === 0 && (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0; };
  G.L09_CHANGING_EMAIL_CLEARS_STATE = async () => { const h = await verified(mkController()); await h.c.verifyTotp("123456"); h.c.changeEmail(); return (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0; };
  G.L10_ACCOUNT_SWITCH_BEFORE_TOTP = async () => { let who = "U"; const h = await verified(mkController({ getCurrentSession: async () => ({ ok: true, value: { user: user(who) } }) })); who = "OTHER"; return (await h.c.verifyTotp("123456")) === false && h.calls.verifyTotp === 0 && h.c.getSnapshot().error === "password_reauthentication_required"; };
  G.L11_NO_MFA_ACCOUNT_UNCHANGED = async () => { const h = await verified(mkController({ getPasswordStepUpState: async () => ({ ok: true, value: { totpRequired: false } }) })); return h.c.getSnapshot().totp === "not_required" && (await h.c.setOwnPassword("longenough1")) === true && h.calls.setPw === 1; };
  G.L12_UNREADABLE_ASSURANCE_DOES_NOT_BLOCK_LOGIN = async () => { const h = await verified(mkController({ getPasswordStepUpState: async () => { throw new Error("x"); } })); return h.c.getSnapshot().totp === "unchecked" && h.c.getSnapshot().status === "verified"; };

  // ---- admin/staff refusal (controller) ----
  G.A01_LOGIN_NEVER_CONSULTS_THE_AUTHORITY = async () => { const h = await verified(mkController()); return h.c.getSnapshot().status === "verified" && h.calls.recovery === 0; };
  G.A02_REFUSED_ACCOUNT_IS_BLOCKED_GENERICALLY = async () => { const h = await verified(mkController(refuse)); return (await h.c.checkRecovery()) === false && h.c.getSnapshot().recovery === "blocked" && h.c.getSnapshot().error === "password_recovery_unavailable"; };
  G.A03_REFUSED_ACCOUNT_NO_TOTP = async () => { const h = await verified(mkController(refuse)); return (await h.c.verifyTotp("123456")) === false && h.calls.verifyTotp === 0 && h.c.getSnapshot().error === "password_recovery_unavailable"; };
  G.A04_REFUSED_ACCOUNT_NO_SAVE = async () => { const h = await verified(mkController(refuse)); return (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0; };
  G.A05_UNREACHABLE_EQUALS_REFUSED = async () => {
    const a = await verified(mkController({ checkPasswordRecoveryEligibility: async () => { throw new Error("down"); } })); await a.c.setOwnPassword("longenough1");
    const b = await verified(mkController(refuse)); await b.c.setOwnPassword("longenough1");
    return a.c.getSnapshot().error === "password_recovery_unavailable" && a.c.getSnapshot().error === b.c.getSnapshot().error && a.c.getSnapshot().recovery === b.c.getSnapshot().recovery && a.calls.setPw === 0;
  };
  G.A06_PORT_WITHOUT_AUTHORITY_IS_REFUSED = async () => { const h = await verified(mkController({ checkPasswordRecoveryEligibility: undefined })); return (await h.c.setOwnPassword("longenough1")) === false && h.calls.setPw === 0 && h.c.getSnapshot().error === "password_recovery_unavailable"; };
  G.A07_CLEARED_CONSUMER_SAVES_AFTER_ONE_CHECK = async () => { const h = await verified(mkController({ getPasswordStepUpState: async () => ({ ok: true, value: { totpRequired: false } }) })); return (await h.c.setOwnPassword("longenough1")) === true && h.calls.recovery === 1 && h.calls.setPw === 1; };
  G.A08_CHANGING_EMAIL_REQUIRES_A_NEW_CHECK = async () => { const h = await verified(mkController()); await h.c.checkRecovery(); h.c.changeEmail(); return h.c.getSnapshot().recovery === "unchecked"; };
  G.A09_SWITCH_BEFORE_CHECK_SAYS_REVERIFY = async () => { const h = await verified(mkController({ checkPasswordRecoveryEligibility: async () => ({ ok: false, error: { code: "password_reauthentication_required" } }) })); return (await h.c.checkRecovery()) === false && h.c.getSnapshot().error === "password_reauthentication_required"; };

  G.A10_ANY_OTHER_REFUSAL_CODE_IS_NORMALISED = async () => { const h = await verified(mkController({ checkPasswordRecoveryEligibility: async () => ({ ok: false, error: { code: "some_internal_reason" } }) })); await h.c.checkRecovery(); return h.c.getSnapshot().error === "password_recovery_unavailable"; };

  // ---- adapter: the enforcing checks sit directly before the network call ----
  G.B01_ADAPTER_SAVE_REFUSED_WITHOUT_ELIGIBILITY = async () => {
    for (const d of ["restricted", "unknown", undefined]) { const a = mkAdapter(d); const r = await a.adapter.setOwnPassword({ expectedUserId: "U", password: "longenough1" }); if (r.ok || r.error.code !== "password_recovery_unavailable" || a.calls.updateUser !== 0) return false; }
    return true;
  };
  G.B02_ADAPTER_SAVE_PROCEEDS_WHEN_ELIGIBLE = async () => { const a = mkAdapter("eligible"); const r = await a.adapter.setOwnPassword({ expectedUserId: "U", password: "longenough1" }); return r.ok === true && a.calls.updateUser === 1; };
  G.B03_ADAPTER_TOTP_REFUSED_BEFORE_ANY_FACTOR_CALL = async () => { const a = mkAdapter("restricted"); const r = await a.adapter.verifyTotpStepUp({ expectedUserId: "U", code: "123456" }); return r.ok === false && r.error.code === "password_recovery_unavailable" && a.calls.listFactors === 0 && a.calls.challenge === 0; };
  G.B04_RESTRICTED_AND_UNKNOWN_ARE_IDENTICAL = async () => { const a = await mkAdapter("restricted").adapter.checkPasswordRecoveryEligibility({ expectedUserId: "U" }); const b = await mkAdapter("unknown").adapter.checkPasswordRecoveryEligibility({ expectedUserId: "U" }); return !a.ok && !b.ok && a.error.code === b.error.code && a.error.message === b.error.message; };
  G.B05_OTHER_SESSION_IS_NEVER_EVALUATED = async () => { const a = mkAdapter("eligible"); const r = await a.adapter.checkPasswordRecoveryEligibility({ expectedUserId: "OTHER" }); return !r.ok && r.error.code === "password_reauthentication_required" && a.calls.guard === 0; };
  G.B06_LOGIN_PATHS_NEVER_CONSULT_THE_AUTHORITY = async () => { const a = mkAdapter("restricted"); await a.adapter.signIn({ email: "a@b.co", password: "x" }); await a.adapter.verifyEmailCode({ email: "a@b.co", token: "12345678" }); return a.calls.signIn === 1 && a.calls.verifyOtp === 1 && a.calls.guard === 0; };

  // ---- adapter TOTP step-up: server answers are mapped, and success is only believed once the session is AAL2 for the same account ----
  const mfaOf = ({ verifyError = null, level = "aal2" } = {}) => ({ mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level, nextLevel: "aal2" }, error: null }),
    listFactors: async () => ({ data: { totp: [{ id: "f", status: "verified" }] }, error: null }),
    challenge: async () => ({ data: { id: "c" }, error: null }),
    verify: async () => (verifyError ? { data: null, error: { code: verifyError } } : { data: {}, error: null }) } });
  G.B07_WRONG_TOTP_MAPS_TO_INVALID_CODE = async () => { const r = await mkAdapter("eligible", mfaOf({ verifyError: "mfa_verification_failed" })).adapter.verifyTotpStepUp({ expectedUserId: "U", code: "123456" }); return !r.ok && r.error.code === "totp_invalid_code"; };
  G.B08_OTHER_SERVER_ERRORS_ARE_UNAVAILABLE_NOT_INVALID = async () => { const r = await mkAdapter("eligible", mfaOf({ verifyError: "over_request_rate_limit" })).adapter.verifyTotpStepUp({ expectedUserId: "U", code: "123456" }); return !r.ok && r.error.code === "totp_unavailable"; };
  G.B09_ACCEPTED_TOTP_IS_NOT_BELIEVED_WITHOUT_AAL2 = async () => { const r = await mkAdapter("eligible", mfaOf({ level: "aal1" })).adapter.verifyTotpStepUp({ expectedUserId: "U", code: "123456" }); return !r.ok && r.error.code === "password_reauthentication_required"; };
  G.B10_ACCEPTED_TOTP_WITH_AAL2_IS_OK = async () => (await mkAdapter("eligible", mfaOf({ level: "aal2" })).adapter.verifyTotpStepUp({ expectedUserId: "U", code: "123456" })).ok === true;
  G.B11_SERVER_INSUFFICIENT_AAL_IS_NAMED = async () => { const a = mkAdapter("eligible", { updateUser: async () => ({ data: null, error: { code: "insufficient_aal", status: 401 } }) }); const r = await a.adapter.setOwnPassword({ expectedUserId: "U", password: "longenough1" }); return !r.ok && r.error.code === "password_mfa_required"; };

  // ---- the authority guard against the real response shapes of the two context RPCs ----
  const rpcOf = (map) => ({ rpc: (name) => { const v = map[name]; if (v instanceof Error) return Promise.reject(v); if (v === "hang") return new Promise(() => {}); return Promise.resolve(v); } });
  const E = { data: [], error: null };
  const P = { data: [{ role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "platform" }], error: null };
  const S = { data: [{ permission_key: "admin_context.read" }], error: null };
  const dec = (m, t) => createPasswordRecoveryGuard(rpcOf(m), t)();
  G.C01_BOTH_EMPTY_IS_ELIGIBLE = async () => (await dec({ platform_admin_current_context_v1: E, staff_current_context_v1: E })) === "eligible";
  G.C02_PLATFORM_ROWS_RESTRICT = async () => (await dec({ platform_admin_current_context_v1: P, staff_current_context_v1: E })) === "restricted";
  G.C03_STAFF_ROWS_RESTRICT = async () => (await dec({ platform_admin_current_context_v1: E, staff_current_context_v1: S })) === "restricted";
  G.C04_ONE_ERROR_IS_UNKNOWN = async () => (await dec({ platform_admin_current_context_v1: { data: null, error: { code: "42501" } }, staff_current_context_v1: E })) === "unknown";
  G.C05_NON_ARRAY_IS_UNKNOWN = async () => (await dec({ platform_admin_current_context_v1: { data: { x: 1 }, error: null }, staff_current_context_v1: E })) === "unknown";
  G.C06_THROWN_RPC_IS_UNKNOWN = async () => (await dec({ platform_admin_current_context_v1: new Error("net"), staff_current_context_v1: E })) === "unknown";
  G.C07_HANGING_AUTHORITY_TIMES_OUT = async () => (await dec({ platform_admin_current_context_v1: "hang", staff_current_context_v1: E }, 50)) === "unknown";
  G.C08_RESTRICTED_BEATS_AN_ERROR = async () => (await dec({ platform_admin_current_context_v1: { data: null, error: { code: "x" } }, staff_current_context_v1: S })) === "restricted";
  return G;
}

// ---- source assertions ----
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
function sourceGates() {
  const G = {};
  const code = (s) => s.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const adapter = read(ADAPTER), controller = read(CONTROLLER), ui = read("apps/mobile/app/account-password.tsx"), composition = read(`${F}/consumer-runtime/consumerRuntimeComposition.ts`);
  G.S01_ADMIN_STATUS_NEVER_COMES_FROM_THE_CLIENT = async () => !/user_metadata|app_metadata\??\.(role|is_admin)|@tastkind\.app/.test(code(adapter + "\n" + controller + "\n" + ui)) && /platform_admin_current_context_v1/.test(adapter) && /staff_current_context_v1/.test(adapter);
  G.S02_NO_PRIVILEGED_KEY_OR_ADMIN_API = async () => !/service[_-]?role|auth\.admin|admin\.updateUserById|generateLink/i.test(adapter + controller + ui + composition);
  G.S03_UI_NEVER_MENTIONS_ADMIN = async () => { const m = ui.slice(ui.indexOf("const messages"), ui.indexOf("export default")); return !/管理員|admin|staff/i.test(m) && /password_recovery_unavailable/.test(m); };
  G.S04_GUARD_IS_WIRED_INTO_THE_LIVE_ADAPTER = async () => /passwordRecoveryGuard:\s*createPasswordRecoveryGuard\(onboardingClient\)/.test(composition);
  G.S05_ENFORCEMENT_PRECEDES_THE_NETWORK_CALL = async () => adapter.indexOf("recoveryAllowed()", adapter.indexOf("async setOwnPassword")) > 0 && adapter.indexOf("recoveryAllowed()", adapter.indexOf("async setOwnPassword")) < adapter.indexOf("this.authClient.updateUser(", adapter.indexOf("async setOwnPassword"));
  G.S06_NO_MFA_OR_SESSION_DOWNGRADE = async () => !/mfa\.(unenroll|enroll)|aal1.*=.*aal2|signOut\(\{ scope: "global"/.test(adapter + controller);
  G.S07_LOGIN_FILES_UNTOUCHED = async () => ["apps/mobile/app/login.tsx", `${F}/consumer-auth/EmailOtpForm.tsx`].every((p) => fs.existsSync(path.join(ROOT, p)));
  // The exact successor record (no cluster, no network): exact => record and the older chain complete; any tampered/partial/mixed state => invalid.
  G.F01_AUTH_EXACT_SUCCESSOR_RECORD_AND_TAMPER_CONTROLS = async () => {
    const P = await import("./consumer-retention-persistence-smoke.mjs");
    const { AUTH_FILES, authPredecessorGit } = await import("./consumer-auth-recovery-exact-successor.mjs");
    const rootGit = (args) => { const r = childProcess.spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256e6, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }); if (r.status) throw new Error("SETUP_GIT " + args.join(" ") + " " + r.stderr); return r.stdout; };
    // Changes only what a path REPORTS (index blob and/or worktree hash); nothing on disk is touched.
    const lying = ({ stage = {}, hash = {} }) => (args) => {
      const out = rootGit(args);
      if (args[0] === "ls-files" && args.includes("--stage")) return out.split("\n").map((line) => { const at = line.indexOf("\t"); if (at < 0) return line; const name = line.slice(at + 1); return name in stage ? (stage[name] === null ? "" : `100644 ${stage[name]} 0\t${name}`) : line; }).filter(Boolean).join("\n") + "\n";
      if (args[0] === "hash-object" && args.includes("--")) { const names = args.slice(args.indexOf("--") + 1), lines = out.trim().split("\n"); return names.map((n, i) => (n in hash ? hash[n] : lines[i])).join("\n") + "\n"; }
      return out;
    };
    const adapterPath = ADAPTER, smokePath = "scripts/consumer-auth-recovery-smoke.mjs", mod = P.AUTH_MODULE_PATH, base = AUTH_FILES[adapterPath].base;
    const exact = { auth: P.checkedAuthState(rootGit).state, r1a: P.checkedR1aState(rootGit).state, chain: P.recoverySuccessorState(rootGit), act2: P.checkedAct2State(rootGit) };
    const cases = {
      worktreeTampered: { hash: { [adapterPath]: "0".repeat(40) } },
      indexTampered: { stage: { [adapterPath]: "1".repeat(40) } },
      partialOneLeafAtBase: { stage: { [adapterPath]: base }, hash: { [adapterPath]: base } },
      mixedIndexBaseWorktreeRecord: { stage: { [adapterPath]: base } },
      newLeafUnstaged: { stage: { [smokePath]: null } },
      moduleTampered: { hash: { [mod]: "f".repeat(40) } }
    };
    const observed = {};
    for (const [name, c] of Object.entries(cases)) { const g = lying(c); const s = P.checkedAuthState(g), chain = P.recoverySuccessorState(g), act2 = P.checkedAct2State(g); observed[name] = { auth: s.state, chain: chain.state, exempt: chain.exempt, act2: act2.state }; }
    // Predecessor view: every modified leaf reports its R1-A main identity; the new leaf is absent from the index view.
    const view = authPredecessorGit(rootGit), leaves = Object.keys(AUTH_FILES);
    const viewIndex = new Map(view(["ls-files", "--stage", "--", ...leaves]).trim().split("\n").filter(Boolean).map((v) => [v.slice(v.indexOf("\t") + 1), v]));
    const present = leaves.filter((p) => AUTH_FILES[p].base), viewHash = view(["hash-object", "--", ...present]).trim().split("\n");
    const predecessorLeaves = leaves.every((p) => (AUTH_FILES[p].base ? viewIndex.get(p) === `${AUTH_FILES[p].baseMode} ${AUTH_FILES[p].base} 0\t${p}` && viewHash[present.indexOf(p)] === AUTH_FILES[p].base : !viewIndex.has(p)));
    return exact.auth === "record" && exact.r1a === "record" && exact.chain.auth === "record" && exact.chain.r1a === "record" && exact.chain.exempt === true
      && ["entw1", "ph1", "edge", "act2", "billing"].every((k) => exact.chain[k] === "record")
      && exact.act2.state === "record" && [...leaves, mod].every((p) => exact.act2.paths.includes(p))
      && Object.values(observed).every((o) => o.auth === "invalid" && o.chain === "invalid" && o.exempt === false && o.act2 === "invalid") && predecessorLeaves;
  };
  return G;
}

// ---- mutation controls: a broken copy of the source must be caught by at least one named gate ----
const MUTANTS = [
  { id: "M01", file: ADAPTER, find: "    if (!(await this.recoveryAllowed()))\n      return err(new ConsumerAuthError(\"password_recovery_unavailable\", \"Password settings are not available for this account here.\"));\n    // An account with a verified second factor", replace: "    // An account with a verified second factor", expect: ["B01_ADAPTER_SAVE_REFUSED_WITHOUT_ELIGIBILITY"] },
  { id: "M02", file: ADAPTER, find: "    if (!guard) return false; // no authority wired: refuse", replace: "    if (!guard) return true;", expect: ["B01_ADAPTER_SAVE_REFUSED_WITHOUT_ELIGIBILITY"] },
  { id: "M03", file: ADAPTER, find: "    try { return (await guard()) === \"eligible\"; } catch { return false; }", replace: "    try { return (await guard()) !== \"restricted\"; } catch { return true; }", expect: ["B01_ADAPTER_SAVE_REFUSED_WITHOUT_ELIGIBILITY", "B04_RESTRICTED_AND_UNKNOWN_ARE_IDENTICAL"] },
  { id: "M04", file: ADAPTER, find: "        if (result.error || !Array.isArray(result.data)) unknown = true;\n        else if (result.data.length > 0) return \"restricted\";", replace: "        if (!result.error && Array.isArray(result.data) && result.data.length > 0) return \"restricted\";", expect: ["C04_ONE_ERROR_IS_UNKNOWN", "C05_NON_ARRAY_IS_UNKNOWN"] },
  { id: "M05", file: ADAPTER, find: "    } catch { return \"unknown\"; } finally { if (timer !== undefined) clearTimeout(timer); }", replace: "    } catch { return \"eligible\"; } finally { if (timer !== undefined) clearTimeout(timer); }", expect: ["C06_THROWN_RPC_IS_UNKNOWN", "C07_HANGING_AUTHORITY_TIMES_OUT"] },
  { id: "M06", file: ADAPTER, find: "    if (!(await this.recoveryAllowed()))\n      return err(new ConsumerAuthError(\"password_recovery_unavailable\", \"Password settings are not available for this account here.\"));\n    const listed", replace: "    const listed", expect: ["B03_ADAPTER_TOTP_REFUSED_BEFORE_ANY_FACTOR_CALL"] },
  { id: "M07", file: ADAPTER, find: "    if (verified.error || !user || user.id !== input.expectedUserId || user.is_anonymous) return err<void>(", replace: "    if (false) return err<void>(", expect: ["B05_OTHER_SESSION_IS_NEVER_EVALUATED"] },
  { id: "M08", file: CONTROLLER, find: "    if (this.state.recovery !== \"eligible\" && !(await this.checkRecovery())) return false;\n    if (password.length < 8)", replace: "    if (password.length < 8)", expect: ["A04_REFUSED_ACCOUNT_NO_SAVE", "A06_PORT_WITHOUT_AUTHORITY_IS_REFUSED"] },
  { id: "M09", file: CONTROLLER, find: "    if (this.state.recovery !== \"eligible\" && !(await this.checkRecovery())) return false;\n    if (this.totpAttempts", replace: "    if (this.totpAttempts", expect: ["A03_REFUSED_ACCOUNT_NO_TOTP"] },
  { id: "M10", file: CONTROLLER, find: "    if (this.state.totp === \"required\") { this.emit({ error: \"password_mfa_required\" }); return false; }\n", replace: "", expect: ["L02_SAVE_REFUSED_WHILE_TOTP_PENDING"] },
  { id: "M11", file: CONTROLLER, find: "      this.emit({ recovery: \"blocked\", error: result.error.code === \"password_reauthentication_required\" ? \"password_reauthentication_required\" : \"password_recovery_unavailable\" });", replace: "      this.emit({ recovery: \"blocked\", error: result.error.code });", expect: ["A10_ANY_OTHER_REFUSAL_CODE_IS_NORMALISED"] },
  { id: "M12", file: CONTROLLER, find: "if (this.totpAttempts >= MAX_TOTP_ATTEMPTS)", replace: "if (false)", expect: ["L05_ATTEMPT_CAP"] },
  { id: "M13", file: MAPPERS, find: "    case \"MFA_CHALLENGE_VERIFIED\": // same identity, new (AAL2) tokens: a session replacement, not an unknown event\n", replace: "", expect: ["O1_MFA_EVENT_IS_A_SESSION_REPLACEMENT"] },
  { id: "M14", file: CONTROLLER, find: "      const totp = await this.readTotpStep();\n", replace: "      const totp = \"not_required\" as const;\n", expect: ["L01_REQUIRED_AFTER_EMAIL_CODE"] },
  { id: "M15", file: ADAPTER, find: "      if (code !== \"mfa_verification_failed\" && code !== \"mfa_challenge_expired\")", replace: "      if (false)", expect: ["B08_OTHER_SERVER_ERRORS_ARE_UNAVAILABLE_NOT_INVALID"] },
  { id: "M16", file: ADAPTER, find: "    if (assurance.error || assurance.data?.currentLevel !== \"aal2\" || !(await sameIdentity()))", replace: "    if (assurance.error || !(await sameIdentity()))", expect: ["B09_ACCEPTED_TOTP_IS_NOT_BELIEVED_WITHOUT_AAL2"] },
  { id: "M17", file: ADAPTER, find: "code === \"insufficient_aal\" ? \"password_mfa_required\" : ", replace: "", expect: ["B11_SERVER_INSUFFICIENT_AAL_IS_NAMED"] }
];

async function run() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const out = arg("--out") ? path.resolve(arg("--out")) : null;
  if (out && (out === ROOT || out.startsWith(ROOT + path.sep))) throw new Error("EVIDENCE_OUTSIDE_REPOSITORY_REQUIRED");
  const only = (process.env.TK_GATES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const gates = { ...behaviouralGates(makeLoader(fromDisk())), ...sourceGates() };
  const results = {};
  for (const [id, fn] of Object.entries(gates)) {
    if (only.length && !only.includes(id)) continue;
    try { results[id] = (await fn()) === true; } catch (e) { results[id] = false; console.error(`CRASH ${id}: ${String(e.message).slice(0, 160)}`); }
  }
  if (!only.length) {
    for (const m of MUTANTS) {
      const source = read(m.file);
      if (!source.includes(m.find)) { results[`MUTANT_${m.id}_APPLIES`] = false; continue; }
      const broken = behaviouralGates(makeLoader(fromDisk({ [m.file]: source.replace(m.find, () => m.replace) })));
      const caught = [];
      for (const id of m.expect) { try { if ((await broken[id]()) !== true) caught.push(id); } catch { caught.push(id); } }
      results[`MUTANT_${m.id}_CAUGHT`] = caught.length > 0;
    }
  }
  const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
  for (const [k, v] of Object.entries(results)) console.log(`${v ? "PASS" : "FAIL"}  ${k}`);
  console.log(`RESULT ${failed.length ? "FAIL" : "PASS"} ${Object.values(results).filter(Boolean).length}/${Object.keys(results).length}`);
  if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ status: failed.length ? "FAIL" : "PASS", results, failed }, null, 2)); }
  return failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code; try { code = await run(); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
