import type {
  MealBuddyRelationshipAction,
  MealBuddyRelationshipInboxState,
  MealBuddyRelationshipItem,
  MealBuddyRelationshipProfileRelationship,
  MealBuddyRelationshipProfileState,
  MealBuddyRelationshipRepository,
  MealBuddyRelationshipState
} from "./types";

type RequestToken = Readonly<{
  sequence: number;
  actorKey: string | null;
  actorGeneration: number;
  candidateRef?: string | null;
}>;

const PROFILE_SIGNED_OUT = Object.freeze({ phase: "signed_out", errorCode: null } as const);
const INBOX_SIGNED_OUT = Object.freeze({ phase: "signed_out", errorCode: null } as const);

export class MealBuddyRelationshipProfileController {
  private readonly listeners = new Set<(state: MealBuddyRelationshipProfileState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private candidateRef: string | null = null;
  private requestSequence = 0;
  private disposed = false;
  private state: MealBuddyRelationshipProfileState = PROFILE_SIGNED_OUT;

  constructor(private readonly repository: MealBuddyRelationshipRepository) {}

  getState() { return this.state; }

  subscribe(listener: (state: MealBuddyRelationshipProfileState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  async setContext(actorKey: string | null, actorGeneration: number, candidateRef: string | null) {
    if (this.disposed) return;
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration && candidateRef === this.candidateRef) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.candidateRef = candidateRef;
    this.requestSequence += 1;
    if (!actorKey) return this.update(PROFILE_SIGNED_OUT);
    if (!validCandidateRef(candidateRef)) {
      return this.update(Object.freeze({ phase: "load_failed", errorCode: "invalid_request" }));
    }
    await this.load();
  }

  async load() {
    if (this.disposed || !this.actorKey || !validCandidateRef(this.candidateRef)) return false;
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "loading", errorCode: null }));
    const result = await this.repository.read(this.candidateRef);
    if (!this.isCurrent(request)) return false;
    if (!result.ok) {
      this.update(Object.freeze({ phase: "load_failed", errorCode: result.errorCode }));
      return false;
    }
    const relationship = result.value.relationships[0] ?? noneRelationship();
    this.update(readyProfileState(relationship));
    return true;
  }

  async send() { return this.mutate("send", "none"); }
  async accept() { return this.mutate("accept", "incoming_pending"); }
  async decline() { return this.mutate("decline", "incoming_pending"); }
  async cancel() { return this.mutate("cancel", "outgoing_pending"); }
  // Only an ACCEPTED pair can be ended, which is what makes unfriend distinct from cancel/decline.
  async unfriend() { return this.mutate("unfriend", "accepted"); }

  dispose() {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.candidateRef = null;
    this.listeners.clear();
  }

  private async mutate(action: MealBuddyRelationshipAction, requiredState: MealBuddyRelationshipState) {
    if (this.disposed || !this.actorKey || this.state.phase !== "ready"
      || this.state.pendingAction !== null || this.state.relationship.state !== requiredState) return false;
    const request = this.captureRequest();
    const previous = this.state.relationship;
    this.update(Object.freeze({ ...this.state, pendingAction: action, errorCode: null }));
    const result = action === "send"
      ? await this.repository.send(this.candidateRef as string)
      : await this.repository[action](previous.relationshipRef);
    if (!this.isCurrent(request)) return false;
    if (result.ok && result.value.relationships.length === 1) {
      this.update(readyProfileState(result.value.relationships[0] as MealBuddyRelationshipItem));
      return true;
    }

    // A failed mutation may be an uncertain transport outcome. Re-read server authority before
    // permitting another action; the candidate ref stays stable and the attempted payload is never
    // changed or replayed by the controller.
    const reconciliation = await this.repository.read(this.candidateRef as string);
    if (!this.isCurrent(request)) return false;
    const relationship = reconciliation.ok
      ? reconciliation.value.relationships[0] ?? noneRelationship()
      : previous;
    this.update(Object.freeze({
      phase: "ready",
      relationship,
      pendingAction: null,
      errorCode: result.ok ? "invalid_server_response" : result.errorCode
    }));
    return false;
  }

  private captureRequest(): RequestToken {
    return Object.freeze({
      sequence: ++this.requestSequence,
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration,
      candidateRef: this.candidateRef
    });
  }

  private isCurrent(request: RequestToken) {
    return !this.disposed && request.sequence === this.requestSequence
      && request.actorKey === this.actorKey && request.actorGeneration === this.actorGeneration
      && request.candidateRef === this.candidateRef;
  }

  private update(state: MealBuddyRelationshipProfileState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export class MealBuddyRelationshipInboxController {
  private readonly listeners = new Set<(state: MealBuddyRelationshipInboxState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private requestSequence = 0;
  private disposed = false;
  private state: MealBuddyRelationshipInboxState = INBOX_SIGNED_OUT;

  constructor(private readonly repository: MealBuddyRelationshipRepository) {}

  getState() { return this.state; }

  subscribe(listener: (state: MealBuddyRelationshipInboxState) => void) {
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
    if (!actorKey) return this.update(INBOX_SIGNED_OUT);
    await this.load();
  }

  async load() {
    if (this.disposed || !this.actorKey) return false;
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "loading", errorCode: null }));
    const result = await this.repository.list();
    if (!this.isCurrent(request)) return false;
    if (!result.ok) {
      this.update(Object.freeze({ phase: "load_failed", errorCode: result.errorCode }));
      return false;
    }
    this.update(readyInboxState(result.value.relationships));
    return true;
  }

  async accept(relationshipRef: string) { return this.mutate("accept", relationshipRef, "incoming_pending"); }
  async decline(relationshipRef: string) { return this.mutate("decline", relationshipRef, "incoming_pending"); }
  async cancel(relationshipRef: string) { return this.mutate("cancel", relationshipRef, "outgoing_pending"); }
  async unfriend(relationshipRef: string) { return this.mutate("unfriend", relationshipRef, "accepted"); }

  dispose() {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.listeners.clear();
  }

  private async mutate(
    action: "accept" | "decline" | "cancel" | "unfriend",
    relationshipRef: string,
    requiredState: MealBuddyRelationshipState
  ) {
    if (this.disposed || !this.actorKey || this.state.phase !== "ready"
      || this.state.pendingAction !== null || !validRelationshipRef(relationshipRef)) return false;
    const current = this.state.relationships.find((item) => item.relationshipRef === relationshipRef);
    if (!current || current.state !== requiredState) return false;
    const previous = this.state.relationships;
    const request = this.captureRequest();
    this.update(Object.freeze({
      ...this.state,
      pendingRelationshipRef: relationshipRef,
      pendingAction: action,
      errorCode: null
    }));
    const result = await this.repository[action](relationshipRef);
    if (!this.isCurrent(request)) return false;

    const canonicalMutation = result.ok
      ? mergeCanonicalMutation(previous, relationshipRef, result.value.relationships[0])
      : previous;
    const reconciliation = await this.repository.list();
    if (!this.isCurrent(request)) return false;
    this.update(Object.freeze({
      phase: "ready",
      relationships: reconciliation.ok ? reconciliation.value.relationships : canonicalMutation,
      pendingRelationshipRef: null,
      pendingAction: null,
      errorCode: result.ok ? null : result.errorCode
    }));
    return result.ok;
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

  private update(state: MealBuddyRelationshipInboxState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function readyProfileState(relationship: MealBuddyRelationshipProfileRelationship): MealBuddyRelationshipProfileState {
  return Object.freeze({ phase: "ready", relationship, pendingAction: null, errorCode: null });
}

function readyInboxState(relationships: readonly MealBuddyRelationshipItem[]): MealBuddyRelationshipInboxState {
  return Object.freeze({
    phase: "ready",
    relationships: Object.freeze([...relationships]),
    pendingRelationshipRef: null,
    pendingAction: null,
    errorCode: null
  });
}

function noneRelationship(): MealBuddyRelationshipProfileRelationship {
  // No relationship identity exists in this state. The empty value is internal-only and is never
  // sent to the server or rendered; every action that requires mbr1 is state-gated above.
  return Object.freeze({ relationshipRef: "", state: "none", counterpart: null });
}

function validCandidateRef(value: string | null): value is string {
  return typeof value === "string" && value.length > 5 && value.length <= 512 && value.startsWith("scr1.");
}

function validRelationshipRef(value: string): boolean {
  return value.length > 5 && value.length <= 512 && value.startsWith("mbr1.");
}

function mergeCanonicalMutation(
  relationships: readonly MealBuddyRelationshipItem[],
  relationshipRef: string,
  item: MealBuddyRelationshipItem | undefined
) {
  if (!item || item.state === "none") {
    return Object.freeze(relationships.filter((candidate) => candidate.relationshipRef !== relationshipRef));
  }
  return Object.freeze([
    item,
    ...relationships.filter((candidate) => candidate.relationshipRef !== relationshipRef)
  ]);
}
