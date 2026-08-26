import type {
  ConsumerLocationDevicePort,
  ConsumerLocationState
} from "./types";

type RequestToken = Readonly<{ sequence: number; actorKey: string | null; actorGeneration: number }>;

const SIGNED_OUT: ConsumerLocationState = Object.freeze({ phase: "signed_out" } as const);

// GEO-1B current-location controller.
//
// Location is strictly optional. Every failure path — unsupported platform, denied permission,
// disabled location services, an unusable reading — lands in a resting state and changes nothing
// about the rest of the app. Nothing is retried in a loop and no permission dialog is ever raised
// without a user gesture.
//
// SESSION SCOPE IS THE WHOLE PRIVACY MODEL. The coordinate lives in this object and nowhere else:
// not in storage, not in a database, not in any payload this class sends. `setActor` is the single
// entry point for identity changes, and any change of actor OR generation drops the position before
// anything else happens, so a second account on the same handset can never observe the first
// account's location.
export class ConsumerLocationController {
  private readonly listeners = new Set<(state: ConsumerLocationState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private requestSequence = 0;
  private disposed = false;
  private promptedThisSession = false;
  private state: ConsumerLocationState = SIGNED_OUT;

  constructor(private readonly device: ConsumerLocationDevicePort) {}

  getState() { return this.state; }

  subscribe(listener: (state: ConsumerLocationState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  async setActor(actorKey: string | null, actorGeneration: number) {
    if (this.disposed) return;
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    // Invalidating the sequence first means any acquisition already in flight for the previous actor
    // can no longer publish its result.
    this.requestSequence += 1;
    this.promptedThisSession = false;
    if (!actorKey) return this.update(SIGNED_OUT);
    if (!this.device.supported) return this.update(Object.freeze({ phase: "unsupported" }));
    // Deliberately does NOT read the permission state here. Reading it is harmless, but starting a
    // silent acquisition on sign-in is not: a coordinate is only ever taken for a stated purpose.
    this.update(Object.freeze({ phase: "idle" }));
  }

  // The explicit user gesture: ask if needed, then acquire once. At most one prompt per session, so
  // a user who declines is not asked again by the same session.
  async requestAndAcquire(): Promise<boolean> {
    if (this.disposed || !this.actorKey) return false;
    if (!this.device.supported) { this.update(Object.freeze({ phase: "unsupported" })); return false; }

    const request = this.captureRequest();
    let permission = await this.device.getPermission();
    if (!this.isCurrent(request)) return false;

    if (permission.status !== "granted") {
      if (!permission.canAskAgain || this.promptedThisSession) {
        this.update(Object.freeze({ phase: "denied", canAskAgain: permission.canAskAgain }));
        return false;
      }
      this.promptedThisSession = true;
      this.update(Object.freeze({ phase: "prompting" }));
      permission = await this.device.requestPermission();
      if (!this.isCurrent(request)) return false;
      if (permission.status !== "granted") {
        // A refusal is a settled, non-error state. Everything else keeps working exactly as before.
        this.update(Object.freeze({ phase: "denied", canAskAgain: permission.canAskAgain }));
        return false;
      }
    }
    return this.acquire(request);
  }

  // Re-reads the position for an actor that has already granted permission. Never prompts, so it is
  // safe to call from a refresh gesture.
  async refresh(): Promise<boolean> {
    if (this.disposed || !this.actorKey) return false;
    if (!this.device.supported) { this.update(Object.freeze({ phase: "unsupported" })); return false; }
    const request = this.captureRequest();
    const permission = await this.device.getPermission();
    if (!this.isCurrent(request)) return false;
    if (permission.status !== "granted") {
      this.update(Object.freeze({ phase: "denied", canAskAgain: permission.canAskAgain }));
      return false;
    }
    return this.acquire(request);
  }

  private async acquire(request: RequestToken): Promise<boolean> {
    this.update(Object.freeze({ phase: "acquiring" }));
    const enabled = await this.device.hasServicesEnabled();
    if (!this.isCurrent(request)) return false;
    if (!enabled) {
      // Only the user's system settings can resolve this, so it is reported as its own state rather
      // than as a denial or a generic failure.
      this.update(Object.freeze({ phase: "services_disabled" }));
      return false;
    }
    const position = await this.device.getCurrentPosition();
    if (!this.isCurrent(request)) return false;
    if (!position) {
      this.update(Object.freeze({ phase: "failed", errorCode: "position_unavailable" }));
      return false;
    }
    this.update(Object.freeze({ phase: "available", position }));
    return true;
  }

  // Forgets the current coordinate without changing the permission decision. The user stays opted
  // in; the app simply stops holding a position it no longer needs.
  clear() {
    if (this.disposed || !this.actorKey) return;
    this.requestSequence += 1;
    this.update(Object.freeze({ phase: "idle" }));
  }

  dispose() {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.state = SIGNED_OUT;
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
  private update(state: ConsumerLocationState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
