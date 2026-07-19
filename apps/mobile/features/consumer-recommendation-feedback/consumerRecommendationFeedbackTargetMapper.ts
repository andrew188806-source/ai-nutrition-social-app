import type { ConsumerRecommendationFeedbackTarget } from "./types";

export type ConsumerRecommendationFeedbackCanonicalTargetSource =
  | { kind: "recommendation"; recommendationId?: string | null; identityEvidence: ConsumerRecommendationFeedbackIdentityEvidence }
  | { kind: "restaurant"; restaurantId?: string | null; branchId?: string | null; identityEvidence: ConsumerRecommendationFeedbackIdentityEvidence }
  | { kind: "menu_item"; restaurantId?: string | null; branchId?: string | null; menuItemId?: string | null; identityEvidence: ConsumerRecommendationFeedbackIdentityEvidence };

export type ConsumerRecommendationFeedbackIdentityEvidence =
  | "canonical"
  | "display_name"
  | "array_index"
  | "local_meal_id"
  | "rating_id"
  | "presentation_card_id";

export type ConsumerRecommendationFeedbackTargetMapping =
  | { status: "available"; target: ConsumerRecommendationFeedbackTarget }
  | { status: "target_unavailable"; reason: ConsumerRecommendationFeedbackTargetUnavailableReason };

export type ConsumerRecommendationFeedbackTargetUnavailableReason =
  | "identity_not_canonical"
  | "invalid_target_id"
  | "restaurant_id_missing"
  | "menu_item_parent_missing"
  | "unsupported_target_kind"
  | "cross_kind_fields";

const forbiddenPrefix = /^(?:fav-|meal-record-|local-meal-|rating-|presentation-|card-)/i;
const displayText = /\s|[\u3400-\u9fff]/u;

export function mapConsumerRecommendationFeedbackTarget(
  source: ConsumerRecommendationFeedbackCanonicalTargetSource | Record<string, unknown> | null | undefined
): ConsumerRecommendationFeedbackTargetMapping {
  if (!source || typeof source !== "object") return unavailable("unsupported_target_kind");
  if (source.identityEvidence !== "canonical") return unavailable("identity_not_canonical");

  if (source.kind === "recommendation") {
    if (!exactKeys(source, ["kind", "recommendationId", "identityEvidence"])) return unavailable("cross_kind_fields");
    const recommendationId = canonicalId(source.recommendationId);
    return recommendationId
      ? { status: "available", target: { kind: "recommendation", recommendationId } }
      : unavailable("invalid_target_id");
  }

  if (source.kind === "restaurant") {
    if (!exactKeys(source, ["kind", "restaurantId", "branchId", "identityEvidence"])) return unavailable("cross_kind_fields");
    const restaurantId = canonicalId(source.restaurantId);
    if (!restaurantId) return unavailable("restaurant_id_missing");
    const branch = optionalCanonicalId(source.branchId);
    if (!branch.ok) return unavailable("invalid_target_id");
    return { status: "available", target: { kind: "restaurant", restaurantId, branchId: branch.value } };
  }

  if (source.kind === "menu_item") {
    if (!exactKeys(source, ["kind", "restaurantId", "branchId", "menuItemId", "identityEvidence"])) return unavailable("cross_kind_fields");
    const restaurantId = canonicalId(source.restaurantId);
    const menuItemId = canonicalId(source.menuItemId);
    if (!menuItemId || !restaurantId) return unavailable("menu_item_parent_missing");
    const branch = optionalCanonicalId(source.branchId);
    if (!branch.ok) return unavailable("invalid_target_id");
    return { status: "available", target: { kind: "menu_item", restaurantId, menuItemId, branchId: branch.value } };
  }

  return unavailable("unsupported_target_kind");
}

function canonicalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || forbiddenPrefix.test(normalized) || displayText.test(normalized)) return null;
  return normalized;
}

function optionalCanonicalId(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  const normalized = canonicalId(value);
  return normalized ? { ok: true, value: normalized } : { ok: false };
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && allowed.filter((key) => key !== "branchId").every((key) => keys.includes(key));
}

function unavailable(reason: ConsumerRecommendationFeedbackTargetUnavailableReason): ConsumerRecommendationFeedbackTargetMapping {
  return { status: "target_unavailable", reason };
}
