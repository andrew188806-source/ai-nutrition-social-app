import type { ConsumerRecommendationFeedbackRepository } from "../ports";
import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "../types";

export class DisabledConsumerRecommendationFeedbackRepository
  implements ConsumerRecommendationFeedbackRepository
{
  readonly source = "disabled" as const;

  async createCurrentUserRecommendationSession(
    _input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult> {
    return { status: "disabled", source: this.source };
  }

  async endCurrentUserRecommendationSession(
    _input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult> {
    return { status: "disabled", source: this.source };
  }

  async recordCurrentUserRecommendationFeedbackEvent(
    _input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult> {
    return { status: "disabled", source: this.source };
  }
}
