import type {
  ConsumerFavoriteListInput,
  ConsumerFavoriteListResult,
  ConsumerFavoriteReadResult,
  ConsumerFavoriteReadSource,
  ConsumerFavoriteTarget,
  ConsumerFavoriteWriteResult,
  ConsumerFavoriteWriteSource
} from "./types";

export interface ConsumerFavoriteReadRepository {
  readonly readSource: ConsumerFavoriteReadSource;
  getCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteReadResult>;
  listCurrentUserFavorites(input: ConsumerFavoriteListInput): Promise<ConsumerFavoriteListResult>;
}

export interface ConsumerFavoriteWriteRepository {
  readonly writeSource: ConsumerFavoriteWriteSource;
  addCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult>;
  removeCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult>;
}
