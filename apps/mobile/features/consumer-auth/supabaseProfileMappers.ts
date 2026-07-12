import { ConsumerProfileMappingFailedError } from "./errors";
import type { ConsumerAccountLifecycleStatus, ConsumerProfile } from "./types";
import type { SupabaseConsumerProfileRowLike } from "./supabaseProfileContracts";

const lifecycleStatuses = new Set<ConsumerAccountLifecycleStatus>(["active", "disabled", "deletion_requested", "anonymizing", "anonymized", "deleted"]);

export function mapSupabaseProfileRowToConsumerProfile(row: SupabaseConsumerProfileRowLike | null | undefined, expectedUserId: string): ConsumerProfile {
  if (!row) throw new ConsumerProfileMappingFailedError("Supabase profile row is empty.");
  const rowUserId = requiredString(row.user_id ?? row.id, "user_id");
  if (rowUserId !== expectedUserId) throw new ConsumerProfileMappingFailedError("Supabase profile row does not belong to the authenticated user.");
  const status = normalizeLifecycleStatus(row.lifecycle_status ?? row.status);
  return {
    userId: rowUserId,
    profileId: requiredString(row.profile_id ?? row.id ?? row.user_id, "profile_id"),
    displayName: requiredString(row.display_name, "display_name"),
    nickname: optionalString(row.nickname),
    avatarUrl: optionalString(row.avatar_url ?? row.real_avatar_url) ?? null,
    locale: optionalString(row.locale) ?? "zh-TW",
    timezone: optionalString(row.timezone) ?? "Asia/Taipei",
    energyUnit: normalizeEnergyUnit(row.energy_unit),
    weightUnit: normalizeWeightUnit(row.weight_unit),
    lifecycleStatus: status,
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: normalizeIsoTimestamp(row.created_at, "created_at"),
    updatedAt: normalizeIsoTimestamp(row.updated_at, "updated_at")
  };
}

function requiredString(value: string | null | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConsumerProfileMappingFailedError(`Supabase profile row is missing ${field}.`);
  }
  return value;
}

function optionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeIsoTimestamp(value: string | null | undefined, field: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new ConsumerProfileMappingFailedError(`Supabase profile row has malformed ${field}.`);
  return new Date(value).toISOString();
}

function normalizeEnergyUnit(value: string | null | undefined): "kcal" {
  if (!value || value === "kcal") return "kcal";
  throw new ConsumerProfileMappingFailedError("Supabase profile row has unsupported energy_unit.");
}

function normalizeWeightUnit(value: string | null | undefined): "kg" {
  if (!value || value === "kg") return "kg";
  throw new ConsumerProfileMappingFailedError("Supabase profile row has unsupported weight_unit.");
}

function normalizeLifecycleStatus(value: string | null | undefined): ConsumerAccountLifecycleStatus {
  const status = value ?? "active";
  if (lifecycleStatuses.has(status as ConsumerAccountLifecycleStatus)) return status as ConsumerAccountLifecycleStatus;
  throw new ConsumerProfileMappingFailedError("Supabase profile row has unsupported lifecycle status.");
}
