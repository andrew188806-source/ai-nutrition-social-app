import { ConsumerFavoriteReadDisabledError, ConsumerFavoriteWriteDisabledError } from "../errors";
import type { ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository } from "../ports";
import type {
  ConsumerFavoriteListInput,
  ConsumerFavoriteListResult,
  ConsumerFavoriteReadResult,
  ConsumerFavoriteTarget,
  ConsumerFavoriteWriteResult
} from "../types";

export class DisabledConsumerFavoriteRepository implements ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository {
  readonly readSource = "disabled" as const;
  readonly writeSource = "disabled" as const;

  async getCurrentUserFavorite(_target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteReadResult> {
    return { status: "disabled", source: this.readSource, error: new ConsumerFavoriteReadDisabledError() };
  }

  async listCurrentUserFavorites(_input: ConsumerFavoriteListInput): Promise<ConsumerFavoriteListResult> {
    return { status: "disabled", source: this.readSource, error: new ConsumerFavoriteReadDisabledError() };
  }

  async addCurrentUserFavorite(_target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    return { status: "disabled", source: this.writeSource, error: new ConsumerFavoriteWriteDisabledError() };
  }

  async removeCurrentUserFavorite(_target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    return { status: "disabled", source: this.writeSource, error: new ConsumerFavoriteWriteDisabledError() };
  }
}
