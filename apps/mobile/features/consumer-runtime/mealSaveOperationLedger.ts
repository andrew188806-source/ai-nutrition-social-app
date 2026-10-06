// TastKind meal-save operation ledger — durable, per kind and per actor, built on ConsumerAuthStorage
// (getItem / setItem / removeItem only; keys cannot be enumerated).
//
// Design (approved scope final-r2 §2; the first attempt is journalled by creating the entry as `inflight`
// in a single verified write, so exactly one durable write precedes the first dispatch):
//   * 20 FIXED slot keys per kind per actor. The slot keys themselves are the authority — there is NO
//     index. A restart finds every operation by reading the 20 keys.
//   * Persist-before-send journal: an entry is written `new`, read back and verified; before an attempt
//     it is rewritten `inflight`, read back and verified. A dispatch may only follow that verified write.
//   * Boot recovery (once per storage object / kind / actor): any `inflight` entry (a previous process
//     may have dispatched it) becomes `unknown`; legacy v1 pending records are migrated, never deleted
//     before the slot entry is verified, never discarded when unreadable (quarantined instead).
//   * One module-level lock per (storage, kind, actor), shared by every ledger instance in this JS
//     context. Every mutation re-scans the 20 slots inside the lock.
//   * A corrupt, foreign-owner or otherwise unusable slot is preserved, counted as occupied and never
//     overwritten. Capacity full refuses new operations; nothing is ever evicted.
//   * Nothing in here creates an operation id, sends a request, or deletes an unknown operation.
//
// Single-JS-context and single-`setItem` atomicity are assumptions (device verification pending).

import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import {
  MEAL_SAVE_MAX_ENTRY_BYTES,
  MEAL_SAVE_SLOT_COUNT,
  isMealSaveEntryState,
  isMealSaveReason,
  utf8ByteLength,
  type MealSaveEntry,
  type MealSaveEntryState,
  type MealSaveOperationKind
} from "./mealSaveRecovery";

export type MealSaveLedgerFailure = "capacity" | "too_large" | "storage" | "missing" | "owner_mismatch";

export class MealSaveLedgerError extends Error {
  constructor(readonly reason: MealSaveLedgerFailure, message?: string) {
    super(message ?? `Meal save ledger failure: ${reason}`);
    this.name = "MealSaveLedgerError";
  }
}

export type MealSaveLedgerOptions<TInput> = {
  storage: ConsumerAuthStorage;
  kind: MealSaveOperationKind;
  // e.g. "tastkind.consumerMealWrite.pending" — the v2 slot keys and the v1 key derive from it.
  keyPrefix: string;
  validateInput: (input: unknown) => void;
  slots?: number;
  maxEntryBytes?: number;
  // Test-only seam: lets a ledger deliberately use a private lock (the known-bad control).
  lockScope?: object;
  _types?: TInput;
};

export type MealSaveLedgerListing<TInput> = {
  ok: boolean;
  entries: MealSaveEntry<TInput>[];
  unusable: number;
  free: number;
};

export type MealSaveLedgerAddResult<TInput> =
  | { ok: true; entry: MealSaveEntry<TInput>; duplicate: boolean }
  | { ok: false; reason: MealSaveLedgerFailure };

export type MealSaveLedgerUpdateResult<TInput> =
  | { ok: true; entry: MealSaveEntry<TInput> | null }
  | { ok: false; reason: MealSaveLedgerFailure };

type Slot<TInput> =
  | { n: number; kind: "free" }
  | { n: number; kind: "entry"; entry: MealSaveEntry<TInput>; raw: string }
  | { n: number; kind: "unusable"; raw: string };

// Module-level registries. Keyed by the storage OBJECT so a second ledger instance over the same
// storage (a hot-reload duplicate, or the finalization/normal stores sharing storage) shares the lock
// and the boot bookkeeping, while independent storages (tests, restarts) stay independent.
const lockRegistry = new WeakMap<object, Map<string, Promise<unknown>>>();
const bootRegistry = new WeakMap<object, Set<string>>();

function lockChain(scope: object): Map<string, Promise<unknown>> {
  let chain = lockRegistry.get(scope);
  if (!chain) {
    chain = new Map();
    lockRegistry.set(scope, chain);
  }
  return chain;
}

export class MealSaveOperationLedger<TInput> {
  private readonly slots: number;
  private readonly maxEntryBytes: number;
  private readonly lockScope: object;

  constructor(private readonly options: MealSaveLedgerOptions<TInput>) {
    this.slots = options.slots ?? MEAL_SAVE_SLOT_COUNT;
    this.maxEntryBytes = options.maxEntryBytes ?? MEAL_SAVE_MAX_ENTRY_BYTES;
    this.lockScope = options.lockScope ?? options.storage;
  }

  slotKey(actorKey: string, n: number) {
    return `${this.options.keyPrefix}.v2.slot.${encodeURIComponent(actorKey)}.${n}`;
  }

  legacyKey(actorKey: string) {
    return `${this.options.keyPrefix}.v1.${encodeURIComponent(actorKey)}`;
  }

  private quarantineKey(actorKey: string, index: number) {
    return `${this.options.keyPrefix}.v1.quarantine.${encodeURIComponent(actorKey)}.${index}`;
  }

  private assertActor(actorKey: string) {
    if (!actorKey.trim()) throw new MealSaveLedgerError("owner_mismatch", "Actor scope is required.");
  }

  private run<T>(actorKey: string, fn: () => Promise<T>): Promise<T> {
    this.assertActor(actorKey);
    const chain = lockChain(this.lockScope);
    const key = `${this.options.kind}:${this.options.keyPrefix}:${actorKey}`;
    const previous = chain.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    chain.set(key, next.catch(() => undefined));
    return next;
  }

  private parse(raw: string, actorKey: string): MealSaveEntry<TInput> | null {
    try {
      const value = JSON.parse(raw) as Partial<MealSaveEntry<TInput>> | null;
      if (!value || typeof value !== "object") return null;
      if (value.schema !== 2 || value.kind !== this.options.kind) return null;
      if (value.ownerActorKey !== actorKey) return null;
      if (typeof value.opId !== "string" || !value.opId || typeof value.seq !== "number") return null;
      if (!isMealSaveEntryState(value.state)) return null;
      if (value.priorState !== null && !isMealSaveEntryState(value.priorState)) return null;
      if (typeof value.hadUnknown !== "boolean" || typeof value.deferred !== "boolean" || typeof value.attempts !== "number") return null;
      if (value.lastReason !== null && !isMealSaveReason(value.lastReason)) return null;
      if (typeof value.createdAt !== "string" || typeof value.expiresAt !== "string") return null;
      this.options.validateInput(value.input);
      return value as MealSaveEntry<TInput>;
    } catch {
      return null;
    }
  }

  private async scan(actorKey: string): Promise<Slot<TInput>[]> {
    const out: Slot<TInput>[] = [];
    for (let n = 0; n < this.slots; n++) {
      const raw = await this.options.storage.getItem(this.slotKey(actorKey, n));
      if (raw === null || raw === undefined) {
        out.push({ n, kind: "free" });
        continue;
      }
      const entry = this.parse(raw, actorKey);
      out.push(entry ? { n, kind: "entry", entry, raw } : { n, kind: "unusable", raw });
    }
    return out;
  }

  // Write then read back and compare byte-for-byte. A mismatch means somebody else wrote the slot.
  private async writeVerified(actorKey: string, n: number, entry: MealSaveEntry<TInput>): Promise<boolean> {
    const raw = JSON.stringify(entry);
    if (utf8ByteLength(raw) > this.maxEntryBytes) throw new MealSaveLedgerError("too_large");
    await this.options.storage.setItem(this.slotKey(actorKey, n), raw);
    const back = await this.options.storage.getItem(this.slotKey(actorKey, n));
    return back === raw;
  }

  // ------------------------------------------------------------------ boot (recovery + migration)
  private async ensureBooted(actorKey: string): Promise<void> {
    let booted = bootRegistry.get(this.options.storage);
    if (!booted) {
      booted = new Set();
      bootRegistry.set(this.options.storage, booted);
    }
    const bootKey = `${this.options.keyPrefix}:${actorKey}`;
    if (booted.has(bootKey)) return;
    await this.recoverInflight(actorKey);
    await this.migrateLegacy(actorKey);
    booted.add(bootKey);
  }

  // A previous process may have dispatched an `inflight` attempt: it becomes unknown (sticky).
  private async recoverInflight(actorKey: string): Promise<void> {
    const slots = await this.scan(actorKey);
    for (const slot of slots) {
      if (slot.kind !== "entry" || slot.entry.state !== "inflight") continue;
      const recovered: MealSaveEntry<TInput> = { ...slot.entry, state: "unknown", priorState: null, hadUnknown: true, lastReason: slot.entry.lastReason ?? "transport" };
      if (!(await this.writeVerified(actorKey, slot.n, recovered))) throw new MealSaveLedgerError("storage");
    }
  }

  // Legacy single-pending record (v1) -> slot entry. Possibly sent, so unknown/hadUnknown, even when its
  // old 24 h expiry has passed (expiry is only a staleness hint now).
  private async migrateLegacy(actorKey: string): Promise<void> {
    const raw = await this.options.storage.getItem(this.legacyKey(actorKey));
    if (raw === null || raw === undefined) return;
    let legacy: { idempotencyKey?: unknown; clientRequestId?: unknown; input?: unknown; createdAt?: unknown; expiresAt?: unknown } | null = null;
    try {
      legacy = JSON.parse(raw);
    } catch {
      legacy = null;
    }
    const opId = typeof legacy?.idempotencyKey === "string" ? legacy.idempotencyKey : typeof legacy?.clientRequestId === "string" ? legacy.clientRequestId : null;
    let valid = false;
    if (legacy && opId && legacy.input && typeof legacy.input === "object") {
      try {
        this.options.validateInput(legacy.input);
        valid = true;
      } catch {
        valid = false;
      }
    }
    if (!valid || !legacy || !opId) {
      // Never delete unreadable content: keep the raw string under a quarantine key, then drop only the v1 key.
      let index = 0;
      while ((await this.options.storage.getItem(this.quarantineKey(actorKey, index))) !== null) index++;
      await this.options.storage.setItem(this.quarantineKey(actorKey, index), raw);
      if ((await this.options.storage.getItem(this.quarantineKey(actorKey, index))) !== raw) throw new MealSaveLedgerError("storage");
      await this.options.storage.removeItem(this.legacyKey(actorKey));
      return;
    }
    const slots = await this.scan(actorKey);
    if (!slots.some((slot) => slot.kind === "entry" && slot.entry.opId === opId)) {
      const free = slots.find((slot) => slot.kind === "free");
      if (!free) return; // slots full: v1 stays where it is, nothing is lost, migration retries next boot
      const createdAt = typeof legacy.createdAt === "string" ? legacy.createdAt : new Date(0).toISOString();
      const entry: MealSaveEntry<TInput> = {
        schema: 2,
        opId,
        kind: this.options.kind,
        ownerActorKey: actorKey,
        seq: Math.max(0, ...slots.map((slot) => (slot.kind === "entry" ? slot.entry.seq : 0))) + 1,
        input: legacy.input as TInput,
        createdAt,
        expiresAt: typeof legacy.expiresAt === "string" ? legacy.expiresAt : createdAt,
        state: "unknown",
        priorState: null,
        deferred: false,
        hadUnknown: true,
        attempts: 1,
        lastReason: "transport",
        lastSqlstate: null,
        lastHttpStatus: null,
        lastAttemptAt: null
      };
      if (!(await this.writeVerified(actorKey, free.n, entry))) throw new MealSaveLedgerError("storage");
    }
    await this.options.storage.removeItem(this.legacyKey(actorKey));
  }

  // ------------------------------------------------------------------ public API
  list(actorKey: string): Promise<MealSaveLedgerListing<TInput>> {
    return this.run(actorKey, async () => {
      try {
        await this.ensureBooted(actorKey);
        const slots = await this.scan(actorKey);
        const entries = slots.filter((slot): slot is Extract<Slot<TInput>, { kind: "entry" }> => slot.kind === "entry").map((slot) => slot.entry);
        entries.sort((a, b) => a.seq - b.seq);
        return { ok: true, entries, unusable: slots.filter((slot) => slot.kind === "unusable").length, free: slots.filter((slot) => slot.kind === "free").length };
      } catch {
        return { ok: false, entries: [], unusable: 0, free: 0 };
      }
    });
  }

  get(actorKey: string, opId: string): Promise<MealSaveEntry<TInput> | null> {
    return this.run(actorKey, async () => {
      try {
        await this.ensureBooted(actorKey);
        const slot = (await this.scan(actorKey)).find((s) => s.kind === "entry" && s.entry.opId === opId);
        return slot && slot.kind === "entry" ? slot.entry : null;
      } catch {
        return null;
      }
    });
  }

  add(
    actorKey: string,
    seed: { opId: string; input: TInput; createdAt: string; expiresAt: string },
    // `inflight` = the entry is born as the journal of the attempt that immediately follows: ONE durable,
    // verified write precedes the dispatch. A crash before the dispatch is recovered as unknown (conservative).
    options: { inflight?: boolean } = {}
  ): Promise<MealSaveLedgerAddResult<TInput>> {
    return this.run(actorKey, async () => {
      try {
        await this.ensureBooted(actorKey);
        for (let attempt = 0; attempt < 3; attempt++) {
          const slots = await this.scan(actorKey);
          const existing = slots.find((slot) => slot.kind === "entry" && slot.entry.opId === seed.opId);
          if (existing && existing.kind === "entry") return { ok: true, entry: existing.entry, duplicate: true };
          const free = slots.find((slot) => slot.kind === "free");
          if (!free) return { ok: false, reason: "capacity" };
          const entry: MealSaveEntry<TInput> = {
            schema: 2,
            opId: seed.opId,
            kind: this.options.kind,
            ownerActorKey: actorKey,
            seq: Math.max(0, ...slots.map((slot) => (slot.kind === "entry" ? slot.entry.seq : 0))) + 1,
            input: seed.input,
            createdAt: seed.createdAt,
            expiresAt: seed.expiresAt,
            state: options.inflight ? "inflight" : "new",
            priorState: options.inflight ? "new" : null,
            deferred: false,
            hadUnknown: false,
            attempts: options.inflight ? 1 : 0,
            lastReason: null,
            lastSqlstate: null,
            lastHttpStatus: null,
            lastAttemptAt: null
          };
          if (await this.writeVerified(actorKey, free.n, entry)) return { ok: true, entry, duplicate: false };
        }
        return { ok: false, reason: "storage" };
      } catch (error) {
        return { ok: false, reason: error instanceof MealSaveLedgerError ? error.reason : "storage" };
      }
    });
  }

  // Read-modify-write of ONE entry inside the lock. `mutate` returns the new entry, or null to remove it.
  update(
    actorKey: string,
    opId: string,
    mutate: (entry: MealSaveEntry<TInput>) => MealSaveEntry<TInput> | null
  ): Promise<MealSaveLedgerUpdateResult<TInput>> {
    return this.run(actorKey, async () => {
      try {
        await this.ensureBooted(actorKey);
        const slot = (await this.scan(actorKey)).find((s) => s.kind === "entry" && s.entry.opId === opId);
        if (!slot || slot.kind !== "entry") return { ok: false, reason: "missing" };
        const next = mutate(slot.entry);
        if (next === null) {
          await this.options.storage.removeItem(this.slotKey(actorKey, slot.n));
          return { ok: true, entry: null };
        }
        if (!(await this.writeVerified(actorKey, slot.n, next))) return { ok: false, reason: "storage" };
        return { ok: true, entry: next };
      } catch (error) {
        return { ok: false, reason: error instanceof MealSaveLedgerError ? error.reason : "storage" };
      }
    });
  }

  markInflight(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<TInput>> {
    return this.update(actorKey, opId, (entry) => ({ ...entry, priorState: entry.state === "inflight" ? entry.priorState : entry.state, state: "inflight", attempts: entry.attempts + 1 }));
  }

  remove(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<TInput>> {
    return this.update(actorKey, opId, () => null);
  }
}

export type { MealSaveEntryState };
