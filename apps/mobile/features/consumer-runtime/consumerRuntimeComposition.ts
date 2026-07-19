import {
  ConsumerAuthRefreshLifecycle,
  ConsumerAuthStateStore,
  ConsumerProfileService,
  SupabaseConsumerAuthAdapter,
  SupabaseConsumerClientFactory,
  createAsyncStorageConsumerAuthStorage,
  createConsumerAuthScaffold,
  createOfficialSupabaseConsumerSdkLoader,
  createReactNativeConsumerAppStateSource,
  getConsumerRuntimeFlags,
  getSupabaseConsumerEnvironment,
  type ConsumerAuthError,
  type ConsumerAuthPort,
  type ConsumerAuthState,
  type ConsumerProfile,
  type ConsumerRuntimeFlags,
  type SupabaseConsumerProfileClientLike
} from "../consumer-auth";

export type ConsumerRuntimeMode = "mock" | "disabled" | "supabase";
export type ConsumerRuntimeOperation = "idle" | "signingIn" | "signingOut";
export type ConsumerRuntimeErrorCode =
  | "account_disabled"
  | "authentication_failed"
  | "configuration_error"
  | "operation_not_enabled"
  | "profile_failed"
  | "profile_not_found";

export type ConsumerRuntimeProfileState =
  | { status: "idle"; profile: null; errorCode: null }
  | { status: "loading"; profile: null; errorCode: null }
  | { status: "available"; profile: ConsumerProfile; errorCode: null }
  | { status: "notFound"; profile: null; errorCode: "profile_not_found" }
  | { status: "error"; profile: null; errorCode: "profile_failed" };

export type ConsumerRuntimeState = {
  authState: ConsumerAuthState;
  operation: ConsumerRuntimeOperation;
  actorKey: string | null;
  actorGeneration: number;
  profileState: ConsumerRuntimeProfileState;
  errorCode: ConsumerRuntimeErrorCode | null;
};

export type ConsumerRuntimeListener = (state: ConsumerRuntimeState) => void;

export type ConsumerRuntimeControllerOptions = {
  authPort: ConsumerAuthPort;
  profileService: Pick<ConsumerProfileService, "getCurrentProfile">;
  refreshLifecycle?: Pick<ConsumerAuthRefreshLifecycle, "initialize" | "dispose"> | null;
};

export class ConsumerAuthProfileRuntime {
  private readonly authStore: ConsumerAuthStateStore;
  private readonly listeners = new Set<ConsumerRuntimeListener>();
  private readonly profileService: ConsumerRuntimeControllerOptions["profileService"];
  private readonly refreshLifecycle: ConsumerRuntimeControllerOptions["refreshLifecycle"];
  private authStoreUnsubscribe: (() => void) | null = null;
  private restorePromise: Promise<void> | null = null;
  private restoring = true;
  private started = false;
  private state: ConsumerRuntimeState = {
    authState: { status: "initializing", session: null },
    operation: "idle",
    actorKey: null,
    actorGeneration: 0,
    profileState: idleProfileState(),
    errorCode: null
  };

  constructor(private readonly options: ConsumerRuntimeControllerOptions) {
    this.authStore = new ConsumerAuthStateStore(options.authPort);
    this.profileService = options.profileService;
    this.refreshLifecycle = options.refreshLifecycle;
  }

  get mode(): ConsumerRuntimeMode {
    if (this.options.authPort.source === "mock") return "mock";
    if (this.options.authPort.source === "supabase-live") return "supabase";
    return "disabled";
  }

  getState() {
    return this.state;
  }

  subscribe(listener: ConsumerRuntimeListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.started) return this.restorePromise ?? Promise.resolve();
    this.started = true;
    this.authStoreUnsubscribe = this.authStore.subscribe((state) => this.handleAuthState(state));
    this.authStore.start();
    this.refreshLifecycle?.initialize();

    if (!this.restorePromise) {
      this.restorePromise = this.authStore.restore().then(() => undefined).finally(() => {
        this.restoring = false;
        this.handleAuthState(this.authStore.getState());
      });
    } else if (!this.restoring) {
      this.handleAuthState(this.authStore.getState());
    }
    return this.restorePromise;
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.authStoreUnsubscribe?.();
    this.authStoreUnsubscribe = null;
    this.authStore.stop();
    this.refreshLifecycle?.dispose();
  }

  async signIn(email: string, password: string) {
    if (this.state.operation !== "idle") return false;
    this.update({ operation: "signingIn", errorCode: null });
    const result = await this.authStore.signIn({ email: email.trim(), password });
    if (result.ok) {
      this.handleAuthState({ status: "signedIn", session: result.value });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async signInDemo() {
    if (this.mode !== "mock" || this.state.operation !== "idle") return false;
    this.update({ operation: "signingIn", errorCode: null });
    const result = await this.authStore.signIn({ mockUserId: "current-user" });
    if (result.ok) {
      this.handleAuthState({ status: "signedIn", session: result.value });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async signOut() {
    if (this.state.operation !== "idle") return false;
    this.update({ operation: "signingOut", errorCode: null });
    const result = await this.authStore.signOut();
    if (result.ok) {
      this.handleAuthState({ status: "signedOut", session: null });
    } else {
      this.update({ errorCode: mapAuthError(result.error) });
    }
    this.update({ operation: "idle" });
    return result.ok;
  }

  async retryProfile() {
    if (!this.state.actorKey || this.state.authState.status !== "signedIn") return false;
    await this.loadProfile(this.state.actorKey, this.state.actorGeneration);
    return this.state.profileState.status === "available";
  }

  private handleAuthState(next: ConsumerAuthState) {
    if (this.restoring && next.status === "signedOut") {
      this.update({ authState: { status: "initializing", session: null } });
      return;
    }

    if (next.status === "signedIn" && next.session) {
      const actorKey = next.session.user.userId;
      if (actorKey !== this.state.actorKey) {
        const actorGeneration = this.state.actorGeneration + 1;
        this.state = {
          ...this.state,
          authState: next,
          actorKey,
          actorGeneration,
          profileState: loadingProfileState(),
          errorCode: null
        };
        this.emit();
        void this.loadProfile(actorKey, actorGeneration);
        return;
      }
      this.update({ authState: next, errorCode: null });
      return;
    }

    if (next.status === "signedOut") {
      this.clearActor(next, null);
      return;
    }
    if (next.status === "disabled") {
      this.clearActor(next, "account_disabled");
      return;
    }
    if (next.status === "error") {
      if (this.state.operation === "signingOut" && this.state.actorKey && this.state.authState.status === "signedIn") {
        this.update({ errorCode: mapAuthError(next.error) });
        return;
      }
      this.clearActor(next, mapAuthError(next.error));
      return;
    }
    this.update({ authState: next });
  }

  private clearActor(authState: ConsumerAuthState, errorCode: ConsumerRuntimeErrorCode | null) {
    const changed = this.state.actorKey !== null || this.state.profileState.status !== "idle";
    this.state = {
      ...this.state,
      authState,
      actorKey: null,
      actorGeneration: changed ? this.state.actorGeneration + 1 : this.state.actorGeneration,
      profileState: idleProfileState(),
      errorCode
    };
    this.emit();
  }

  private async loadProfile(actorKey: string, generation: number) {
    if (actorKey !== this.state.actorKey || generation !== this.state.actorGeneration) return;
    this.update({ profileState: loadingProfileState() });
    const result = await this.profileService.getCurrentProfile();
    if (actorKey !== this.state.actorKey || generation !== this.state.actorGeneration) return;

    if (result.ok) {
      this.update({ profileState: { status: "available", profile: result.value, errorCode: null }, errorCode: null });
      return;
    }
    if (result.error.code === "account_disabled") {
      this.clearActor({ status: "disabled", session: this.state.authState.session, error: result.error }, "account_disabled");
      return;
    }
    if (result.error.code === "profile_not_found") {
      this.update({ profileState: { status: "notFound", profile: null, errorCode: "profile_not_found" } });
      return;
    }
    this.update({ profileState: { status: "error", profile: null, errorCode: "profile_failed" } });
  }

  private update(patch: Partial<ConsumerRuntimeState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state);
  }
}

export type ConsumerRuntimeComposition = {
  flags: ConsumerRuntimeFlags;
  controller: ConsumerAuthProfileRuntime;
};

export type ConsumerRuntimeCompositionResult =
  | { ok: true; value: ConsumerRuntimeComposition }
  | { ok: false; errorCode: "configuration_error" };

export type ConsumerRuntimeCompositionOptions = {
  flags?: ConsumerRuntimeFlags;
  authPort?: ConsumerAuthPort;
  profileService?: Pick<ConsumerProfileService, "getCurrentProfile">;
  refreshLifecycle?: Pick<ConsumerAuthRefreshLifecycle, "initialize" | "dispose"> | null;
};

let appComposition: ConsumerRuntimeCompositionResult | null = null;

export function getOrCreateConsumerRuntimeComposition() {
  if (!appComposition) appComposition = createConsumerRuntimeComposition();
  return appComposition;
}

export function createConsumerRuntimeComposition(options: ConsumerRuntimeCompositionOptions = {}): ConsumerRuntimeCompositionResult {
  const flags = options.flags ?? getConsumerRuntimeFlags();
  if (flags.issues.length) return { ok: false, errorCode: "configuration_error" };
  if (flags.authSource === "supabase-live" && flags.profileSource !== "supabase-live") {
    return { ok: false, errorCode: "configuration_error" };
  }
  if (flags.authSource === "mock" && flags.profileSource !== "mock") {
    return { ok: false, errorCode: "configuration_error" };
  }

  try {
    if (options.authPort && options.profileService) {
      return {
        ok: true,
        value: {
          flags,
          controller: new ConsumerAuthProfileRuntime({
            authPort: options.authPort,
            profileService: options.profileService,
            refreshLifecycle: options.refreshLifecycle
          })
        }
      };
    }

    if (flags.authSource === "supabase-live") {
      const clientFactory = new SupabaseConsumerClientFactory({
        env: getSupabaseConsumerEnvironment(),
        flags,
        storage: createAsyncStorageConsumerAuthStorage(),
        sdkLoader: createOfficialSupabaseConsumerSdkLoader()
      });
      const { client } = clientFactory.getOrCreateClient();
      const authPort = new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true });
      const scaffold = createConsumerAuthScaffold({ flags, authPort, profileClient: client as unknown as SupabaseConsumerProfileClientLike });
      const refreshLifecycle = new ConsumerAuthRefreshLifecycle(client.auth, createReactNativeConsumerAppStateSource());
      return {
        ok: true,
        value: {
          flags,
          controller: new ConsumerAuthProfileRuntime({ authPort, profileService: scaffold.profileService, refreshLifecycle })
        }
      };
    }

    const scaffold = createConsumerAuthScaffold({ flags });
    return {
      ok: true,
      value: {
        flags,
        controller: new ConsumerAuthProfileRuntime({ authPort: scaffold.authPort, profileService: scaffold.profileService })
      }
    };
  } catch {
    return { ok: false, errorCode: "configuration_error" };
  }
}

function mapAuthError(error: ConsumerAuthError | undefined): ConsumerRuntimeErrorCode {
  if (!error) return "authentication_failed";
  if (error.code === "account_disabled") return "account_disabled";
  if (error.code === "configuration_error" || error.code === "provider_not_configured" || error.code === "profile_configuration_invalid") {
    return "configuration_error";
  }
  if (error.code === "operation_not_enabled" || error.code === "email_confirmation_required") return "operation_not_enabled";
  if (error.code === "profile_not_found") return "profile_not_found";
  if (error.code.startsWith("profile_")) return "profile_failed";
  return "authentication_failed";
}

function idleProfileState(): ConsumerRuntimeProfileState {
  return { status: "idle", profile: null, errorCode: null };
}

function loadingProfileState(): ConsumerRuntimeProfileState {
  return { status: "loading", profile: null, errorCode: null };
}
