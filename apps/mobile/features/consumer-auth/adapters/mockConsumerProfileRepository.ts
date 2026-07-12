import { ConsumerAccountDisabledError, ConsumerProfileMappingError, ConsumerProfileNotFoundError } from "../errors";
import type { ConsumerProfileRepository } from "../ports";
import type { ConsumerAccountLifecycleStatus, ConsumerPrivateProfile, ConsumerProfile, ConsumerProfileBootstrapInput, ConsumerProfileUpdateInput } from "../types";
import { err, ok } from "../types";

const nowIso = () => new Date().toISOString();

export type MockConsumerProfileRepositoryOptions = {
  profiles?: readonly ConsumerProfile[];
  privateProfiles?: readonly ConsumerPrivateProfile[];
};

export class MockConsumerProfileRepository implements ConsumerProfileRepository {
  readonly source = "mock" as const;
  private readonly profiles = new Map<string, ConsumerProfile>();
  private readonly privateProfiles = new Map<string, ConsumerPrivateProfile>();

  constructor(options: MockConsumerProfileRepositoryOptions = {}) {
    for (const profile of options.profiles ?? [buildDefaultMockConsumerProfile()]) {
      this.profiles.set(profile.userId, profile);
    }
    for (const privateProfile of options.privateProfiles ?? [buildDefaultMockPrivateProfile()]) {
      this.privateProfiles.set(privateProfile.userId, privateProfile);
    }
  }

  async getProfile(userId: string) {
    return ok(this.profiles.get(userId) ?? null);
  }

  async getPrivateProfile(userId: string) {
    return ok(this.privateProfiles.get(userId) ?? null);
  }

  async bootstrapProfile(input: ConsumerProfileBootstrapInput) {
    if (!input.userId) return err(new ConsumerProfileMappingError("Bootstrap input is missing userId."));
    const existing = this.profiles.get(input.userId);
    if (existing) return ok({ profile: existing, created: false, requestId: input.requestId });

    const profile = buildDefaultMockConsumerProfile({
      userId: input.userId,
      profileId: input.userId,
      displayName: input.displayName ?? "好廚使用者",
      locale: input.locale ?? "zh-TW",
      timezone: input.timezone ?? "Asia/Taipei"
    });
    const privateProfile = buildDefaultMockPrivateProfile({ userId: input.userId, profileId: profile.profileId });
    this.profiles.set(profile.userId, profile);
    this.privateProfiles.set(privateProfile.userId, privateProfile);
    return ok({ profile, created: true, requestId: input.requestId });
  }

  async updateProfile(userId: string, input: ConsumerProfileUpdateInput) {
    const existing = this.profiles.get(userId);
    if (!existing) return err(new ConsumerProfileNotFoundError());
    if (existing.lifecycleStatus === "disabled") return err(new ConsumerAccountDisabledError());
    const next: ConsumerProfile = { ...existing, ...input, updatedAt: nowIso() };
    this.profiles.set(userId, next);
    return ok(next);
  }

  async markOnboardingComplete(userId: string) {
    return this.updateProfile(userId, { onboardingComplete: true } as ConsumerProfileUpdateInput & { onboardingComplete: true });
  }

  async getAccountLifecycleStatus(userId: string) {
    const profile = this.profiles.get(userId);
    if (!profile) return err(new ConsumerProfileNotFoundError());
    return ok(profile.lifecycleStatus);
  }
}

export function buildDefaultMockConsumerProfile(overrides: Partial<ConsumerProfile> = {}): ConsumerProfile {
  const now = nowIso();
  const userId = overrides.userId ?? "current-user";
  return {
    userId,
    profileId: overrides.profileId ?? userId,
    displayName: overrides.displayName ?? "好廚示範使用者",
    nickname: overrides.nickname,
    avatarUrl: overrides.avatarUrl ?? null,
    locale: overrides.locale ?? "zh-TW",
    timezone: overrides.timezone ?? "Asia/Taipei",
    energyUnit: "kcal",
    weightUnit: "kg",
    lifecycleStatus: overrides.lifecycleStatus ?? "active",
    onboardingComplete: overrides.onboardingComplete ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

export function buildDefaultMockPrivateProfile(overrides: Partial<ConsumerPrivateProfile> = {}): ConsumerPrivateProfile {
  const now = nowIso();
  const userId = overrides.userId ?? "current-user";
  return {
    userId,
    profileId: overrides.profileId ?? userId,
    privateProfileReady: overrides.privateProfileReady ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

export function isClosedLifecycle(status: ConsumerAccountLifecycleStatus) {
  return status === "disabled" || status === "deletion_requested" || status === "anonymizing" || status === "anonymized" || status === "deleted";
}