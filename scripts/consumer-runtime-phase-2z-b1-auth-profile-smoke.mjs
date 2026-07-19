#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];

function expect(condition, name, detail) {
  if (!condition) throw new Error(`FAIL [${name}]${detail ? `: ${detail}` : ""}`);
  checks.push({ name, pass: true });
}

function loadTsModule(file, special = {}) {
  const absolute = path.resolve(root, file);
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request in special) return special[request];
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const resolved = path.resolve(path.dirname(absolute), request).replace(/\.js$/, "") + ".ts";
    return loadTsModule(path.relative(root, resolved), special);
  };
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute });
  wrapper(localRequire, module, module.exports);
  return module.exports;
}

const errors = loadTsModule("apps/mobile/features/consumer-auth/errors.ts");
const types = loadTsModule("apps/mobile/features/consumer-auth/types.ts", { "./errors": errors });
const storage = loadTsModule("apps/mobile/features/consumer-auth/storage.ts");
const sessionStore = loadTsModule("apps/mobile/features/consumer-auth/sessionStateStore.ts");
const mockAuth = loadTsModule("apps/mobile/features/consumer-auth/adapters/mockConsumerAuthAdapter.ts", {
  "../errors": errors,
  "../types": types,
  "../storage": storage
});
const mockProfiles = loadTsModule("apps/mobile/features/consumer-auth/adapters/mockConsumerProfileRepository.ts", {
  "../errors": errors,
  "../types": types
});

class NoopValue {}
const authExports = {
  ...errors,
  ...types,
  ...storage,
  ...sessionStore,
  ...mockAuth,
  ...mockProfiles,
  ConsumerAuthRefreshLifecycle: NoopValue,
  ConsumerProfileService: NoopValue,
  SupabaseConsumerAuthAdapter: NoopValue,
  SupabaseConsumerClientFactory: NoopValue,
  createAsyncStorageConsumerAuthStorage() { throw new Error("remote storage must not be created by smoke"); },
  createConsumerAuthScaffold() { throw new Error("live scaffold must not be created by smoke"); },
  createOfficialSupabaseConsumerSdkLoader() { throw new Error("Supabase SDK must not load in smoke"); },
  createReactNativeConsumerAppStateSource() { throw new Error("React Native lifecycle must not load in smoke"); },
  getConsumerRuntimeFlags() { return mockFlags; },
  getSupabaseConsumerEnvironment() { throw new Error("Supabase environment must not be read in smoke"); }
};
const runtime = loadTsModule("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts", { "../consumer-auth": authExports });

const mockFlags = {
  authSource: "mock",
  profileSource: "mock",
  supabaseAuthEnabled: false,
  supabaseWritesEnabled: false,
  issues: []
};

function profile(userId, overrides = {}) {
  return mockProfiles.buildDefaultMockConsumerProfile({ userId, profileId: userId, displayName: `Profile ${userId}`, ...overrides });
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

try {
  const memory = new storage.MemoryConsumerAuthStorage();
  const auth1 = new mockAuth.MockConsumerAuthAdapter({ storage: memory });
  const profileRepo1 = new mockProfiles.MockConsumerProfileRepository({ profiles: [profile("current-user")] });
  const controller1 = new runtime.ConsumerAuthProfileRuntime({
    authPort: auth1,
    profileService: { async getCurrentProfile() {
      const session = await auth1.getCurrentSession();
      return session.ok && session.value ? profileRepo1.getProfile(session.value.user.userId) : { ok: false, error: new errors.ConsumerAuthenticationRequiredError() };
    } }
  });
  await controller1.start();
  expect(controller1.getState().authState.status === "signedOut", "mock starts signed-out");
  expect(await controller1.signInDemo(), "explicit Demo sign-in succeeds");
  await flush();
  expect(controller1.getState().actorKey === "current-user", "Demo sign-in establishes canonical mock actor");
  expect(controller1.getState().profileState.status === "available", "mock profile loads successfully");
  controller1.stop();

  const auth2 = new mockAuth.MockConsumerAuthAdapter({ storage: memory });
  const controller2 = new runtime.ConsumerAuthProfileRuntime({
    authPort: auth2,
    profileService: { async getCurrentProfile() { return { ok: true, value: profile("current-user") }; } }
  });
  await controller2.start();
  await flush();
  expect(controller2.getState().authState.status === "signedIn", "mock session restore returns signed-in");
  expect(await controller2.signOut(), "mock sign-out succeeds");
  expect(controller2.getState().actorKey === null && controller2.getState().profileState.status === "idle", "sign-out clears actor-scoped profile state");
  controller2.stop();

  const notFoundAuth = new mockAuth.MockConsumerAuthAdapter();
  const notFoundController = new runtime.ConsumerAuthProfileRuntime({
    authPort: notFoundAuth,
    profileService: { async getCurrentProfile() { return { ok: false, error: new errors.ConsumerProfileNotFoundError("raw-not-exposed") }; } }
  });
  await notFoundController.start();
  await notFoundController.signInDemo();
  await flush();
  expect(notFoundController.getState().profileState.status === "notFound", "profile not-found remains authenticated with safe state");
  expect(JSON.stringify(notFoundController.getState()).includes("raw-not-exposed") === false, "profile not-found does not expose raw provider message");
  notFoundController.stop();

  const errorAuth = new mockAuth.MockConsumerAuthAdapter();
  const errorController = new runtime.ConsumerAuthProfileRuntime({
    authPort: errorAuth,
    profileService: { async getCurrentProfile() { return { ok: false, error: new errors.ConsumerProfileTransportFailedError("provider-payload") }; } }
  });
  await errorController.start();
  await errorController.signInDemo();
  await flush();
  expect(errorController.getState().profileState.status === "error", "profile transport error maps to safe error state");
  expect(JSON.stringify(errorController.getState()).includes("provider-payload") === false, "profile error does not expose raw provider payload");
  errorController.stop();

  const closedAuth = new mockAuth.MockConsumerAuthAdapter();
  const closedController = new runtime.ConsumerAuthProfileRuntime({
    authPort: closedAuth,
    profileService: { async getCurrentProfile() { return { ok: false, error: new errors.ConsumerAccountDisabledError("closed-provider-detail") }; } }
  });
  await closedController.start();
  await closedController.signInDemo();
  await flush();
  expect(closedController.getState().authState.status === "disabled" && closedController.getState().actorKey === null, "closed account lifecycle blocks authenticated app and clears actor");
  closedController.stop();

  const disabledPort = {
    source: "supabase-disabled",
    async getCurrentSession() { return { ok: true, value: null }; },
    observeAuthState(listener) { listener({ status: "signedOut", session: null }); return () => undefined; },
    async restoreSession() { return { ok: true, value: null }; },
    async signIn() { return { ok: false, error: new errors.ConsumerAuthOperationNotEnabledError() }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value: null }; },
    async signUp() { return { ok: false, error: new errors.ConsumerAuthOperationNotEnabledError() }; },
    async sendPasswordReset() { return { ok: false, error: new errors.ConsumerAuthOperationNotEnabledError() }; }
  };
  const disabledController = new runtime.ConsumerAuthProfileRuntime({ authPort: disabledPort, profileService: { async getCurrentProfile() { throw new Error("must not load"); } } });
  await disabledController.start();
  expect(disabledController.mode === "disabled", "disabled mode remains explicit");
  expect(await disabledController.signInDemo() === false, "disabled mode cannot use Demo fallback");
  expect(await disabledController.signIn("user@example.com", "not-a-real-secret") === false, "disabled sign-in fails closed");
  disabledController.stop();

  const unsupported = runtime.createConsumerRuntimeComposition({ flags: { ...mockFlags, authSource: "supabase-disabled", issues: ["unsupported source"] } });
  expect(unsupported.ok === false && unsupported.errorCode === "configuration_error", "unsupported configuration fails closed before client creation");

  const staleA = deferred();
  const staleB = deferred();
  let actor = "actor-a";
  let authListener = () => undefined;
  let observerUnsubscribed = 0;
  const switchingPort = {
    source: "mock",
    async getCurrentSession() { return { ok: true, value: null }; },
    observeAuthState(listener) { authListener = listener; listener({ status: "signedOut", session: null }); return () => { observerUnsubscribed += 1; authListener = () => undefined; }; },
    async restoreSession() { return { ok: true, value: null }; },
    async signIn() { throw new Error("not used"); },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value: null }; },
    async signUp() { throw new Error("not used"); },
    async sendPasswordReset() { throw new Error("not used"); }
  };
  const lifecycle = { initialized: 0, disposed: 0, initialize() { this.initialized += 1; }, dispose() { this.disposed += 1; } };
  const switchingController = new runtime.ConsumerAuthProfileRuntime({
    authPort: switchingPort,
    refreshLifecycle: lifecycle,
    profileService: { async getCurrentProfile() { return actor === "actor-a" ? staleA.promise : staleB.promise; } }
  });
  await switchingController.start();
  authListener({ status: "signedIn", session: mockAuth.buildMockSession("actor-a") });
  actor = "actor-b";
  authListener({ status: "signedIn", session: mockAuth.buildMockSession("actor-b") });
  staleA.resolve({ ok: true, value: profile("actor-a") });
  staleB.resolve({ ok: true, value: profile("actor-b") });
  await flush();
  expect(switchingController.getState().actorKey === "actor-b", "actor change replaces actor key");
  expect(switchingController.getState().profileState.profile?.userId === "actor-b", "stale profile response cannot overwrite new actor");
  switchingController.stop();
  expect(lifecycle.initialized === 1 && lifecycle.disposed === 1, "observer lifecycle initializes and disposes exactly once");
  expect(observerUnsubscribed === 1, "auth observer unsubscribes exactly once on dispose");

  const pendingSignIn = deferred();
  const duplicatePort = { ...switchingPort, async signIn() { return pendingSignIn.promise; } };
  const duplicateController = new runtime.ConsumerAuthProfileRuntime({ authPort: duplicatePort, profileService: { async getCurrentProfile() { return { ok: true, value: profile("duplicate") }; } } });
  await duplicateController.start();
  const firstSubmit = duplicateController.signIn("user@example.com", "not-a-real-secret");
  const secondSubmit = await duplicateController.signIn("user@example.com", "not-a-real-secret");
  expect(secondSubmit === false, "duplicate sign-in submission is rejected while in flight");
  pendingSignIn.resolve({ ok: false, error: new errors.ConsumerAuthOperationNotEnabledError("raw-auth-error") });
  await firstSubmit;
  expect(JSON.stringify(duplicateController.getState()).includes("raw-auth-error") === false, "auth error state does not expose raw provider error");
  duplicateController.stop();

  const output = {
    phase: "Phase 2Z-B1 Auth/Profile Deterministic Local Smoke",
    status: "passed",
    totalChecks: checks.length,
    passed: checks.length,
    failed: 0,
    remoteUsed: false,
    credentialsRead: false,
    rawProviderErrorPrinted: false,
    checks
  };
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    phase: "Phase 2Z-B1 Auth/Profile Deterministic Local Smoke",
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
    passed: checks.length,
    checks,
    remoteUsed: false,
    credentialsRead: false
  }, null, 2));
  process.exitCode = 1;
}
