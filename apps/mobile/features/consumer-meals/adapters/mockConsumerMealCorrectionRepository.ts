import type {
  ConsumerMealCorrectionDetail,
  ConsumerMealCorrectionItemOverview,
  ConsumerMealCorrectionOverview,
  ConsumerMealCorrectionReadInput,
  ConsumerMealCorrectionReadResult,
  ConsumerMealCorrectionRepository,
  ConsumerMealCorrectionSource
} from "../types";

// Deterministic mock meal record ID for Phase 2P contract smoke.
export const MOCK_CORRECTED_MEAL_RECORD_ID = "mock-meal-record-haochu-bowl-phase2p";

// Deterministic mock item ID for the confirmed correction.
const MOCK_CORRECTED_ITEM_ID = "mock-meal-record-item-chicken-breast-phase2p";

const mockCorrectionDetail: ConsumerMealCorrectionDetail = {
  correctionType: "nutrition_override",
  before: { calories: 620, protein: 38, carbohydrates: 58, fat: 22 },
  after: { calories: 580, protein: 42, carbohydrates: 52, fat: 20 }
};

const mockCorrectedItem: ConsumerMealCorrectionItemOverview = {
  mealRecordItemId: MOCK_CORRECTED_ITEM_ID,
  correctionStatus: "confirmed",
  correction: mockCorrectionDetail
};

const mockUncorrectedItem: ConsumerMealCorrectionItemOverview = {
  mealRecordItemId: "mock-meal-record-item-brown-rice-phase2p",
  correctionStatus: "none",
  correction: null
};

const mockCorrectionOverview: ConsumerMealCorrectionOverview = {
  mealRecordId: MOCK_CORRECTED_MEAL_RECORD_ID,
  items: [mockCorrectedItem, mockUncorrectedItem],
  hasAnyCorrections: true,
  correctionReadSource: "mock"
};

export class MockConsumerMealCorrectionRepository implements ConsumerMealCorrectionRepository {
  readonly source: ConsumerMealCorrectionSource = "mock";

  async getCurrentUserMealCorrectionOverview(input: ConsumerMealCorrectionReadInput): Promise<ConsumerMealCorrectionReadResult> {
    if (input.mealRecordId === MOCK_CORRECTED_MEAL_RECORD_ID) {
      return { status: "available", overview: mockCorrectionOverview };
    }
    return { status: "empty", mealRecordId: input.mealRecordId, correctionReadSource: this.source };
  }
}
