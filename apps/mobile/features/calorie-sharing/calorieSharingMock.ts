import { storage } from "../../lib/storage";
import type { TableId, UserId } from "../meal-buddy-card/types";
import type { GroupCalorieImport, GroupCalorieShare } from "./calorieSharingTypes";

// TODO(engineering):
// - Current state: group calorie sharing cards and member imports use the shared demo storage adapter.
// - Intended future integration: replace with group-table calorie-sharing APIs.
// - Related feature: Group Tables -> 桌長記錄本桌熱量 -> 加入我的今日攝取.
const groupShareStorageKey = "haocu.calorieSharing.groupShares.v1";
const groupImportStorageKey = "haocu.calorieSharing.groupImports.v1";

const seedGroupShares: GroupCalorieShare[] = [
  {
    groupTableId: "table-japanese-dinner",
    hostUserId: "mina",
    photoIds: ["photo-japanese-dinner-1", "photo-japanese-dinner-2"],
    estimatedTotalCalories: 2720,
    peopleCount: 4,
    averageCaloriesPerPerson: 680,
    createdAt: "2026-06-01T19:30:00+08:00",
    sharedCardId: "share-card-japanese-dinner-001"
  }
];

let groupShares: GroupCalorieShare[] = (() => {
  const stored = readStored<GroupCalorieShare>(groupShareStorageKey);
  return stored.length > 0 ? stored : seedGroupShares;
})();
let groupImports: GroupCalorieImport[] = readStored<GroupCalorieImport>(groupImportStorageKey);

export function saveGroupCalorieShare(share: GroupCalorieShare) {
  // Backend integration entry: Group Tables -> 桌長記錄本桌熱量 -> group table chat/detail.
  groupShares = [share, ...groupShares];
  storage.setItem(groupShareStorageKey, JSON.stringify(groupShares));
  return share;
}

export function getGroupCalorieShares(groupTableId?: TableId): GroupCalorieShare[] {
  if (!groupTableId) {
    return [...groupShares];
  }
  return groupShares.filter((share) => share.groupTableId === groupTableId);
}

export function getLatestGroupCalorieShare(groupTableId?: TableId): GroupCalorieShare | null {
  return getGroupCalorieShares(groupTableId)[0] ?? null;
}

export function saveGroupCalorieImport(record: GroupCalorieImport) {
  // Backend integration entry: 加入我的今日攝取 -> that member's meal records / Today's Nutrition only.
  groupImports = [record, ...groupImports];
  storage.setItem(groupImportStorageKey, JSON.stringify(groupImports));
  return record;
}

export function getGroupCalorieImports(groupTableId?: TableId, userId?: UserId): GroupCalorieImport[] {
  return groupImports.filter((record) => (groupTableId ? record.groupTableId === groupTableId : true) && (userId ? record.userId === userId : true));
}

export function hasImportedGroupCalorieShare(groupTableId: TableId, userId: UserId): boolean {
  return groupImports.some((record) => record.groupTableId === groupTableId && record.userId === userId);
}

function readStored<T>(key: string): T[] {
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
