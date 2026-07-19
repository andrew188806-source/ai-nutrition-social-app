import type { ConsumerAuthPort } from "../consumer-auth/ports";
import {
  ConsumerRecommendationFeedbackAuthenticationFailedError,
  ConsumerRecommendationFeedbackAuthenticationRequiredError,
  type ConsumerRecommendationFeedbackRuntimeError
} from "./errors";
import type { ConsumerRecommendationFeedbackRepository } from "./ports";
import type {
  ConsumerCreateRecommendationSessionResult,
  ConsumerEndRecommendationSessionResult,
  ConsumerRecordRecommendationFeedbackResult,
  ConsumerRecommendationFeedbackSource,
  CreateRecommendationSessionInput,
  EndRecommendationSessionInput,
  RecordRecommendationFeedbackEventInput
} from "./types";
import {
  validateCreateRecommendationSessionInput,
  validateEndRecommendationSessionInput,
  validateRecordRecommendationFeedbackEventInput
} from "./validation";

export type ConsumerRecommendationFeedbackServiceOptions = {
  authPort: ConsumerAuthPort;
  repository: ConsumerRecommendationFeedbackRepository;
};

export class ConsumerRecommendationFeedbackService {
  constructor(private readonly options: ConsumerRecommendationFeedbackServiceOptions) {}

  get source(): ConsumerRecommendationFeedbackSource {
    return this.options.repository.source;
  }

  async createCurrentUserRecommendationSession(
    input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult> {
    const src = this.options.repository.source;
    if (src === "disabled") {
      return this.options.repository.createCurrentUserRecommendationSession(input);
    }
    const validation = validateCreateRecommendationSessionInput(input);
    if (!validation.ok) {
      return { status: "invalid_input", source: src, errorCode: validation.error.code };
    }
    const authError = await this.getAuthError();
    if (authError) return { status: "unauthenticated", source: src };
    try {
      return await this.options.repository.createCurrentUserRecommendationSession(input);
    } catch {
      return { status: "create_failed", source: src, errorCode: "feedback_write_failed" };
    }
  }

  async endCurrentUserRecommendationSession(
    input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult> {
    const src = this.options.repository.source;
    if (src === "disabled") {
      return this.options.repository.endCurrentUserRecommendationSession(input);
    }
    const validation = validateEndRecommendationSessionInput(input);
    if (!validation.ok) {
      return { status: "end_failed", source: src, errorCode: validation.error.code };
    }
    const authError = await this.getAuthError();
    if (authError) return { status: "unauthenticated", source: src };
    try {
      return await this.options.repository.endCurrentUserRecommendationSession(input);
    } catch {
      return { status: "end_failed", source: src, errorCode: "feedback_write_failed" };
    }
  }

  async recordCurrentUserRecommendationFeedbackEvent(
    input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult> {
    const src = this.options.repository.source;
    if (src === "disabled") {
      return this.options.repository.recordCurrentUserRecommendationFeedbackEvent(input);
    }
    const validation = validateRecordRecommendationFeedbackEventInput(input);
    if (!validation.ok) {
      if (validation.error.code === "feedback_action_invalid") {
        return { status: "invalid_action", source: src, errorCode: validation.error.code };
      }
      if (validation.error.code === "feedback_ownership_field_rejected") {
        return { status: "invalid_target", source: src, errorCode: validation.error.code };
      }
      return { status: "invalid_target", source: src, errorCode: validation.error.code };
    }
    const authError = await this.getAuthError();
    if (authError) return { status: "unauthenticated", source: src };
    try {
      return await this.options.repository.recordCurrentUserRecommendationFeedbackEvent(input);
    } catch {
      return { status: "write_failed", source: src, errorCode: "feedback_write_failed" };
    }
  }

  private async getAuthError(): Promise<ConsumerRecommendationFeedbackRuntimeError | null> {
    try {
      const result = await this.options.authPort.getCurrentSession();
      if (!result.ok) return new ConsumerRecommendationFeedbackAuthenticationFailedError();
      return result.value ? null : new ConsumerRecommendationFeedbackAuthenticationRequiredError();
    } catch {
      return new ConsumerRecommendationFeedbackAuthenticationFailedError();
    }
  }
}
