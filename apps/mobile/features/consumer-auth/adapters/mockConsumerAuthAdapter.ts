import { ConsumerAccountDisabledError, ConsumerSessionExpiredError } from "../errors";
import type { ConsumerAuthPort, ConsumerAuthStateListener } from "../ports";
import type { ConsumerAuthSession, ConsumerAuthState, ConsumerAuthUser, ConsumerSignInInput, ConsumerSignUpInput, ConsumerPasswordResetInput } from "../types";
import { err, ok } from "../types";
import type { ConsumerAuthStorage } from "../storage";
import { consumerAuthStorageKeys, MemoryConsumerAuthStorage } from "../storage";

const nowIso = () => new Date().toISOString();

export type MockConsumerAuthAdapterOptions = {
  initialSession?: ConsumerAuthSession | null;
  disabledUserIds?: readonly string[];
  expiredSession?: boolean;
  storage?: ConsumerAuthStorage;
};

export class MockConsumerAuthAdapter implements ConsumerAuthPort {
  readonly source = "mock" as const;
  private session: ConsumerAuthSession | null;
  private readonly listeners = new Set<ConsumerAuthStateListener>();
  private readonly disabledUserIds: Set<string>;
  private readonly storage: ConsumerAuthStorage;
  private expiredSession: boolean;

  constructor(options: MockConsumerAuthAdapterOptions = {}) {
    this.session = options.initialSession ?? null;
    this.disabledUserIds = new Set(options.disabledUserIds ?? []);
    this.expiredSession = options.expiredSession ?? false;
    this.storage = options.storage ?? new MemoryConsumerAuthStorage();
  }

  async getCurrentSession() {
    if (this.expiredSession) return err(new ConsumerSessionExpiredError());
    return ok(this.session);
  }

  observeAuthState(listener: ConsumerAuthStateListener) {
    this.listeners.add(listener);
    listener(this.toState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async signIn(input: ConsumerSignInInput) {
    const userId = input.mockUserId ?? "current-user";
    if (this.disabledUserIds.has(userId)) return err(new ConsumerAccountDisabledError());
    const session = buildMockSession(userId);
    this.session = session;
    this.expiredSession = false;
    await this.storage.setItem(consumerAuthStorageKeys.mockSession, JSON.stringify(session));
    this.emit();
    return ok(session);
  }

  async signUp(input: ConsumerSignUpInput) {
    const userId = slugifyUserId(input.displayName ?? input.email ?? "current-user");
    if (this.disabledUserIds.has(userId)) return err(new ConsumerAccountDisabledError());
    const session = buildMockSession(userId);
    this.session = session;
    await this.storage.setItem(consumerAuthStorageKeys.mockSession, JSON.stringify(session));
    this.emit();
    return ok(session);
  }

  async signOut() {
    this.session = null;
    await this.storage.removeItem(consumerAuthStorageKeys.mockSession);
    this.emit();
    return ok(undefined);
  }

  async refreshSession() {
    if (this.expiredSession) return err(new ConsumerSessionExpiredError());
    if (!this.session) return ok(null);
    this.session = { ...this.session, issuedAt: nowIso() };
    await this.storage.setItem(consumerAuthStorageKeys.mockSession, JSON.stringify(this.session));
    this.emit();
    return ok(this.session);
  }

  async sendPasswordReset(_input: ConsumerPasswordResetInput) {
    return ok(undefined);
  }

  async restoreSession() {
    const raw = await this.storage.getItem(consumerAuthStorageKeys.mockSession);
    if (!raw) return ok(this.session);
    try {
      const parsed = JSON.parse(raw) as ConsumerAuthSession;
      if (!parsed.user?.userId) return ok(this.session);
      this.session = parsed;
      this.emit();
      return ok(this.session);
    } catch {
      return ok(this.session);
    }
  }

  private toState(): ConsumerAuthState {
    if (this.session && this.disabledUserIds.has(this.session.user.userId)) {
      return { status: "disabled", session: this.session, error: new ConsumerAccountDisabledError() };
    }
    return this.session ? { status: "signedIn", session: this.session } : { status: "signedOut", session: null };
  }

  private emit() {
    const state = this.toState();
    for (const listener of this.listeners) listener(state);
  }
}

export function buildMockSession(userId = "current-user"): ConsumerAuthSession {
  const user: ConsumerAuthUser = {
    userId,
    provider: "mock",
    isAnonymous: false,
    emailVerified: true,
    createdAt: "2026-07-12T00:00:00.000Z",
    lastSignedInAt: nowIso()
  };
  return { user, provider: "mock", issuedAt: nowIso() };
}

function slugifyUserId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "current-user";
}