import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  ConsumerRecommendationFeedbackSource,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "./types";

export interface ConsumerRecommendationFeedbackRepository {
  readonly source: ConsumerRecommendationFeedbackSource;
  createCurrentUserRecommendationSession(
    input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult>;
  endCurrentUserRecommendationSession(
    input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult>;
  recordCurrentUserRecommendationFeedbackEvent(
    input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult>;
}
