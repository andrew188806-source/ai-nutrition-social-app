import { buildMealPhotoAnalysisResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { errAnalysis, okAnalysis, MealPhotoAnalysisClientError, type MealPhotoAnalysisClientInput } from "../types";
import type { MealPhotoAnalysisRepository } from "../ports";

export type MockMealPhotoAnalysisRepositoryOptions = {
  authPort: ConsumerAuthPort;
};

let mockCandidateIdCounter = 0;
function nextMockCandidateId(): string {
  mockCandidateIdCounter += 1;
  const suffix = mockCandidateIdCounter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

// Explicit-demo mock: every observedName is prefixed so this can never be mistaken for a real AI
// candidate at the data layer, on top of the UI's own mock-mode badge (analysis.tsx). Uses the
// same shared buildMealPhotoAnalysisResponseV1 authority a real provider result would go through
// — never a hand-rolled response shape — so this mock can never silently drift out of contract
// shape. Reads the current actor from the same ConsumerAuthPort every other mock repository in
// this repo uses, matching MockMealPhotoUploadRepository's convention.
export class MockMealPhotoAnalysisRepository implements MealPhotoAnalysisRepository {
  readonly source = "mock" as const;

  constructor(private readonly options: MockMealPhotoAnalysisRepositoryOptions) {}

  async analyzeMealPhoto(_input: MealPhotoAnalysisClientInput) {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errAnalysis(new MealPhotoAnalysisClientError("authentication_required", "Meal photo analysis requires an authenticated session."));
    }

    const response = buildMealPhotoAnalysisResponseV1({
      providerCategory: "external_multimodal",
      analysisEngineVersion: "mock-demo-v1",
      promptVersion: "mock-demo-prompt-v1",
      analysisStatus: "low_confidence",
      rawOutput: {
        candidates: [
          {
            observedName: "示範資料：白飯與滷肉（非真實 AI 結果）",
            components: [
              { name: "示範：白飯", estimatedPortion: "約一碗" },
              { name: "示範：滷肉", estimatedPortion: "約 100 公克" }
            ],
            estimatedNutrition: { calories: 550, proteinGrams: 22, carbsGrams: 70, fatGrams: 18 },
            confidence: 0.4,
            uncertaintyReasonCodes: ["unfamiliar_dish"]
          }
        ]
      },
      safeUserFacingErrorCode: null,
      safeUserFacingErrorMessage: null,
      generateCandidateId: nextMockCandidateId
    });

    return okAnalysis(response);
  }
}
