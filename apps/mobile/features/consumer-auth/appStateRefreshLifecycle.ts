import type { SupabaseAuthClientLike } from "./supabaseAuthContracts";

export type ConsumerAppState = "active" | "background" | "inactive" | "unknown";
export type ConsumerAppStateSubscription = { remove(): void };
export type ConsumerAppStateSource = {
  addEventListener(event: "change", listener: (state: ConsumerAppState) => void): ConsumerAppStateSubscription;
};

export class ConsumerAuthRefreshLifecycle {
  private subscription: ConsumerAppStateSubscription | null = null;
  private active = false;

  constructor(private readonly authClient: Pick<SupabaseAuthClientLike, "startAutoRefresh" | "stopAutoRefresh">, private readonly appState: ConsumerAppStateSource) {}

  initialize() {
    if (this.subscription) return;
    this.subscription = this.appState.addEventListener("change", (state) => this.handleState(state));
  }

  dispose() {
    this.subscription?.remove();
    this.subscription = null;
    if (this.active) {
      this.authClient.stopAutoRefresh?.();
      this.active = false;
    }
  }

  handleState(state: ConsumerAppState) {
    if (state === "active") {
      if (!this.active) {
        this.authClient.startAutoRefresh?.();
        this.active = true;
      }
      return;
    }
    if (this.active) {
      this.authClient.stopAutoRefresh?.();
      this.active = false;
    }
  }
}