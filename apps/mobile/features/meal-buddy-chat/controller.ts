import {
  MEAL_BUDDY_CHAT_PAGE_SIZE,
  isMealBuddyChatRelationshipRef,
  isSubmittableMealBuddyChatBody,
  type MealBuddyChatConversationRef,
  type MealBuddyChatCursor,
  type MealBuddyChatErrorCode,
  type MealBuddyChatMessage,
  type MealBuddyChatPendingSend,
  type MealBuddyChatRealtimePort,
  type MealBuddyChatRealtimeSubscription,
  type MealBuddyChatRepository,
  type MealBuddyChatState
} from "./types";

type RequestToken = Readonly<{
  sequence: number;
  actorKey: string | null;
  actorGeneration: number;
  relationshipRef: string | null;
}>;

// PC-1: a send acknowledgement belongs to the SESSION (this actor, generation, relationship and
// session epoch), not to the global read sequence. Reads (reconcile, refresh, older pages) advance
// the read sequence freely without orphaning an in-flight send.
type SessionToken = Readonly<{
  epoch: number;
  actorKey: string | null;
  actorGeneration: number;
  relationshipRef: string | null;
}>;

const SIGNED_OUT: MealBuddyChatState = Object.freeze({ phase: "signed_out", errorCode: null } as const);

// A decisive authorization/safety rejection from the frozen server contract. When one of these
// answers open/list/send, the active screen must stop treating already-loaded history as authorized.
function isAuthorizationFailure(code: MealBuddyChatErrorCode): boolean {
  return code === "invalid_request" || code === "authentication_required" || code === "operation_not_enabled";
}

export class MealBuddyChatController {
  private readonly listeners = new Set<(state: MealBuddyChatState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private relationshipRef: string | null = null;
  private requestSequence = 0;
  private disposed = false;
  private state: MealBuddyChatState = SIGNED_OUT;

  // Per-actor session state. None of it is persisted and all of it is dropped on any actor change.
  private conversationRef: MealBuddyChatConversationRef | null = null;
  private cursor: MealBuddyChatCursor | null = null;
  private messages: readonly MealBuddyChatMessage[] = [];
  private pendingSend: MealBuddyChatPendingSend | null = null;

  private realtimeSubscription: MealBuddyChatRealtimeSubscription | null = null;
  private reconciling = false;

  // PC-1 send/reconcile ordering. `sessionEpoch` changes only on teardown (actor change, sign-out,
  // re-open, fail-closed, dispose). While a send is in flight a realtime-driven reconciliation is
  // deferred (never dropped) and runs once the send settles — which the repository bounds by its
  // timeout — so incoming messages are delayed by at most one send, never suppressed.
  private sessionEpoch = 0;
  private sendInFlight = false;
  private reconcileDeferred = false;
  private reconcileGeneration = 0;

  constructor(
    private readonly repository: MealBuddyChatRepository,
    private readonly uuidFactory: () => string,
    private readonly realtime: MealBuddyChatRealtimePort | null = null
  ) {}

  getState() { return this.state; }

  subscribe(listener: (state: MealBuddyChatState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  // Entering the Chat route IS the explicit user intent that lazily opens the conversation.
  // Nothing else in the app may call open().
  async setContext(actorKey: string | null, actorGeneration: number, relationshipRef: string | null) {
    if (this.disposed) return;
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration
      && relationshipRef === this.relationshipRef) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.relationshipRef = relationshipRef;
    this.requestSequence += 1;
    this.resetSessionState();
    if (!actorKey) return this.update(SIGNED_OUT);
    if (!isMealBuddyChatRelationshipRef(relationshipRef)) {
      return this.update(Object.freeze({ phase: "open_failed", errorCode: "invalid_request" } as const));
    }
    await this.openAndLoad();
  }

  async retryOpen() {
    if (this.disposed || !this.actorKey || !isMealBuddyChatRelationshipRef(this.relationshipRef)) return false;
    this.requestSequence += 1;
    this.resetSessionState();
    return this.openAndLoad();
  }

  private async openAndLoad(): Promise<boolean> {
    const request = this.captureRequest();
    this.update(Object.freeze({ phase: "opening", errorCode: null } as const));
    const opened = await this.repository.open(this.relationshipRef as string);
    if (!this.isCurrent(request)) return false;
    if (!opened.ok) {
      this.update(Object.freeze({ phase: "open_failed", errorCode: opened.errorCode }));
      return false;
    }
    this.conversationRef = opened.value.conversation.conversationRef;
    const page = await this.repository.listMessages(this.conversationRef, null, MEAL_BUDDY_CHAT_PAGE_SIZE);
    if (!this.isCurrent(request)) return false;
    if (!page.ok) {
      this.failClosed(page.errorCode);
      return false;
    }
    this.messages = page.value.messages;
    this.cursor = page.value.nextCursor;
    // Subscribing happens only AFTER the server authorized this open, and only for the topic it
    // issued. The topic is never persisted and never reused across an actor or a conversation.
    this.attachRealtime(opened.value.realtimeTopic);
    this.update(this.readyState(page.value.conversation.counterpart, null));
    return true;
  }

  private attachRealtime(topic: string | null) {
    this.detachRealtime();
    if (!this.realtime || !topic) return;
    // The subscription is scoped to the SESSION — this actor, this generation, this relationship —
    // and deliberately NOT to a request sequence. A request token is invalidated by the very next
    // operation, so using one here would silently stop delivery after the first send while leaving
    // the channel open and the screen looking live.
    const session = Object.freeze({
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration,
      relationshipRef: this.relationshipRef
    });
    this.realtimeSubscription = this.realtime.subscribe(topic, () => {
      // A frame is a signal, never message truth. Everything rendered still comes from the frozen
      // canonical API, so an unvalidated or spoofed frame cannot become chat history.
      if (this.disposed) return;
      if (session.actorKey !== this.actorKey || session.actorGeneration !== this.actorGeneration
        || session.relationshipRef !== this.relationshipRef) return;
      void this.reconcile();
    });
  }

  private detachRealtime() {
    const subscription = this.realtimeSubscription;
    this.realtimeSubscription = null;
    if (subscription) subscription.unsubscribe();
  }

  // Canonical reconciliation. It re-opens (which re-authorizes under current server truth) and
  // re-reads the newest page, so a missed frame, a reconnect gap and a duplicate frame all heal the
  // same way. Unlike refresh() it shows no spinner, because the user did not ask for it.
  async reconcile(): Promise<boolean> {
    if (this.disposed || this.state.phase !== "ready") return false;
    // PC-1: never let a list refresh race an in-flight send; run it once the send has settled.
    if (this.sendInFlight) { this.reconcileDeferred = true; return false; }
    // A request that arrives while one is running is queued, not dropped: the running one may be the
    // stale pre-send read that is about to be discarded.
    if (this.reconciling) { this.reconcileDeferred = true; return false; }
    if (!isMealBuddyChatRelationshipRef(this.relationshipRef)) return false;
    this.reconciling = true;
    const request = this.captureRequest();
    const generation = this.reconcileGeneration;
    try {
      const opened = await this.repository.open(this.relationshipRef);
      if (!this.isCurrent(request)) return false;
      if (!opened.ok) { this.failClosed(opened.errorCode); return false; }
      // A send started meanwhile: this page may predate its insert. Drop it; the send settles and
      // then runs a fresh reconciliation.
      if (generation !== this.reconcileGeneration) return false;
      this.conversationRef = opened.value.conversation.conversationRef;
      const page = await this.repository.listMessages(this.conversationRef, null, MEAL_BUDDY_CHAT_PAGE_SIZE);
      if (!this.isCurrent(request)) return false;
      if (generation !== this.reconcileGeneration) return false;
      if (!page.ok) { this.failClosed(page.errorCode); return false; }
      // The canonical page replaces local history wholesale, so the server's ordering is what is
      // rendered and a message already shown cannot appear twice.
      this.messages = page.value.messages;
      this.cursor = page.value.nextCursor;
      if (this.state.phase !== "ready") return false;
      this.update(this.readyState(page.value.conversation.counterpart, null));
      return true;
    } finally {
      this.reconciling = false;
      // Run what was queued while this one was in flight — unless a send now owns the ordering, in
      // which case the send's own completion flushes it.
      if (!this.sendInFlight) this.flushDeferredReconcile();
    }
  }

  // Explicit, user-initiated refresh. There is no timer and no polling anywhere in this controller.
  async refresh(): Promise<boolean> {
    if (this.disposed || this.state.phase !== "ready" || this.state.refreshing) return false;
    if (!isMealBuddyChatRelationshipRef(this.relationshipRef)) return false;
    const request = this.captureRequest();
    this.update(Object.freeze({ ...this.state, refreshing: true, errorCode: null }));
    // Re-open first: it re-authorizes under current server truth and yields a fresh chat reference
    // rather than leaning on a possibly stale one.
    const opened = await this.repository.open(this.relationshipRef);
    if (!this.isCurrent(request)) return false;
    if (!opened.ok) { this.failClosed(opened.errorCode); return false; }
    this.conversationRef = opened.value.conversation.conversationRef;
    const page = await this.repository.listMessages(this.conversationRef, null, MEAL_BUDDY_CHAT_PAGE_SIZE);
    if (!this.isCurrent(request)) return false;
    if (!page.ok) { this.failClosed(page.errorCode); return false; }
    this.messages = page.value.messages;
    this.cursor = page.value.nextCursor;
    this.attachRealtime(opened.value.realtimeTopic);
    this.update(this.readyState(page.value.conversation.counterpart, null));
    return true;
  }

  async loadOlder(): Promise<boolean> {
    if (this.disposed || this.state.phase !== "ready") return false;
    if (this.state.olderPhase === "loading" || this.state.olderPhase === "exhausted") return false;
    if (!this.conversationRef || !this.cursor) {
      this.update(Object.freeze({ ...this.state, olderPhase: "exhausted" as const }));
      return false;
    }
    const request = this.captureRequest();
    const cursor = this.cursor;
    this.update(Object.freeze({ ...this.state, olderPhase: "loading" as const, errorCode: null }));
    const page = await this.repository.listMessages(this.conversationRef, cursor, MEAL_BUDDY_CHAT_PAGE_SIZE);
    if (!this.isCurrent(request)) return false;
    if (!page.ok) {
      if (isAuthorizationFailure(page.errorCode)) { this.failClosed(page.errorCode); return false; }
      if (this.state.phase !== "ready") return false;
      this.update(Object.freeze({ ...this.state, olderPhase: "failed" as const, errorCode: page.errorCode }));
      return false;
    }
    // The server page is ascending (oldest first) and strictly older than the cursor, so an older
    // page is prepended. Deduplicate by canonical message ref so a seam can never double-render.
    const known = new Set(this.messages.map((m) => m.messageRef));
    const older = page.value.messages.filter((m) => !known.has(m.messageRef));
    this.messages = Object.freeze([...older, ...this.messages]);
    this.cursor = page.value.nextCursor;
    if (this.state.phase !== "ready") return false;
    this.update(this.readyState(page.value.conversation.counterpart,
      this.cursor === null ? "exhausted" : "idle"));
    return true;
  }

  // `body` is the composer content for THIS logical message. The key is allocated once here and
  // reused verbatim by retry(); it is never regenerated for a transport retry.
  async send(body: string): Promise<boolean> {
    if (this.disposed || this.state.phase !== "ready" || this.state.pendingSend) return false;
    if (!isSubmittableMealBuddyChatBody(body)) {
      this.update(Object.freeze({ ...this.state, draftRejected: true }));
      return false;
    }
    const pending: MealBuddyChatPendingSend = Object.freeze({
      clientMessageId: this.uuidFactory(),
      body,
      phase: "sending" as const
    });
    return this.dispatchSend(pending);
  }

  // Retrying an uncertain send re-uses the SAME logical message and the SAME key so the server can
  // collapse a possible duplicate. An edited body is a NEW logical send and must go through send().
  async retrySend(): Promise<boolean> {
    if (this.disposed || this.state.phase !== "ready") return false;
    const pending = this.state.pendingSend;
    if (!pending || pending.phase !== "retryable") return false;
    return this.dispatchSend(Object.freeze({ ...pending, phase: "sending" as const }));
  }

  // Abandoning an uncertain send (for example because the user wants to edit the text) discards the
  // key with it; the next attempt is a new logical message.
  discardPendingSend(): boolean {
    if (this.disposed || this.state.phase !== "ready" || !this.state.pendingSend) return false;
    this.pendingSend = null;
    this.update(Object.freeze({ ...this.state, pendingSend: null, errorCode: null }));
    return true;
  }

  clearDraftRejection(): void {
    if (this.disposed || this.state.phase !== "ready" || !this.state.draftRejected) return;
    this.update(Object.freeze({ ...this.state, draftRejected: false }));
  }

  private async dispatchSend(pending: MealBuddyChatPendingSend): Promise<boolean> {
    if (this.state.phase !== "ready" || !this.conversationRef || this.sendInFlight) return false;
    const session = this.captureSession();
    this.pendingSend = pending;
    this.sendInFlight = true;
    // Any list read already in flight may predate this insert; it must not replace history. Its
    // work is re-queued so a fresh reconciliation still runs after the send settles.
    this.reconcileGeneration += 1;
    if (this.reconciling) this.reconcileDeferred = true;
    this.update(Object.freeze({ ...this.state, pendingSend: pending, draftRejected: false, errorCode: null }));
    const result = await this.repository.send(this.conversationRef, pending.clientMessageId, pending.body);
    // A newer session owns the state (teardown already cleared the send and any deferral).
    if (!this.isSessionCurrent(session)) return false;
    this.sendInFlight = false;
    if (this.state.phase !== "ready") return false;

    if (result.ok) {
      // Canonical truth comes from the server response, never from the fact that Send was tapped.
      // The acknowledgement replaces the pending row; dedupe by canonical ref keeps exactly one.
      const known = new Set(this.messages.map((m) => m.messageRef));
      this.messages = known.has(result.value.message.messageRef)
        ? this.messages
        : Object.freeze([...this.messages, result.value.message]);
      this.pendingSend = null;
      this.update(this.readyState(result.value.conversation.counterpart, null));
      this.flushDeferredReconcile();
      return true;
    }
    if (isAuthorizationFailure(result.errorCode)) {
      this.failClosed(result.errorCode);
      return false;
    }
    // Uncertain transport outcome (including the bounded timeout): keep the body AND the key so a
    // retry can be collapsed server-side. Never a permanent "sending".
    const retryable: MealBuddyChatPendingSend = Object.freeze({ ...pending, phase: "retryable" as const });
    this.pendingSend = retryable;
    this.update(Object.freeze({ ...this.state, pendingSend: retryable, errorCode: result.errorCode }));
    this.flushDeferredReconcile();
    return false;
  }

  private flushDeferredReconcile() {
    if (!this.reconcileDeferred) return;
    this.reconcileDeferred = false;
    void this.reconcile();
  }

  private captureSession(): SessionToken {
    return Object.freeze({
      epoch: this.sessionEpoch,
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration,
      relationshipRef: this.relationshipRef
    });
  }

  private isSessionCurrent(session: SessionToken) {
    return !this.disposed && session.epoch === this.sessionEpoch
      && session.actorKey === this.actorKey && session.actorGeneration === this.actorGeneration
      && session.relationshipRef === this.relationshipRef;
  }

  dispose() {
    this.disposed = true;
    this.requestSequence += 1;
    this.actorKey = null;
    this.relationshipRef = null;
    this.resetSessionState();
    this.listeners.clear();
  }

  private failClosed(errorCode: MealBuddyChatErrorCode) {
    this.resetSessionState();
    this.update(Object.freeze({ phase: "unavailable", errorCode }));
  }

  private resetSessionState() {
    // Every teardown path funnels through here — actor change, sign-out, dispose and fail-closed —
    // so a subscription can never leak across actors or outlive its authorization.
    this.detachRealtime();
    this.conversationRef = null;
    this.cursor = null;
    this.messages = [];
    this.pendingSend = null;
    // PC-1: a new session epoch orphans any in-flight send of the old session by construction.
    this.sessionEpoch += 1;
    this.sendInFlight = false;
    this.reconcileDeferred = false;
    this.reconcileGeneration += 1;
  }

  private readyState(
    counterpart: MealBuddyChatState extends never ? never : { displayName: string; mascotAvatarKey: string },
    olderPhase: "idle" | "exhausted" | null
  ): MealBuddyChatState {
    return Object.freeze({
      phase: "ready" as const,
      counterpart: Object.freeze({ ...counterpart }),
      messages: this.messages,
      olderPhase: olderPhase ?? (this.cursor === null ? "exhausted" : "idle"),
      refreshing: false,
      pendingSend: this.pendingSend,
      draftRejected: false,
      live: this.realtimeSubscription !== null,
      errorCode: null
    });
  }

  private captureRequest(): RequestToken {
    return Object.freeze({
      sequence: ++this.requestSequence,
      actorKey: this.actorKey,
      actorGeneration: this.actorGeneration,
      relationshipRef: this.relationshipRef
    });
  }

  private isCurrent(request: RequestToken) {
    return !this.disposed && request.sequence === this.requestSequence
      && request.actorKey === this.actorKey && request.actorGeneration === this.actorGeneration
      && request.relationshipRef === this.relationshipRef;
  }

  private update(state: MealBuddyChatState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
