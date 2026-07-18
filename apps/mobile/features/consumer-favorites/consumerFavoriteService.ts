import type { ConsumerAuthPort } from "../consumer-auth/ports";
import {
  ConsumerFavoriteAuthenticationFailedError,
  ConsumerFavoriteAuthenticationRequiredError,
  ConsumerFavoriteReadFailedError,
  ConsumerFavoriteWriteFailedError,
  type ConsumerFavoriteRuntimeError
} from "./errors";
import type { ConsumerFavoriteReadRepository, ConsumerFavoriteWriteRepository } from "./ports";
import type {
  ConsumerFavoriteListInput,
  ConsumerFavoriteListResult,
  ConsumerFavoriteReadResult,
  ConsumerFavoriteTarget,
  ConsumerFavoriteWriteResult
} from "./types";
import { validateConsumerFavoriteListInput, validateConsumerFavoriteTarget } from "./validation";

export type ConsumerFavoriteServiceOptions = {
  authPort: ConsumerAuthPort;
  readRepository: ConsumerFavoriteReadRepository;
  writeRepository: ConsumerFavoriteWriteRepository;
  mockActorId?: string;
};

export class ConsumerFavoriteService {
  constructor(private readonly options: ConsumerFavoriteServiceOptions) {}

  async getCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteReadResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) {
      return { status: "invalid_target", source: this.options.readRepository.readSource, error: validation.error };
    }
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.readRepository.readSource, error: authError };
    try {
      return await this.options.readRepository.getCurrentUserFavorite(validation.value);
    } catch {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: new ConsumerFavoriteReadFailedError() };
    }
  }

  async listCurrentUserFavorites(input: ConsumerFavoriteListInput): Promise<ConsumerFavoriteListResult> {
    const validation = validateConsumerFavoriteListInput(input);
    if (!validation.ok) {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: validation.error };
    }
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.readRepository.readSource, error: authError };
    try {
      return await this.options.readRepository.listCurrentUserFavorites(input);
    } catch {
      return { status: "read_failed", source: this.options.readRepository.readSource, error: new ConsumerFavoriteReadFailedError() };
    }
  }

  async addCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) {
      return { status: "invalid_target", source: this.options.writeRepository.writeSource, error: validation.error };
    }
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.writeRepository.writeSource, error: authError };
    try {
      return await this.options.writeRepository.addCurrentUserFavorite(validation.value);
    } catch {
      return { status: "write_failed", source: this.options.writeRepository.writeSource, error: new ConsumerFavoriteWriteFailedError() };
    }
  }

  async removeCurrentUserFavorite(target: ConsumerFavoriteTarget): Promise<ConsumerFavoriteWriteResult> {
    const validation = validateConsumerFavoriteTarget(target);
    if (!validation.ok) {
      return { status: "invalid_target", source: this.options.writeRepository.writeSource, error: validation.error };
    }
    const authError = await this.getAuthenticationError();
    if (authError) return { status: "unauthenticated", source: this.options.writeRepository.writeSource, error: authError };
    try {
      return await this.options.writeRepository.removeCurrentUserFavorite(validation.value);
    } catch {
      return { status: "write_failed", source: this.options.writeRepository.writeSource, error: new ConsumerFavoriteWriteFailedError() };
    }
  }

  private async getAuthenticationError(): Promise<ConsumerFavoriteRuntimeError | null> {
    try {
      const result = await this.options.authPort.getCurrentSession();
      if (!result.ok) return new ConsumerFavoriteAuthenticationFailedError();
      if (!result.value) return new ConsumerFavoriteAuthenticationRequiredError();
      if (this.options.mockActorId && result.value.user.userId !== this.options.mockActorId) {
        return new ConsumerFavoriteAuthenticationFailedError();
      }
      return null;
    } catch {
      return new ConsumerFavoriteAuthenticationFailedError();
    }
  }
}
