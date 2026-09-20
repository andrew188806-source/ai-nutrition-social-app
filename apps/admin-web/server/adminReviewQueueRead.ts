import "server-only";

import { RESTAURANT_LIST_MAX_PAGE, RESTAURANT_LIST_PAGE_SIZE, call, int, isRec, list, parsePage, str, strOrNull } from "./adminRestaurantRead";
import type { ReadResult } from "./adminRestaurantRead";

/**
 * ADMIN-C read layer over the four read-only review-queue contracts. It reuses the ADMIN-B shared call site (the only
 * `.rpc` in the Admin read layer): the signed-in staff session calls the contract, the envelope is validated strictly
 * (`forbidden` / `invalid_request` stay distinct, malformed or errored -> `unavailable`, never an empty list). There is
 * no table access, no fallback, no mock data and no mutation.
 */

const CONTRACTS = Object.freeze({
  overview: "staff_admin_menu_management_overview_v1",
  pending: "staff_admin_menu_management_pending_v1",
  dataQuality: "staff_admin_menu_management_data_quality_v1",
  certificationPending: "staff_admin_nutrition_certification_pending_v1"
} as const);

export type QueueItemRow = Readonly<{
  menuItemId: string; name: string; itemStatus: string;
  restaurantId: string; restaurantName: string;
  menuId: string; menuName: string; menuStatus: string; menuRestaurantId: string; categoryName: string;
  reasons: readonly string[];
}>;
export type QueueListData<T> = Readonly<{ items: readonly T[]; limit: number; offset: number; hasMore: boolean }>;
export type CertificationRow = QueueItemRow & Readonly<{
  nutritionBadgeStatus: string; pendingRecordCount: number; latestPendingRecordAt: string | null; latestPendingRecordSource: string | null;
}>;
export type OverviewRow = Readonly<{
  restaurantId: string; name: string; status: string;
  menuCount: number; draftMenuCount: number; publishedMenuCount: number; archivedMenuCount: number;
  itemCount: number; draftItemCount: number; activeItemCount: number; archivedItemCount: number;
}>;
export type OverviewData = QueueListData<OverviewRow> & Readonly<{
  totals: Readonly<{
    restaurantCount: number;
    menusByStatus: Readonly<{ draft: number; published: number; archived: number }>;
    itemsByStatus: Readonly<{ draft: number; active: number; archived: number }>;
  }>;
}>;

function parseReasons(v: unknown): string[] | null {
  if (!list(v) || v.length === 0) return null;
  const out: string[] = [];
  for (const r of v) { if (!str(r)) return null; out.push(r); }
  return out;
}
function parseQueueRow(m: unknown): QueueItemRow | null {
  if (!isRec(m) || !str(m.menuItemId) || !str(m.name) || !str(m.itemStatus) || !str(m.restaurantId) || !str(m.restaurantName)
    || !str(m.menuId) || !str(m.menuName) || !str(m.menuStatus) || !str(m.menuRestaurantId) || !str(m.categoryName)) return null;
  const reasons = parseReasons(m.reasons);
  if (reasons === null) return null;
  return Object.freeze({ menuItemId: m.menuItemId, name: m.name, itemStatus: m.itemStatus, restaurantId: m.restaurantId, restaurantName: m.restaurantName,
    menuId: m.menuId, menuName: m.menuName, menuStatus: m.menuStatus, menuRestaurantId: m.menuRestaurantId, categoryName: m.categoryName, reasons: Object.freeze(reasons) });
}
function parseCertificationRow(m: unknown): CertificationRow | null {
  const base = parseQueueRow(m);
  if (!base || !isRec(m) || !str(m.nutritionBadgeStatus) || !int(m.pendingRecordCount) || !strOrNull(m.latestPendingRecordAt) || !strOrNull(m.latestPendingRecordSource)) return null;
  return Object.freeze({ ...base, nutritionBadgeStatus: m.nutritionBadgeStatus, pendingRecordCount: m.pendingRecordCount,
    latestPendingRecordAt: m.latestPendingRecordAt, latestPendingRecordSource: m.latestPendingRecordSource });
}
function parseOverviewRow(m: unknown): OverviewRow | null {
  if (!isRec(m) || !str(m.restaurantId) || !str(m.name) || !str(m.status) || !int(m.menuCount) || !int(m.draftMenuCount) || !int(m.publishedMenuCount)
    || !int(m.archivedMenuCount) || !int(m.itemCount) || !int(m.draftItemCount) || !int(m.activeItemCount) || !int(m.archivedItemCount)) return null;
  return Object.freeze({ restaurantId: m.restaurantId, name: m.name, status: m.status, menuCount: m.menuCount, draftMenuCount: m.draftMenuCount,
    publishedMenuCount: m.publishedMenuCount, archivedMenuCount: m.archivedMenuCount, itemCount: m.itemCount, draftItemCount: m.draftItemCount,
    activeItemCount: m.activeItemCount, archivedItemCount: m.archivedItemCount });
}
const triple = (v: unknown, keys: readonly [string, string, string]): Record<string, number> | null => {
  if (!isRec(v)) return null;
  const out: Record<string, number> = {};
  for (const k of keys) { const x = v[k]; if (!int(x)) return null; out[k] = x; }
  return out;
};

const validPage = (page: number): boolean => Number.isInteger(page) && page >= 1 && page <= RESTAURANT_LIST_MAX_PAGE;

function readQueue<T>(contract: string, page: number, row: (v: unknown) => T | null): Promise<ReadResult<QueueListData<T>>> {
  if (!validPage(page)) return Promise.resolve({ state: "invalid_request" });
  const offset = (page - 1) * RESTAURANT_LIST_PAGE_SIZE;
  return call(contract, { p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset }, (raw) => {
    const parsed = parsePage(raw, row);
    return parsed && parsed.limit === RESTAURANT_LIST_PAGE_SIZE && parsed.offset === offset ? Object.freeze(parsed) : null;
  });
}

export function readMenuManagementPending(page: number): Promise<ReadResult<QueueListData<QueueItemRow>>> {
  return readQueue(CONTRACTS.pending, page, parseQueueRow);
}
export function readMenuManagementDataQuality(page: number): Promise<ReadResult<QueueListData<QueueItemRow>>> {
  return readQueue(CONTRACTS.dataQuality, page, parseQueueRow);
}
export function readNutritionCertificationPending(page: number): Promise<ReadResult<QueueListData<CertificationRow>>> {
  return readQueue(CONTRACTS.certificationPending, page, parseCertificationRow);
}
export function readMenuManagementOverview(page: number): Promise<ReadResult<OverviewData>> {
  if (!validPage(page)) return Promise.resolve({ state: "invalid_request" });
  const offset = (page - 1) * RESTAURANT_LIST_PAGE_SIZE;
  return call(CONTRACTS.overview, { p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset }, (raw) => {
    const parsed = parsePage(raw, parseOverviewRow);
    if (!parsed || parsed.limit !== RESTAURANT_LIST_PAGE_SIZE || parsed.offset !== offset || !isRec(raw.totals) || !int(raw.totals.restaurantCount)) return null;
    const menus = triple(raw.totals.menusByStatus, ["draft", "published", "archived"]);
    const items = triple(raw.totals.itemsByStatus, ["draft", "active", "archived"]);
    if (!menus || !items) return null;
    return Object.freeze({ ...parsed, totals: Object.freeze({ restaurantCount: raw.totals.restaurantCount,
      menusByStatus: Object.freeze({ draft: menus.draft, published: menus.published, archived: menus.archived }),
      itemsByStatus: Object.freeze({ draft: items.draft, active: items.active, archived: items.archived }) }) });
  });
}
