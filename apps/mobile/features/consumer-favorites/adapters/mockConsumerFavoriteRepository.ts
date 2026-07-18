import { ConsumerFavoriteConfigurationInvalidError } from "../errors";
import type { ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository } from "../ports";
import type {
  ConsumerFavoriteListInput,
  ConsumerFavoriteListResult,
  ConsumerFavoriteReadResult,
  ConsumerFavoriteRecord,
  ConsumerFavoriteTarget,
  ConsumerFavoriteWriteResult
} from "../types";
import {
  compareConsumerFavoriteRecords,
  encodeConsumerFavoriteCursor,
  entityTypeForTarget,
  favoriteTargetKey,
  validateConsumerFavoriteListInput,
  validateConsumerFavoriteTarget
} from "../validation";

const DEFAULT_MOCK_TIMESTAMP = "2026-07-18T00:00:00.000Z";

export type MockConsumerFavoriteRow = Omit<ConsumerFavoriteRecord, "active"> & {
  actorId: string;
  removedAt: string | null;
};
export type MockConsumerFavoriteStore = { rows: MockConsumerFavoriteRow[] };

export type MockConsumerFavoriteRepositoryOptions = {
  actorId: string;
  clock?: () => string;
  idGenerator?: () => string;
  initialRows?: readonly MockConsumerFavoriteRow[];
  store?: MockConsumerFavoriteStore;
};

export function createMockConsumerFavoriteStore(
  initialRows: readonly MockConsumerFavoriteRow[] = []
): MockConsumerFavoriteStore {
  return { rows: initialRows.map(cloneRow) };
}

export class MockConsumerFavoriteRepository implements ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository {
  readonly readSource = "mock" as const;
  readonly writeSource = "mock" as const;
  private readonly actorId: string;
  private readonly clock: () => string;
  private readonly idGenerator: () => string;
  private readonly store: MockConsumerFavoriteStore;

  constructor(options: MockConsumerFavoriteRepositoryOptions) {
    if (!validActorId(options.actorId)) {
      throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite repository requires an authenticated mock actor.");
    }
    if (options.store && options.initialRows) {
      throw new ConsumerFavoriteConfigurationInvalidError("Inject either an existing mock store or initial rows, not both.");
    }
    let sequence = 0;
    this.actorId = options.actorId.trim();
    this.clock = options.clock ?? (() => DEFAULT_MOCK_TIMESTAMP);
    this.idGenerator = options.idGenerator ?? (() => `mock-favorite-${++sequence}`);
    this.store = options.store ?? createMockConsumerFavoriteStore(options.initialRows);
    validateRows(this.store.rows);
  }

  async getCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteReadResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) return { status: "invalid_target", source: this.readSource, error: validation.error };
    const record = this.activeRows().find((row) => favoriteTargetKey(row.target) === favoriteTargetKey(validation.value));
    return record
      ? { status: "available", record: cloneRecord(record), source: this.readSource }
      : { status: "missing", target: cloneTarget(validation.value), source: this.readSource };
  }

  async listCurrentUserFavorites(input: ConsumerFavoriteListInput): Promise<ConsumerFavoriteListResult> {
    const validation = validateConsumerFavoriteListInput(input);
    if (!validation.ok) return { status: "read_failed", source: this.readSource, error: validation.error };
    const { entityType, pageSize, cursor } = validation.value;
    let rows = this.activeRows()
      .filter((row) => entityTypeForTarget(row.target) === entityType)
      .sort(compareConsumerFavoriteRecords);
    if (cursor) {
      const cursorRecord = { sortOrder: cursor[0], createdAt: cursor[1], favoriteId: cursor[2] };
      rows = rows.filter((row) => compareConsumerFavoriteRecords(row, cursorRecord) > 0);
    }
    const page = rows.slice(0, pageSize);
    const nextCursor = rows.length > page.length && page.length
      ? encodeConsumerFavoriteCursor(page[page.length - 1])
      : null;
    return {
      status: page.length ? "available" : "empty",
      records: page.map(cloneRecord),
      nextCursor,
      source: this.readSource
    };
  }

  async addCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) return { status: "invalid_target", source: this.writeSource, error: validation.error };
    const active = this.activeRows().find((row) => favoriteTargetKey(row.target) === favoriteTargetKey(validation.value));
    if (active) return { status: "already_present", record: cloneRecord(active), source: this.writeSource };
    const row: MockConsumerFavoriteRow = {
      actorId: this.actorId,
      favoriteId: requireGeneratedId(this.idGenerator()),
      target: cloneTarget(validation.value),
      collectionLabel: null,
      sortOrder: null,
      createdAt: requireTimestamp(this.clock()),
      removedAt: null
    };
    if (this.store.rows.some((candidate) => candidate.favoriteId === row.favoriteId)) {
      throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite ID generator returned a duplicate ID.");
    }
    this.store.rows.push(row);
    return { status: "added", record: cloneRecord(row), source: this.writeSource };
  }

  async removeCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) return { status: "invalid_target", source: this.writeSource, error: validation.error };
    const active = this.activeRows().find((row) => favoriteTargetKey(row.target) === favoriteTargetKey(validation.value));
    if (!active) return { status: "already_absent", target: cloneTarget(validation.value), source: this.writeSource };
    active.removedAt = requireTimestamp(this.clock());
    return { status: "removed", record: cloneRecord(active), source: this.writeSource };
  }

  getHistoryForContract(target: ConsumerFavoriteTarget): readonly ConsumerFavoriteRecord[] {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) return [];
    const key = favoriteTargetKey(validation.value);
    return this.store.rows
      .filter((row) => row.actorId === this.actorId && favoriteTargetKey(row.target) === key)
      .map(cloneRecord);
  }

  private activeRows(): MockConsumerFavoriteRow[] {
    return this.store.rows.filter((row) => row.actorId === this.actorId && row.removedAt === null);
  }
}

function validateRows(rows: readonly MockConsumerFavoriteRow[]) {
  const activeKeys = new Set<string>();
  const ids = new Set<string>();
  for (const row of rows) {
    if (
      !validActorId(row.actorId) ||
      !validateConsumerFavoriteTarget(row.target).ok ||
      !validTimestamp(row.createdAt) ||
      !(row.sortOrder === null || (typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder))) ||
      !(row.collectionLabel === null || typeof row.collectionLabel === "string")
    ) {
      throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite initial row is invalid.");
    }
    if (row.removedAt !== null && !validTimestamp(row.removedAt)) {
      throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite removal timestamp is invalid.");
    }
    if (typeof row.favoriteId !== "string" || ids.has(row.favoriteId) || !row.favoriteId.trim()) {
      throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite row ID is invalid.");
    }
    ids.add(row.favoriteId);
    if (row.removedAt === null) {
      const key = `${row.actorId}:${favoriteTargetKey(row.target)}`;
      if (activeKeys.has(key)) throw new ConsumerFavoriteConfigurationInvalidError("Mock favorites contain duplicate active rows.");
      activeKeys.add(key);
    }
  }
}

function cloneRow(row: MockConsumerFavoriteRow): MockConsumerFavoriteRow {
  return { ...row, target: cloneTarget(row.target) };
}

function cloneRecord(row: MockConsumerFavoriteRow): ConsumerFavoriteRecord {
  return {
    favoriteId: row.favoriteId,
    target: cloneTarget(row.target),
    collectionLabel: row.collectionLabel,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    active: row.removedAt === null
  };
}

function cloneTarget(target: ConsumerFavoriteTarget): ConsumerFavoriteTarget {
  return target.kind === "restaurant" ? { ...target } : { ...target };
}

function validActorId(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireTimestamp(value: string): string {
  if (!validTimestamp(value)) throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite clock returned an invalid timestamp.");
  return value;
}

function requireGeneratedId(value: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsumerFavoriteConfigurationInvalidError("Mock favorite ID generator returned an invalid ID.");
  }
  return value.trim();
}
