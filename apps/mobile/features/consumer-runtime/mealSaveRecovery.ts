// TastKind meal-save recovery policy — PURE module (no I/O, no React, no SDK).
//
// One policy shared by the normal-save runtime and the photo-finalization runtime:
//   * how an attempt outcome is classified,
//   * how the persisted operation entry changes (the sticky-unknown rule),
//   * what the user is shown (copy key, executable actions, local reference code),
//   * the local wait (the ONLY timer in the recovery stack — it is not a retry).
//
// Safety rules encoded here (see the approved scope, final-r2):
//   1. An operation that ever had an unknown result stays unknown: a later rollback, denial,
//      conflict, `not_sent` or consent failure proves nothing about the earlier attempt. Only a
//      trusted success removes it.
//   2. The local wait only means "stop waiting here". It never says the server cancelled or did
//      not write.
//   3. Nothing here deletes an unknown operation, creates a key, or sends anything.

export const MEAL_SAVE_SLOT_COUNT = 20;
export const MEAL_SAVE_MAX_ENTRY_BYTES = 256 * 1024;
export const MEAL_SAVE_LOCAL_WAIT_MS = 30_000;
export const MEAL_SAVE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type MealSaveOperationKind = "meal_write" | "finalization";

// new       = persisted, never dispatched
// inflight  = an attempt may be on the wire (journal written before dispatch)
// unknown   = result not known (sticky)
// retryable = confirmed rolled back by a structured server answer, no unknown history
// blocked_* = confirmed not written, waiting for login / consent, no unknown history
export type MealSaveEntryState = "new" | "inflight" | "unknown" | "retryable" | "blocked_login" | "blocked_consent";

export type MealSaveReason = "transport" | "deadline" | "unreadable" | "login" | "consent" | "server" | "invalid" | "conflict";

export type MealSaveOutcomeClass =
  | "saved"
  | "unknown"
  | "rolled_back"
  | "needs_login"
  | "needs_consent"
  | "server_fault"
  | "rejected_input"
  | "conflict"
  | "not_sent";

export type MealSaveAttemptMeta = {
  reason?: MealSaveReason | null;
  sqlstate?: string | null;
  httpStatus?: number | null;
};

export type MealSaveEntry<TInput> = {
  schema: 2;
  opId: string;
  kind: MealSaveOperationKind;
  ownerActorKey: string;
  seq: number;
  input: TInput;
  createdAt: string;
  expiresAt: string;
  state: MealSaveEntryState;
  priorState: MealSaveEntryState | null;
  deferred: boolean;
  hadUnknown: boolean;
  attempts: number;
  lastReason: MealSaveReason | null;
  lastSqlstate: string | null;
  lastHttpStatus: number | null;
  lastAttemptAt: string | null;
};

export type MealSaveAction = "retry" | "defer" | "cancel" | "login" | "consent";

export type MealSaveCopyKey =
  | "unknown"
  | "unknownLogin"
  | "unknownConsent"
  | "unknownServer"
  | "unknownAnomaly"
  | "retryable"
  | "blockedLogin"
  | "blockedConsent"
  | "submitting";

export type MealSaveOperationSummary = {
  opId: string;
  kind: MealSaveOperationKind;
  state: MealSaveEntryState;
  hadUnknown: boolean;
  deferred: boolean;
  stale: boolean;
  inFlight: boolean;
  reason: MealSaveReason | null;
  copyKey: MealSaveCopyKey;
  actions: readonly MealSaveAction[];
  // Display-only label of the user's own meal (never part of the reference code, never logged).
  label: string;
  mealType: string | null;
  createdAt: string;
  reference: string;
};

const entryStates: readonly MealSaveEntryState[] = ["new", "inflight", "unknown", "retryable", "blocked_login", "blocked_consent"];
const reasons: readonly MealSaveReason[] = ["transport", "deadline", "unreadable", "login", "consent", "server", "invalid", "conflict"];

export function isMealSaveEntryState(value: unknown): value is MealSaveEntryState {
  return typeof value === "string" && (entryStates as readonly string[]).includes(value);
}

export function isMealSaveReason(value: unknown): value is MealSaveReason {
  return typeof value === "string" && (reasons as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Outcome table (sticky history)
// ---------------------------------------------------------------------------------------------

export type MealSaveEntryTransition<TInput> =
  | { action: "remove" }
  | { action: "update"; entry: MealSaveEntry<TInput> };

export function applyAttemptOutcome<TInput>(
  entry: MealSaveEntry<TInput>,
  outcome: { cls: MealSaveOutcomeClass; meta?: MealSaveAttemptMeta },
  nowIso: string
): MealSaveEntryTransition<TInput> {
  const meta = outcome.meta ?? {};
  if (outcome.cls === "saved") return { action: "remove" };
  if (outcome.cls === "not_sent") {
    // The guard/owner check refused BEFORE any network call: the attempt did not happen. It neither
    // adds nor clears unknown history; the journal state returns to what it was.
    const restored: MealSaveEntryState = entry.priorState && entry.priorState !== "inflight" ? entry.priorState : entry.hadUnknown ? "unknown" : "retryable";
    return { action: "update", entry: { ...entry, state: restored, priorState: null, attempts: Math.max(0, entry.attempts - 1) } };
  }
  const had = entry.hadUnknown;
  const stamped: MealSaveEntry<TInput> = {
    ...entry,
    priorState: null,
    lastSqlstate: meta.sqlstate ?? null,
    lastHttpStatus: meta.httpStatus ?? null,
    lastAttemptAt: nowIso
  };
  const unknownWith = (reason: MealSaveReason): MealSaveEntryTransition<TInput> => ({
    action: "update",
    entry: { ...stamped, state: "unknown", hadUnknown: true, lastReason: reason }
  });
  switch (outcome.cls) {
    case "unknown":
      return unknownWith(meta.reason ?? "transport");
    case "rolled_back":
    case "server_fault":
      return had ? unknownWith("server") : { action: "update", entry: { ...stamped, state: "retryable", lastReason: "server" } };
    case "needs_login":
      return had ? unknownWith("login") : { action: "update", entry: { ...stamped, state: "blocked_login", lastReason: "login" } };
    case "needs_consent":
      return had ? unknownWith("consent") : { action: "update", entry: { ...stamped, state: "blocked_consent", lastReason: "consent" } };
    case "rejected_input":
      return had ? unknownWith("invalid") : { action: "remove" };
    case "conflict":
      return had ? unknownWith("conflict") : { action: "remove" };
    default:
      return unknownWith("transport");
  }
}

// A NEW save is blocked only by an operation that may still have committed and that the user has not
// set aside. Known-not-written drafts and deferred operations never block.
export function blocksNewSave(entry: { hadUnknown: boolean; deferred: boolean }): boolean {
  return entry.hadUnknown && !entry.deferred;
}

// A draft the user may cancel: no unknown history, not on the wire.
export function isCancellable(entry: { hadUnknown: boolean; state: MealSaveEntryState }, inFlight: boolean): boolean {
  if (inFlight || entry.hadUnknown) return false;
  return entry.state === "new" || entry.state === "retryable" || entry.state === "blocked_login" || entry.state === "blocked_consent";
}

// ---------------------------------------------------------------------------------------------
// Error-code classification (typed errors of both repositories)
// ---------------------------------------------------------------------------------------------

export type MealSaveClassification = { cls: MealSaveOutcomeClass; meta: MealSaveAttemptMeta; localFailure?: "disabled" | "configuration" };

export function classifyMealWriteErrorCode(code: string, message: string, sqlstate: string | null = null): MealSaveClassification {
  const meta = (reason: MealSaveReason | null): MealSaveAttemptMeta => ({ reason, sqlstate });
  if (code === "meal_write_transport_failed") return { cls: "unknown", meta: meta("transport") };
  if (code === "meal_write_mapping_failed" || code === "meal_write_read_after_write_failed") return { cls: "unknown", meta: meta("unreadable") };
  if (code === "meal_write_authentication_required" || code === "meal_write_authorization_failed" || code === "session_expired") return { cls: "needs_login", meta: meta("login") };
  if (code === "meal_write_eligibility_required") return { cls: "needs_consent", meta: meta("consent") };
  if (code === "meal_write_actor_binding_mismatch") return { cls: "not_sent", meta: meta(null) };
  if (code === "meal_write_server_rejected") return { cls: "server_fault", meta: meta("server") };
  if (code === "meal_write_disabled" || code === "meal_write_phase_not_enabled") return { cls: "rejected_input", meta: meta(null), localFailure: "disabled" };
  if (code === "meal_write_configuration_invalid") return { cls: "rejected_input", meta: meta(null), localFailure: "configuration" };
  if (code === "meal_write_function_rejected" && message.toLowerCase().includes("idempotency")) return { cls: "conflict", meta: meta("conflict") };
  if (code === "meal_write_function_rejected" || code.startsWith("meal_write_invalid") || code === "meal_write_payload_too_large" || code === "meal_write_ownership_field_rejected") {
    return { cls: "rejected_input", meta: meta("invalid") };
  }
  return { cls: "server_fault", meta: meta("server") };
}

const finalizationServerFaultCodes = new Set([
  "finalization_ownership_or_authorization_rejected",
  "finalization_durable_state_inconsistency"
]);

// `structured` marks a transport-typed error that carried a server error code: the RPC ended in rollback (server fault).
export function classifyFinalizationErrorCode(code: string, sqlstate: string | null = null, structured = false): MealSaveClassification {
  const meta = (reason: MealSaveReason | null): MealSaveAttemptMeta => ({ reason, sqlstate });
  if (code === "finalization_transport_failed") return structured ? { cls: "server_fault", meta: meta("server") } : { cls: "unknown", meta: meta("transport") };
  if (code === "finalization_response_malformed") return { cls: "unknown", meta: meta("unreadable") };
  if (code === "finalization_authentication_required" || code === "finalization_authentication_failed") return { cls: "needs_login", meta: meta("login") };
  if (code === "finalization_eligibility_required") return { cls: "needs_consent", meta: meta("consent") };
  if (code === "finalization_actor_binding_mismatch") return { cls: "not_sent", meta: meta(null) };
  if (code === "finalization_idempotency_conflict") return { cls: "conflict", meta: meta("conflict") };
  if (code === "finalization_disabled") return { cls: "rejected_input", meta: meta(null), localFailure: "disabled" };
  if (code === "finalization_configuration_invalid") return { cls: "rejected_input", meta: meta(null), localFailure: "configuration" };
  if (finalizationServerFaultCodes.has(code)) return { cls: "server_fault", meta: meta("server") };
  return { cls: "rejected_input", meta: meta("invalid") };
}

// ---------------------------------------------------------------------------------------------
// Presentation (copy key + executable actions + reference code)
// ---------------------------------------------------------------------------------------------

function copyKeyOf(entry: { state: MealSaveEntryState; lastReason: MealSaveReason | null }, inFlight: boolean): MealSaveCopyKey {
  if (inFlight || entry.state === "inflight") return "submitting";
  switch (entry.state) {
    case "unknown":
      if (entry.lastReason === "login") return "unknownLogin";
      if (entry.lastReason === "consent") return "unknownConsent";
      if (entry.lastReason === "server") return "unknownServer";
      if (entry.lastReason === "invalid" || entry.lastReason === "conflict") return "unknownAnomaly";
      return "unknown";
    case "blocked_login":
      return "blockedLogin";
    case "blocked_consent":
      return "blockedConsent";
    default:
      return "retryable";
  }
}

function actionsOf(entry: { state: MealSaveEntryState; hadUnknown: boolean; lastReason: MealSaveReason | null }, inFlight: boolean): readonly MealSaveAction[] {
  if (inFlight || entry.state === "inflight") return [];
  const out: MealSaveAction[] = [];
  const anomaly = entry.state === "unknown" && (entry.lastReason === "invalid" || entry.lastReason === "conflict");
  if (!anomaly) out.push("retry");
  if (entry.state === "blocked_login" || (entry.state === "unknown" && entry.lastReason === "login")) out.push("login");
  if (entry.state === "blocked_consent" || (entry.state === "unknown" && entry.lastReason === "consent")) out.push("consent");
  // Unknown operations may be set aside (暫不處理) but never cancelled; known-not-written drafts may be cancelled.
  if (entry.hadUnknown) out.push("defer");
  else out.push("cancel");
  return out;
}

const classCode: Record<MealSaveEntryState, string> = {
  new: "NW",
  inflight: "IF",
  unknown: "UK",
  retryable: "RT",
  blocked_login: "BL",
  blocked_consent: "BC"
};

// Diagnostic only: kind, state class, SQLSTATE / NET / DLN, 8 hex of the random operation UUID.
// Never an account, meal, photo, token or payload; never an authority or the only operation id.
export function buildMealSaveReference(entry: {
  kind: MealSaveOperationKind;
  opId: string;
  state: MealSaveEntryState;
  hadUnknown: boolean;
  lastReason: MealSaveReason | null;
  lastSqlstate: string | null;
}): string {
  const klass = entry.state === "unknown" && entry.lastReason && entry.lastReason !== "transport" && entry.lastReason !== "deadline" && entry.lastReason !== "unreadable" ? "UB" : classCode[entry.state];
  let signal = "—";
  if (entry.lastSqlstate && /^[0-9A-Za-z]{5}$/.test(entry.lastSqlstate)) signal = entry.lastSqlstate.toUpperCase();
  else if (entry.lastReason === "deadline") signal = "DLN";
  else if (entry.lastReason === "transport" || entry.lastReason === "unreadable") signal = "NET";
  const short = entry.opId.replace(/[^0-9a-fA-F]/g, "").slice(0, 8).toLowerCase();
  return `TK-${entry.kind === "meal_write" ? "N" : "F"}-${klass}-${signal}-${short}`;
}

export function summarizeMealSaveEntry<TInput>(
  entry: MealSaveEntry<TInput>,
  context: { nowMs: number; inFlight: boolean; describe: (input: TInput) => { label: string; mealType: string | null } }
): MealSaveOperationSummary {
  const described = context.describe(entry.input);
  const createdMs = Date.parse(entry.createdAt);
  return {
    opId: entry.opId,
    kind: entry.kind,
    state: entry.state,
    hadUnknown: entry.hadUnknown,
    deferred: entry.deferred,
    stale: Number.isFinite(createdMs) && context.nowMs - createdMs > MEAL_SAVE_STALE_AFTER_MS,
    inFlight: context.inFlight,
    reason: entry.lastReason,
    copyKey: copyKeyOf(entry, context.inFlight),
    actions: actionsOf(entry, context.inFlight),
    label: described.label,
    mealType: described.mealType,
    createdAt: entry.createdAt,
    reference: buildMealSaveReference(entry)
  };
}

export function describeMealWriteInput(input: unknown): { label: string; mealType: string | null } {
  const value = (input ?? {}) as { title?: unknown; mealType?: unknown; items?: unknown };
  const firstItem = Array.isArray(value.items) ? (value.items[0] as { displayName?: unknown } | undefined) : undefined;
  const label = typeof value.title === "string" && value.title.trim() ? value.title : typeof firstItem?.displayName === "string" ? firstItem.displayName : "";
  return { label, mealType: typeof value.mealType === "string" ? value.mealType : null };
}

export function describeFinalizationInput(input: unknown): { label: string; mealType: string | null } {
  const value = (input ?? {}) as { mealType?: unknown; finalization?: { mealWrite?: { mealName?: unknown } } };
  const name = value.finalization?.mealWrite?.mealName;
  return { label: typeof name === "string" ? name : "", mealType: typeof value.mealType === "string" ? value.mealType : null };
}

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

// ---------------------------------------------------------------------------------------------
// Local wait — the single timer of the recovery stack. It races an already-started request; it does
// not cancel it and it never retries. Expiry means "stop waiting locally" and nothing else.
// ---------------------------------------------------------------------------------------------

export type LocalWaitResult<T> = { timedOut: false; value: T } | { timedOut: true };
export type LocalWait = { race<T>(promise: Promise<T>): Promise<LocalWaitResult<T>> };

export function createLocalWait(
  ms: number = MEAL_SAVE_LOCAL_WAIT_MS,
  timers: {
    set: (callback: () => void, delay: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  }
): LocalWait {
  return {
    race<T>(promise: Promise<T>): Promise<LocalWaitResult<T>> {
      return new Promise<LocalWaitResult<T>>((resolve, reject) => {
        let handle: unknown = null;
        let done = false;
        handle = timers.set(() => {
          if (done) return;
          done = true;
          resolve({ timedOut: true });
        }, ms);
        const unref = (handle as { unref?: () => void } | null)?.unref;
        if (typeof unref === "function") unref.call(handle);
        promise.then(
          (value) => {
            if (done) return;
            done = true;
            timers.clear(handle);
            resolve({ timedOut: false, value });
          },
          (error) => {
            if (done) return;
            done = true;
            timers.clear(handle);
            reject(error);
          }
        );
      });
    }
  };
}

// Registered by the runtime immediately before each dispatch; consumed by the actor-bound rpc proxy.
export type MealSaveDispatchBinding = {
  bind(opId: string, ownerActorKey: string): void;
  release(opId: string): void;
};

// ---------------------------------------------------------------------------------------------
// Presenter: copy text and labelled, executable actions for one operation (UI-framework free so it can
// be exercised without React). The caller passes the zh-TW `pendingMealSave` copy block.
// ---------------------------------------------------------------------------------------------

export type MealSaveCopy = {
  referenceLabel: string;
  actions: { retry: string; retryDraft: string; defer: string; cancel: string; login: string; consent: string };
  inFlight: string;
  staleNote: string;
  deferredNote: string;
  unknown: { title: string; titleFinalization: string; body: string };
  unknownLogin: { title: string; body: string };
  unknownConsent: { title: string; body: string };
  unknownServer: { title: string; body: string };
  unknownAnomaly: { title: string; body: string };
  retryable: { title: string; body: string };
  blockedLogin: { title: string; body: string };
  blockedConsent: { title: string; body: string };
};

export type MealSaveOperationPresentation = {
  opId: string;
  title: string;
  body: string;
  notes: readonly string[];
  referenceLine: string;
  actions: readonly { id: MealSaveAction; label: string }[];
};

export function presentMealSaveOperation(op: MealSaveOperationSummary, copy: MealSaveCopy): MealSaveOperationPresentation {
  let title: string;
  let body: string;
  switch (op.copyKey) {
    case "unknown":
      title = op.kind === "finalization" ? copy.unknown.titleFinalization : copy.unknown.title;
      body = copy.unknown.body;
      break;
    case "unknownLogin":
      ({ title, body } = copy.unknownLogin);
      break;
    case "unknownConsent":
      ({ title, body } = copy.unknownConsent);
      break;
    case "unknownServer":
      ({ title, body } = copy.unknownServer);
      break;
    case "unknownAnomaly":
      ({ title, body } = copy.unknownAnomaly);
      break;
    case "blockedLogin":
      ({ title, body } = copy.blockedLogin);
      break;
    case "blockedConsent":
      ({ title, body } = copy.blockedConsent);
      break;
    case "submitting":
      title = copy.inFlight;
      body = "";
      break;
    default:
      ({ title, body } = copy.retryable);
  }
  const notes: string[] = [];
  if (op.stale && op.hadUnknown) notes.push(copy.staleNote);
  if (op.deferred && op.hadUnknown) notes.push(copy.deferredNote);
  const draftState = op.state === "new" || op.state === "retryable" || op.state === "blocked_login" || op.state === "blocked_consent";
  return {
    opId: op.opId,
    title,
    body,
    notes,
    referenceLine: `${copy.referenceLabel} ${op.reference}`,
    actions: op.actions.map((id) => ({
      id,
      label:
        id === "retry"
          ? draftState
            ? copy.actions.retryDraft
            : copy.actions.retry
          : id === "defer"
            ? copy.actions.defer
            : id === "cancel"
              ? copy.actions.cancel
              : id === "login"
                ? copy.actions.login
                : copy.actions.consent
    }))
  };
}
