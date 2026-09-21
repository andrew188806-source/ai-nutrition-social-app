import "server-only";

import { call, int, isRec, list, parsePage, str, strOrNull, type ReadResult } from "./adminRestaurantRead";

/** ADMIN-D read layer: two authenticated session RPCs, strict envelopes, no table access or fallback data. */

const CONTRACTS = Object.freeze({
  dashboard: "staff_admin_dashboard_counts_v1",
  socialPolicies: "staff_admin_social_policies_v1"
} as const);

export const SOCIAL_POLICY_PAGE_SIZE = 50;
export const SOCIAL_POLICY_MAX_PAGE = 200;

export type DashboardCounts = Readonly<{
  restaurants: number;
  branches: number;
  menus: number;
  menuItems: number;
  draftMenuItems: number;
  dataQualityMenuItems: number;
  nutritionReviewPendingMenuItems: number;
}>;

export type SocialPolicyLabel = Readonly<{ locale: string; label: string }>;
export type SocialPolicyRow = Readonly<{
  tagKey: string;
  namespace: string;
  parentKey: string | null;
  depth: number;
  selectable: boolean;
  displayOrder: number;
  active: boolean;
  labels: readonly SocialPolicyLabel[];
}>;
export type SocialPolicyPage = Readonly<{
  items: readonly SocialPolicyRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
}>;

function parseDashboardCounts(raw: Record<string, unknown>): DashboardCounts | null {
  if (!isRec(raw.counts)) return null;
  const c = raw.counts;
  const keys = ["restaurants", "branches", "menus", "menuItems", "draftMenuItems", "dataQualityMenuItems", "nutritionReviewPendingMenuItems"] as const;
  if (!keys.every((key) => int(c[key]))) return null;
  return Object.freeze({
    restaurants: c.restaurants as number,
    branches: c.branches as number,
    menus: c.menus as number,
    menuItems: c.menuItems as number,
    draftMenuItems: c.draftMenuItems as number,
    dataQualityMenuItems: c.dataQualityMenuItems as number,
    nutritionReviewPendingMenuItems: c.nutritionReviewPendingMenuItems as number
  });
}

function parseLabels(value: unknown): SocialPolicyLabel[] | null {
  if (!list(value)) return null;
  const labels: SocialPolicyLabel[] = [];
  for (const item of value) {
    if (!isRec(item) || !str(item.locale) || !str(item.label)) return null;
    labels.push(Object.freeze({ locale: item.locale, label: item.label }));
  }
  return labels;
}

function parseSocialPolicyRow(value: unknown): SocialPolicyRow | null {
  if (!isRec(value) || !str(value.tagKey) || !str(value.namespace) || !strOrNull(value.parentKey)
    || !int(value.depth) || typeof value.selectable !== "boolean" || !int(value.displayOrder) || typeof value.active !== "boolean") return null;
  const labels = parseLabels(value.labels);
  if (labels === null) return null;
  return Object.freeze({ tagKey: value.tagKey, namespace: value.namespace, parentKey: value.parentKey,
    depth: value.depth, selectable: value.selectable, displayOrder: value.displayOrder, active: value.active,
    labels: Object.freeze(labels) });
}

export function readDashboardCounts(): Promise<ReadResult<DashboardCounts>> {
  return call(CONTRACTS.dashboard, {}, parseDashboardCounts);
}

export function readSocialPolicies(page: number): Promise<ReadResult<SocialPolicyPage>> {
  if (!Number.isInteger(page) || page < 1 || page > SOCIAL_POLICY_MAX_PAGE) return Promise.resolve({ state: "invalid_request" });
  const offset = (page - 1) * SOCIAL_POLICY_PAGE_SIZE;
  return call(CONTRACTS.socialPolicies, { p_limit: SOCIAL_POLICY_PAGE_SIZE, p_offset: offset }, (raw) => {
    const parsed = parsePage(raw, parseSocialPolicyRow);
    return parsed && parsed.limit === SOCIAL_POLICY_PAGE_SIZE && parsed.offset === offset ? Object.freeze(parsed) : null;
  });
}
