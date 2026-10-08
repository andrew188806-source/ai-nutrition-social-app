// TastKind meal-save recovery policy — PURE module (no I/O, no React, no SDK).
//
// One policy shared by the normal-save runtime and the photo-finalization runtime:
//   * how an attempt outcome is classified,
//   * how the persisted operation entry changes (the sticky-unknown rule),
//   * what the user is shown (copy key, executable actions, local reference code),
//   * the local wait (the ONLY timer in the recovery stack — it is not a retry).
//
// Safety rules encoded here (see the approved scope, final-r2, as superseded for outcome certainty by the external R-11 addendum of
// 2026-10-08: "structured error code => rolled back" no longer holds; only PROOF makes an operation "not written"):
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
// retryable = PROVEN not written (see "Outcome certainty" below), no unknown history
// blocked_* = PROVEN not written, waiting for login / consent, no unknown history
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

// `structured` marks a transport-typed error that carried a well-formed server error code (question A only: a server-looking answer
// arrived). It is NOT evidence of a rollback; see classifyFinalizationOutcome.
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
// Outcome certainty (Owner R-11, 2026-10-08)
// ---------------------------------------------------------------------------------------------
//
// The two typed-code classifiers above answer question A only: what should the user do next (log in, give consent, fix the input,
// try later). Question B — is the outcome of the save certain? — is answered here, separately, and ONLY by proof:
//
//   * `notDispatched`: this device observed that the SDK's rpc method was never called for the attempt (a local refusal), or
//   * `guardRefused`: the dispatch guard recorded that it refused this exact request (it never reached the network), or
//   * `rollbackEvidence`: the answer is a row of the rollback-evidence table below (exact SQLSTATE + exact server token that the RPC
//     body itself raises) and its HTTP status is not disqualifying.
//
// The error-code format, the message words and the HTTP status are never proof by themselves. Without proof the operation, its
// original key and payload are kept and the outcome is UNKNOWN; unknown history is sticky (a later refusal never erases it).

export type MealSaveAnswerProof = { notDispatched?: boolean; guardRefused?: boolean; rollbackEvidence?: boolean };

export type RollbackRpc = "create" | "finalize";

// (1) Function-authored refusals. Each pair is raised by a RAISE EXCEPTION inside the PL/pgSQL call tree of ITS OWN rpc (latest
// definitions in supabase/migrations: create_current_user_meal_record_v2 / finalize_current_user_meal_identification_v1 and the
// functions they call; the recovery smoke re-reads the migrations and fails when a pair is not raised inside that rpc's tree). A
// PL/pgSQL function cannot COMMIT and PostgREST commits only when the call returns without error, so an error raised there aborts
// the request's transaction before any COMMIT. The proof stands on these upstream premises, stated in the external R-11 addendum:
// the target backend serves those function definitions behind PostgREST, and nothing between the function and the SDK fabricates
// a PostgreSQL-shaped answer. A pair of the other rpc, a bare code, or a token with another code is not evidence.
const rollbackTokens: Record<RollbackRpc, Readonly<Record<string, readonly string[]>>> = {
  create: {
    "22023": [
      "CLIENT_REQUEST_ID_REQUIRED", "MEAL_TYPE_REQUIRED", "OCCURRED_AT_REQUIRED", "MEAL_DATE_REQUIRED", "INVALID_TIMEZONE", "TITLE_TOO_LONG",
      "NOTE_TOO_LONG", "SOURCE_REQUIRED", "ITEMS_MUST_BE_ARRAY", "ITEMS_REQUIRED", "TOO_MANY_ITEMS", "ITEM_MUST_BE_OBJECT", "ITEM_FORBIDDEN_FIELD",
      "ITEM_UNKNOWN_FIELD", "DISPLAY_NAME_REQUIRED", "INVALID_DISPLAY_NAME", "INVALID_NUTRITION", "UNKNOWN_NUTRITION_FIELD",
      "INVALID_NUTRITION_VALUE", "NEGATIVE_NUTRITION_VALUE", "INVALID_NUTRITION_SOURCE", "INVALID_CONFIDENCE_SCORE", "INVALID_CONSUMED_RATIO"
    ],
    "23505": ["IDEMPOTENCY_KEY_CONFLICT"],
    "28000": ["AUTHENTICATION_REQUIRED"],
    "42501": ["CONSUMER_CORE_ELIGIBILITY_REQUIRED"],
    P0001: ["CANONICAL_MEAL_RECORD_NOT_FOUND"]
  },
  finalize: {
    "22023": ["INVALID_FINALIZATION", "FORBIDDEN_FIELD", "ANALYSIS_NOT_FOUND", "INVALID_CANDIDATE", "CORRECTION_VALIDATION_FAILED", "ANALYSIS_NOT_READY", "UNSUPPORTED_CONTRACT_VERSION"],
    "23503": ["CATALOG_IDENTITY_REJECTED"],
    "23505": ["IDEMPOTENCY_KEY_CONFLICT", "ANALYSIS_ALREADY_FINALIZED"],
    "23514": ["DURABLE_STATE_INCONSISTENCY", "DURABLE_FINALIZATION_FAILED", "IDENTITY_INVARIANT_VIOLATION", "ANALYSIS_INVARIANT_VIOLATION", "CORRECTION_INVARIANT_VIOLATION"],
    "28000": ["AUTHENTICATION_REQUIRED"],
    "42501": ["CONSUMER_CORE_ELIGIBILITY_REQUIRED", "ANALYSIS_ACCESS_DENIED", "OWNERSHIP_OR_AUTHORIZATION_REJECTED"],
    P0001: ["DURABLE_FINALIZATION_FAILED"]
  }
};

// (2) A bare engine SQLSTATE (23502, 23514, 42501, 42P01, 55P03, 57014, ...) is NOT evidence, whatever it measured on a local
// PostgreSQL: the same code gives no authorship, so it cannot show at which stage of the request it was produced. It stays unknown
// (the operation and its key are kept; 重新確認 replays the original key). Only a function-authored pair in the table above counts,
// because its token can only be produced by the RPC body, which runs before COMMIT.

// Statuses that suggest an intermediary answered. An answer carrying one never counts as evidence. This is a disqualifier only: a
// status is never evidence by itself.
const intermediaryStatuses: ReadonlySet<number> = new Set([502, 503, 504]);

export function hasRollbackEvidence(rpc: RollbackRpc, answer: { code?: unknown; message?: unknown; status?: unknown }): boolean {
  const { code, message, status } = answer;
  if (typeof code !== "string" || typeof status !== "number" || !Number.isInteger(status)) return false;
  if (status < 400 || status > 599 || intermediaryStatuses.has(status)) return false;
  return typeof message === "string" && rollbackTokens[rpc][code]?.includes(message) === true;
}

// The recovery guard checks these tables against the migrations.
export const rollbackEvidenceTables = { tokens: rollbackTokens };

// Proof for one failed attempt from two independent sources, neither of them text: the device's own observation of the attempt
// (`observation`, from the dispatch binding) and the typed error's diagnostics (the server's SQLSTATE, its bare-token message —
// null for free text — and the top-level HTTP status). A binding that cannot observe yields no notDispatched / guardRefused.
export function proofFromError(rpc: RollbackRpc, error: object, observation?: { called: boolean; refused: boolean }, localOnlySource = false): MealSaveAnswerProof {
  const e = error as { sqlstate?: unknown; serverToken?: unknown; httpStatus?: unknown };
  return {
    notDispatched: localOnlySource || (observation !== undefined && !observation.called && !observation.refused),
    guardRefused: observation?.refused === true,
    rollbackEvidence: hasRollbackEvidence(rpc, { code: e.sqlstate, message: e.serverToken, status: e.httpStatus })
  };
}

// A classification that says "the server did not write this" (or that the user must act because it did not) is kept only when the
// attempt is proven not to have written. Otherwise the outcome stays unknown and the reason keeps answering question A.
function requireProof(base: MealSaveClassification, proof: MealSaveAnswerProof): MealSaveClassification {
  switch (base.cls) {
    case "needs_login":
    case "needs_consent":
    case "server_fault":
    case "rolled_back":
    case "rejected_input":
    case "conflict": {
      if (base.localFailure || proof.notDispatched || proof.rollbackEvidence) return base;
      const reason: MealSaveReason = base.cls === "needs_login" ? "login" : base.cls === "needs_consent" ? "consent" : "server";
      return { cls: "unknown", meta: { ...base.meta, reason } };
    }
    case "not_sent":
      return proof.guardRefused ? base : { cls: "unknown", meta: { ...base.meta, reason: "server" } };
    default:
      return base;
  }
}

// Typed local errors that the client can only produce before anything is sent.
const localMealWriteCodes = new Set(["meal_write_payload_too_large", "meal_write_ownership_field_rejected"]);

export function classifyMealWriteOutcome(code: string, message: string, sqlstate: string | null, proof: MealSaveAnswerProof): MealSaveClassification {
  const base = classifyMealWriteErrorCode(code, message, sqlstate);
  return localMealWriteCodes.has(code) || code.startsWith("meal_write_invalid") ? base : requireProof(base, proof);
}

export function classifyFinalizationOutcome(code: string, sqlstate: string | null, structured: boolean, proof: MealSaveAnswerProof): MealSaveClassification {
  return requireProof(classifyFinalizationErrorCode(code, sqlstate, structured), proof);
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
  // What this device observed about the attempt that was just bound: did the SDK's rpc method get called at all, and did the dispatch
  // guard refuse it. Optional: a binding that cannot observe never produces proof, so the outcome stays unknown.
  observe?(opId: string): { called: boolean; refused: boolean };
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
