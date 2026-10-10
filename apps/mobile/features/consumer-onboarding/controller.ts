import { ACTOR_BINDING_HEADER } from "../consumer-auth/actorBoundDispatch";
import { ConsumerEmailOtpController } from "../consumer-auth/emailOtpController";
import type { ConsumerAuthPort } from "../consumer-auth/ports";
import { confirmationCodeFromUrl } from "./authRedirect";
import { parseDemoDraftState, parseParticipationState, parseRequiredBundle, type OnboardingRpcClient, type OnboardingSnapshot, type RequiredBundle } from "./types";
export type OnboardingAuthPort = ConsumerAuthPort & { completeEmailConfirmation?: (code: string) => ReturnType<ConsumerAuthPort["signUp"]> };
export type OnboardingOptions = { authPort: OnboardingAuthPort; client: OnboardingRpcClient; redirect: string | null; invalidateAccess: () => void; timeoutMs?: number; demoModeAllowed?: boolean };
const initial = (): OnboardingSnapshot => ({ demoStatus: "idle", demoEnvironment: null, demo: null, documentStatus: "idle", bundle: null, state: null, pending: false, uncertain: false, error: null });
export class ConsumerOnboardingController {
  private snapshot = initial(); private actor: string | null = null; private scope = ""; private epoch = 0; private sequence = 0;
  private listeners = new Set<() => void>();
  readonly emailOtp: ConsumerEmailOtpController;
  constructor(private readonly options: OnboardingOptions) { this.emailOtp = new ConsumerEmailOtpController(options.authPort); }
  getSnapshot = () => this.snapshot;
  isBoundTo = (actor: string | null, generation: number) => this.scope === (actor ?? "") + ":" + generation;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<OnboardingSnapshot>) { this.snapshot = Object.freeze({ ...this.snapshot, ...patch }); for (const l of this.listeners) l(); }
  bindScope(actor: string | null, generation: number) { const scope = `${actor ?? ""}:${generation}`; if (scope === this.scope) return; this.scope = scope; this.actor = actor; this.epoch++; this.sequence++; this.snapshot = initial(); this.emit({}); void this.refresh(); }
  private async rpc(name: string, args?: Record<string, unknown>) { const r = await this.options.client.rpc(name, args); if (r.error) throw new Error("Canonical request failed"); return r.data; }
  private async sessionActor(expected = this.actor) { const r = await this.options.authPort.getCurrentSession(); if (expected !== this.actor || !r.ok || !r.value || r.value.user.userId !== expected) throw new Error("Actor changed"); }
  private async run(action: () => Promise<void>, uncertainOnFailure = false) {
    if (this.snapshot.pending) return false;
    const epoch = this.epoch, sequence = ++this.sequence;
    const current = () => epoch === this.epoch && sequence === this.sequence;
    this.emit({ pending: true, error: null, ...(uncertainOnFailure ? { state: null, uncertain: true } : {}) });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([action(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PC2_TIMEOUT")), this.options.timeoutMs ?? 12000); })]);
      if (!current()) return false;
      this.emit({ pending: false }); return true;
    } catch (error) {
      if (!current()) return false;
      this.sequence++; // Late transport completions may not restore eligibility after timeout.
      this.emit({ pending: false, error: error instanceof Error && error.message === "PC2_TIMEOUT" ? "timeout" : "request_failed", ...(uncertainOnFailure ? { state: null, uncertain: true } : {}) }); return false;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async refresh() {
    if (this.snapshot.pending) return false;
    const epoch = this.epoch; const sequence = this.sequence + 1;
    const current = () => epoch === this.epoch && sequence === this.sequence;
    this.emit({ documentStatus: "loading", bundle: null, ...(this.options.demoModeAllowed ? { demoStatus: "loading" as const, demo: null, demoEnvironment: null } : {}) });
    const result = await this.run(async () => {
      if (this.options.demoModeAllowed) {
        if (this.actor) {
          await this.sessionActor();
          const demo = parseDemoDraftState(await this.rpc("get_authenticated_demo_draft_state"));
          await this.sessionActor();
          if (current()) this.emit({ demo, demoEnvironment: demo.demoEnabled, demoStatus: "ready" });
          if (demo.demoEnabled) { if (current()) this.emit({ state: demo.participationState, bundle: null, documentStatus: "unavailable", uncertain: false, error: null }); return; }
        } else {
          const value = await this.rpc("get_consumer_demo_environment") as { demoEnabled?: unknown; projectRef?: unknown };
          if (typeof value?.demoEnabled !== "boolean" || value.projectRef !== "msbgnnoorsoefuiwluye") throw new Error("Invalid demo environment");
          if (current()) this.emit({ demoEnvironment: value.demoEnabled, demoStatus: "ready" });
          if (value.demoEnabled) { if (current()) this.emit({ state: null, bundle: null, documentStatus: "unavailable", uncertain: false, error: null }); return; }
        }
      }
      let bundle: RequiredBundle | null;
      try {
        bundle = parseRequiredBundle(await this.rpc("get_consumer_required_documents"));
      } catch (error) {
        if (current()) this.emit({ documentStatus: "error", bundle: null });
        throw error;
      }
      if (current()) this.emit({ bundle, documentStatus: bundle ? "available" : "unavailable" });
      let state = null;
      if (this.actor) { await this.sessionActor(); state = parseParticipationState(await this.rpc("get_authenticated_consumer_participation_state")); await this.sessionActor(); }
      if (current()) this.emit({ bundle, state, uncertain: false, error: bundle ? null : "unavailable" });
    }, true);
    // run advances the sequence on timeout: late document responses cannot revive the view.
    if (!result && epoch === this.epoch && this.snapshot.documentStatus === "loading") this.emit({ documentStatus: "error", bundle: null, ...(this.options.demoModeAllowed ? { demoStatus: "error" as const } : {}) });
    return result;
  }
  async confirmDemo() {
    if (!this.actor || this.snapshot.pending || !this.options.demoModeAllowed || !this.snapshot.demo?.demoEnabled) return false;
    const actor = this.actor, epoch = this.epoch, sequence = this.sequence + 1;
    const result = await this.run(async () => {
      await this.sessionActor(actor);
      if (epoch !== this.epoch || sequence !== this.sequence) throw new Error("Actor changed");
      const builder = this.options.client.rpc("confirm_authenticated_demo_draft", { p_confirm: true }) as PromiseLike<{ data: unknown; error: unknown }> & { setHeader?: (name: string, value: string) => unknown };
      if (typeof builder.setHeader !== "function") throw new Error("Actor binding unavailable");
      builder.setHeader(ACTOR_BINDING_HEADER, actor);
      const response = await builder;
      if (response.error) throw new Error("Demo confirmation failed");
      const demo = parseDemoDraftState(response.data);
      await this.sessionActor(actor);
      if (!demo.demoEnabled || !demo.confirmed || !demo.participationState.coreEligible) throw new Error("Demo confirmation not established");
      if (epoch === this.epoch && sequence === this.sequence) this.emit({ demo, demoStatus: "ready", state: demo.participationState, uncertain: false, error: null });
    }, true);
    if (result) this.options.invalidateAccess();
    return result;
  }
  async signUp(email: string, password: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 8 || password.length > 128) { this.emit({ error: "invalid_input" }); return false; }
    if (!this.snapshot.bundle || !this.options.redirect || this.actor) { this.emit({ error: "unavailable" }); return false; }
    const epoch = this.epoch, sequence = this.sequence + 1;
    return this.run(async () => {
      const docs = parseRequiredBundle(await this.rpc("get_consumer_required_documents"));
      if (!docs || docs.bundleVersion !== this.snapshot.bundle?.bundleVersion) throw new Error("Documents unavailable");
      const r = await this.options.authPort.signUp({ email: email.trim(), password });
      if (epoch !== this.epoch || sequence !== this.sequence) return;
      if (!r.ok) { if (r.error.code === "email_confirmation_required") this.emit({ error: "confirmation_required" }); else throw new Error("Signup failed"); }
      // Auth adapter's existing observer drives authenticated resume; never bootstrap without session.
    });
  }
  async completeCallback(url: string) {
    const code = confirmationCodeFromUrl(url, this.options.redirect);
    if (!code || !this.options.authPort.completeEmailConfirmation) { this.emit({ error: "invalid_input" }); return false; }
    return this.run(async () => { const r = await this.options.authPort.completeEmailConfirmation!(code); if (!r.ok) throw new Error("Confirmation failed"); });
  }
  private presented(bundle: RequiredBundle, trainingOnly: boolean) { return bundle.documents.filter((d) => !trainingOnly || d.documentId === "ai-training-terms").map(({ documentId, version, contentSha256 }) => ({ documentId, version, contentSha256 })).sort((a, b) => a.documentId.localeCompare(b.documentId)); }
  async complete(name: string, terms: boolean, privacy: boolean, training: boolean) {
    if (!terms || !privacy || !training || !this.snapshot.bundle) { this.emit({ error: "invalid_input" }); return false; }
    const b = this.snapshot.bundle;
    return this.mutate("complete_authenticated_consumer_account_onboarding", { p_bundle_version: b.bundleVersion, p_presented_documents: this.presented(b, false), p_accept_terms: terms, p_acknowledge_privacy: privacy, p_grant_training: training, p_display_name: name || null });
  }
  async regrant(explicit: boolean) { const b = this.snapshot.bundle; if (!explicit || !b) { this.emit({ error: "invalid_input" }); return false; } return this.mutate("grant_authenticated_ai_training_consent", { p_bundle_version: b.bundleVersion, p_presented_documents: this.presented(b, true), p_grant_training: true }); }
  withdraw() { return this.mutate("withdraw_authenticated_ai_training_consent"); }
  attest(adult: boolean) { return this.mutate("attest_authenticated_social_adult", { p_attested_18_plus: adult }); }
  participation(action: "opt_in" | "pause" | "resume" | "opt_out") { const names = { opt_in: "opt_in_authenticated_social_participation", pause: "pause_authenticated_social_participation", resume: "resume_authenticated_social_participation", opt_out: "opt_out_authenticated_social_participation" }; return this.mutate(names[action]); }
  private async mutate(name: string, args?: Record<string, unknown>) {
    if (!this.actor || this.snapshot.pending) return false;
    const epoch = this.epoch, sequence = this.sequence + 1;
    const result = await this.run(async () => {
      await this.sessionActor(); await this.rpc(name, args); await this.sessionActor();
      const state = parseParticipationState(await this.rpc("get_authenticated_consumer_participation_state")); await this.sessionActor();
      if (epoch === this.epoch && sequence === this.sequence) this.emit({ state, uncertain: false });
    }, true);
    // Clear actor-bound caches/references for every attempted mutation, including uncertain outcomes.
    this.options.invalidateAccess();
    return result;
  }
}

// All static and server-backed feature routes use the same canonical core state. Recovery is explicit.
export const PC2_RECOVERY_ROUTES = Object.freeze(["login", "auth-callback", "onboarding", "consent-document", "account-support", "participation-settings"]);
export function pc2RouteDestination(route: string, authenticated: boolean, snapshot: OnboardingSnapshot): string | null {
  if (PC2_RECOVERY_ROUTES.includes(route)) return null;
  if (!authenticated) return "/login";
  if (snapshot.demoEnvironment === true && (!snapshot.demo?.confirmed || snapshot.demoStatus !== "ready")) return "/onboarding";
  if (!snapshot.state?.coreEligible || snapshot.uncertain) return "/onboarding";
  if (["meal-buddies", "meal-buddy-candidate-profile", "meal-buddy-chat", "community-card", "community-card-settings", "social"].includes(route) && !snapshot.state.socialEligible) return "/participation-settings";
  return null;
}
