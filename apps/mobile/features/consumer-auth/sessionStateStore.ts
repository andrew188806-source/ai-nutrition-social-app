import type { ConsumerAuthPort, ConsumerAuthStateListener } from "./ports";
import type { ConsumerAuthState, ConsumerSignInInput, ConsumerSignUpInput } from "./types";

export class ConsumerAuthStateStore {
  private state: ConsumerAuthState = { status: "initializing", session: null };
  private readonly listeners = new Set<ConsumerAuthStateListener>();
  private generation = 0;
  private unsubscribeFromPort: (() => void) | null = null;

  constructor(private readonly authPort: ConsumerAuthPort) {}

  getState() {
    return this.state;
  }

  subscribe(listener: ConsumerAuthStateListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start() {
    if (this.unsubscribeFromPort) return;
    this.unsubscribeFromPort = this.authPort.observeAuthState((state) => this.setState(state));
  }

  stop() {
    this.unsubscribeFromPort?.();
    this.unsubscribeFromPort = null;
  }

  async restore() {
    const generation = ++this.generation;
    const result = await this.authPort.restoreSession();
    if (generation !== this.generation) return result;
    if (result.ok) {
      this.setState(result.value ? { status: "signedIn", session: result.value } : { status: "signedOut", session: null });
    } else {
      this.setState({ status: "error", session: null, error: result.error });
    }
    return result;
  }

  async signIn(input: ConsumerSignInInput = {}) {
    const generation = ++this.generation;
    const result = await this.authPort.signIn(input);
    if (generation === this.generation && !result.ok) this.setState({ status: "error", session: null, error: result.error });
    return result;
  }

  async signUp(input: ConsumerSignUpInput = {}) {
    const generation = ++this.generation;
    const result = await this.authPort.signUp(input);
    if (generation === this.generation && !result.ok) this.setState({ status: "error", session: null, error: result.error });
    return result;
  }

  async refresh() {
    const generation = ++this.generation;
    const result = await this.authPort.refreshSession();
    if (generation !== this.generation) return result;
    if (result.ok) {
      this.setState(result.value ? { status: "signedIn", session: result.value } : { status: "signedOut", session: null });
    } else {
      this.setState({ status: "error", session: null, error: result.error });
    }
    return result;
  }

  async signOut() {
    const generation = ++this.generation;
    const result = await this.authPort.signOut();
    if (generation === this.generation && !result.ok) this.setState({ status: "error", session: null, error: result.error });
    return result;
  }

  private setState(state: ConsumerAuthState) {
    this.generation++;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
