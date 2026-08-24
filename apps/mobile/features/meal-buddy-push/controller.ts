import type {
  MealBuddyPushDevicePort,
  MealBuddyPushRepository,
  MealBuddyPushState
} from "./types";

type RequestToken = Readonly<{ sequence: number; actorKey: string | null; actorGeneration: number }>;

const SIGNED_OUT: MealBuddyPushState = Object.freeze({ phase: "signed_out" } as const);

// SR-2K-B push registration controller.
//
// Push is strictly optional infrastructure. Every failure path — unsupported platform, denied
// permission, missing token, provider or server error — lands in a resting state and changes nothing
// about relationships, chat or the rest of Social. Nothing is retried in a loop and no permission
// prompt is ever raised twice on its own.
export class MealBuddyPushController {
  private readonly listeners = new Set<(state: MealBuddyPushState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private requestSequence = 0;
  private disposed = false;
  private promptedThisSession = false;
  private state: MealBuddyPushState = SIGNED_OUT;

  constructor(
    private readonly repository: MealBuddyPushRepository,
    private readonly device: MealBuddyPushDevicePort,
    private readonly installId: string
  ) {}

  getState() { return this.state; }

  subscribe(listener: (state: MealBuddyPushState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  async setActor(actorKey: string | null, actorGeneration: number) {
    if (this.disposed) return;
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.requestSequence += 1;
    // A new actor never inherits the previous actor's prompt history or registration state.
    this.promptedThisSession = false;
    if (!actorKey) return this.update(SIGNED_OUT);
    this.update(Object.freeze({ phase: "idle" }));
    await this.syncExistingPermission();
  }

  // Registers only when permission was ALREADY granted. It never prompts, so it is safe to call on
  // every sign-in without harassing a user who declined.
  private async syncExistingPermission() {
    if (this.device.platform === null) return this.update(Object.freeze({ phase: "unsupported" }));
    const request = this.captureRequest();
    const status = await this.device.getPermission();
    if (!this.isCurrent(request)) return;
    if (status === "granted") { await this.register(); return; }
    if (status === "denied") this.update(Object.freeze({ phase: "denied" }));
  }

  // The explicit user gesture. One prompt per session at most.
  async requestPermissionAndRegister(): Promise<boolean> {
    if (this.disposed || !this.actorKey) return false;
    if (this.device.platform === null) { this.update(Object.freeze({ phase: "unsupported" })); return false; }
    if (this.promptedThisSession) return false;
    this.promptedThisSession = true;
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "prompting" }));
    const status = await this.device.requestPermission();
    if (!this.isCurrent(request)) return false;
    if (status !== "granted") {
      // A refusal is a settled, non-error state. Social keeps working exactly as before.
      this.update(Object.freeze({ phase: "denied" }));
      return false;
    }
    return this.register();
  }

  private async register(): Promise<boolean> {
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "registering" }));
    const platform = this.device.platform;
    if (platform === null) { this.update(Object.freeze({ phase: "unsupported" })); return false; }
    const token = await this.device.getPushToken();
    if (!this.isCurrent(request)) return false;
    if (!token) {
      // No token is obtainable on this build or device. Not a failure the user can act on.
      this.update(Object.freeze({ phase: "unsupported" }));
      return false;
    }
    const outcome = await this.repository.register(this.installId, platform, token);
    if (!this.isCurrent(request)) return false;
    if (!outcome.ok) {
      this.update(Object.freeze({ phase: "failed", errorCode: outcome.errorCode }));
      return false;
    }
    this.update(Object.freeze({ phase: "registered" }));
    return true;
  }

  // Sign-out disables THIS installation server-side, so a device that changes hands, or a shared
  // handset, cannot keep receiving the previous account's notifications.
  async disableForSignOut(): Promise<boolean> {
    if (this.disposed || !this.actorKey) return false;
    const outcome = await this.repository.disable(this.installId);
    return outcome.ok;
  }

  dispose() {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.listeners.clear();
  }

  private captureRequest(): RequestToken {
    return Object.freeze({
      sequence: ++this.requestSequence,
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration
    });
  }
  private isCurrent(request: RequestToken) {
    return !this.disposed && request.sequence === this.requestSequence
      && request.actorKey === this.actorKey && request.actorGeneration === this.actorGeneration;
  }
  private update(state: MealBuddyPushState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
