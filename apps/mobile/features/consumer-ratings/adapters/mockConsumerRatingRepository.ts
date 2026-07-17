import { ConsumerRatingConfigurationInvalidError } from "../errors";
import type { ConsumerRatingReadRepository, ConsumerRatingWriteRepository } from "../ports";
import type {
  ConsumerCreateOrReplaceMenuItemRatingInput,
  ConsumerCreateOrReplaceRatingInput,
  ConsumerCurrentMenuItemRatingRecord,
  ConsumerCurrentRatingRecord,
  ConsumerCurrentRestaurantRatingRecord,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingListResult,
  ConsumerRatingReadResult,
  ConsumerRatingWriteResult,
  ConsumerRestaurantRatingLookup
} from "../types";
import {
  ratingLookupKey,
  validateCreateOrReplaceRatingInput,
  validateMenuItemRatingLookup,
  validateRestaurantRatingLookup
} from "../validation";

const DEFAULT_MOCK_TIMESTAMP = "2026-07-17T00:00:00.000Z";

export const DEFAULT_CONSUMER_RATING_FIXTURES: readonly ConsumerCurrentRatingRecord[] = [
  {
    ratingId: "mock-current-restaurant-rating-haochu",
    target: { kind: "restaurant", restaurantId: "restaurant-haochu-bowl", mealRecordId: "meal-record-haochu-lunch" },
    ratingValue: 4.5,
    visibility: "private",
    isCurrent: true,
    tasteFeeling: "balanced",
    portionFeeling: "just_right",
    priceFeeling: "reasonable",
    repurchaseIntent: "yes",
    ratedAt: "2026-07-15T04:00:00.000Z",
    updatedAt: "2026-07-15T04:00:00.000Z"
  },
  {
    ratingId: "mock-current-menu-item-rating-chicken",
    target: {
      kind: "menu_item",
      restaurantId: "restaurant-haochu-bowl",
      branchId: "branch-nanjing",
      menuItemId: "dish-haochu-1",
      mealRecordItemId: "meal-record-item-haochu-chicken"
    },
    ratingValue: 4,
    visibility: "private",
    isCurrent: true,
    tasteFeeling: "fresh",
    portionFeeling: "just_right",
    priceFeeling: "reasonable",
    repurchaseIntent: "yes",
    finished: true,
    dislikeReasons: [],
    ratedAt: "2026-07-15T04:05:00.000Z",
    updatedAt: "2026-07-15T04:05:00.000Z"
  }
];

export type MockConsumerRatingRepositoryOptions = {
  fixtures?: readonly ConsumerCurrentRatingRecord[];
  clock?: () => string;
};

export class MockConsumerRatingRepository implements ConsumerRatingReadRepository, ConsumerRatingWriteRepository {
  readonly readSource = "mock" as const;
  readonly writeSource = "mock" as const;
  private records: ConsumerCurrentRatingRecord[];
  private readonly clock: () => string;

  constructor(options: MockConsumerRatingRepositoryOptions = {}) {
    this.records = (options.fixtures ?? DEFAULT_CONSUMER_RATING_FIXTURES).map(cloneRecord);
    this.clock = options.clock ?? (() => DEFAULT_MOCK_TIMESTAMP);
    assertSingleCurrentRecordPerTarget(this.records);
  }

  async getCurrentUserRestaurantRating(
    lookup: ConsumerRestaurantRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentRestaurantRatingRecord>> {
    const validation = validateRestaurantRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.readSource, error: validation.error };
    const record = this.records.find(
      (candidate): candidate is ConsumerCurrentRestaurantRatingRecord =>
        candidate.target.kind === "restaurant" && candidate.target.restaurantId === lookup.restaurantId && candidate.isCurrent
    );
    return record
      ? { status: "available", record: cloneRecord(record) as ConsumerCurrentRestaurantRatingRecord, source: this.readSource }
      : { status: "missing", lookup: { ...lookup }, source: this.readSource };
  }

  async getCurrentUserMenuItemRating(
    lookup: ConsumerMenuItemRatingLookup
  ): Promise<ConsumerRatingReadResult<ConsumerCurrentMenuItemRatingRecord>> {
    const validation = validateMenuItemRatingLookup(lookup);
    if (!validation.ok) return { status: "invalid_input", source: this.readSource, error: validation.error };
    const record = this.records.find(
      (candidate): candidate is ConsumerCurrentMenuItemRatingRecord =>
        candidate.target.kind === "menu_item" && candidate.target.menuItemId === lookup.menuItemId && candidate.isCurrent
    );
    return record
      ? { status: "available", record: cloneRecord(record) as ConsumerCurrentMenuItemRatingRecord, source: this.readSource }
      : { status: "missing", lookup: { ...lookup }, source: this.readSource };
  }

  async listCurrentUserRatings(): Promise<ConsumerRatingListResult> {
    const records = this.records
      .filter((record) => record.isCurrent)
      .slice()
      .sort((left, right) => ratingLookupKey(left.target).localeCompare(ratingLookupKey(right.target)))
      .map(cloneRecord);
    return { status: "available", records, source: this.readSource };
  }

  async createOrReplaceCurrentUserRating(input: ConsumerCreateOrReplaceRatingInput): Promise<ConsumerRatingWriteResult> {
    const validation = validateCreateOrReplaceRatingInput(input);
    if (!validation.ok) return { status: "invalid_input", source: this.writeSource, error: validation.error };

    const key = ratingLookupKey(input.target);
    const replaced = this.records.some((record) => record.isCurrent && ratingLookupKey(record.target) === key);
    this.records = this.records.map((record) =>
      record.isCurrent && ratingLookupKey(record.target) === key ? ({ ...record, isCurrent: false } as ConsumerCurrentRatingRecord) : record
    );

    const timestamp = this.clock();
    const version = this.records.filter((record) => ratingLookupKey(record.target) === key).length + 1;
    const record = buildRecord(input, timestamp, version);
    this.records = [...this.records, record];
    return { status: replaced ? "replaced" : "saved", record: cloneRecord(record), source: this.writeSource };
  }

  getHistoryForContract(lookup: ConsumerRestaurantRatingLookup | ConsumerMenuItemRatingLookup): readonly ConsumerCurrentRatingRecord[] {
    const key = ratingLookupKey(lookup);
    return this.records.filter((record) => ratingLookupKey(record.target) === key).map(cloneRecord);
  }
}

function buildRecord(input: ConsumerCreateOrReplaceRatingInput, timestamp: string, version: number): ConsumerCurrentRatingRecord {
  const idPart = input.target.kind === "restaurant" ? input.target.restaurantId : input.target.menuItemId;
  const base = {
    ratingId: `mock-rating-${input.target.kind}-${slug(idPart)}-v${version}`,
    ratingValue: input.ratingValue,
    visibility: "private" as const,
    isCurrent: true,
    tasteFeeling: input.tasteFeeling ?? null,
    portionFeeling: input.portionFeeling ?? null,
    priceFeeling: input.priceFeeling ?? null,
    repurchaseIntent: input.repurchaseIntent ?? null,
    ratedAt: timestamp,
    updatedAt: timestamp
  };
  if (input.target.kind === "restaurant") {
    return { ...base, target: { ...input.target } };
  }
  const menuInput = input as ConsumerCreateOrReplaceMenuItemRatingInput;
  return {
    ...base,
    target: { ...menuInput.target },
    finished: menuInput.finished ?? null,
    dislikeReasons: [...(menuInput.dislikeReasons ?? [])]
  };
}

function cloneRecord(record: ConsumerCurrentRatingRecord): ConsumerCurrentRatingRecord {
  if (record.target.kind === "restaurant") return { ...record, target: { ...record.target } };
  const menuRecord = record as ConsumerCurrentMenuItemRatingRecord;
  return { ...menuRecord, target: { ...menuRecord.target }, dislikeReasons: [...menuRecord.dislikeReasons] };
}

function assertSingleCurrentRecordPerTarget(records: readonly ConsumerCurrentRatingRecord[]) {
  const currentKeys = new Set<string>();
  for (const record of records) {
    if (!record.isCurrent) continue;
    const key = ratingLookupKey(record.target);
    if (currentKeys.has(key)) {
      throw new ConsumerRatingConfigurationInvalidError(`Mock rating fixtures contain multiple current rows for ${key}.`);
    }
    currentKeys.add(key);
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "target";
}
