import type {
  ConsumerNextMealDataProvenance,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationRepositoryInput,
  ConsumerNextMealRecommendationRepositoryResult,
  ConsumerNextMealRecommendationSource
} from "../types";

export class DisabledConsumerNextMealRecommendationRepository implements ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource = "disabled";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "sample";

  async getRankedNextMealCandidates(
    _input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    return { status: "disabled" };
  }
}
