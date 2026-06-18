import { storage } from "../../lib/storage";
import type { ChatId, TableId, UserId } from "../meal-buddy-card/types";

// DEMO_ONLY MOCK_DATA TODO_SUPABASE_REPLACE:
// Local active group-table state. profileId/participantProfileIds are person identities;
// tableId is only the group-table identity and must never be used as profileId.

export type ActiveFourPersonTable = {
  tableId: TableId;
  restaurantId: string;
  restaurantName: string;
  location: string;
  cuisineTags: string[];
  suggestedTime: string;
  maxParticipants: 4 | 6 | 8;
  hostProfileId?: UserId;
  participantProfileIds: UserId[];
  status: "招募中" | "已成團";
  groupChatThreadId?: ChatId;
};

type StoredActiveFourPersonTable = ActiveFourPersonTable & {
  participantIds?: UserId[];
};

// TODO(engineering):
// - Current state: the demo persists one active hosted table through the shared storage adapter.
// - Intended future integration: replace with group-table APIs and realtime participant updates.
// - Related feature: Restaurants -> Four-Person Tables -> Group Chat.
const activeTableStorageKey = "haocu.fourPersonTable.active.v1";
let activeTable = readStoredActiveTable();

export function getActiveFourPersonTable() {
  return activeTable;
}

export function createRestaurantFourPersonTable(input: {
  restaurantId: string;
  restaurantName: string;
  location: string;
  cuisineTags: string[];
  suggestedTime: string;
}) {
  // Backend integration entry: Restaurant -> Four-Person Table.
  activeTable = {
    tableId: `table-${safeId(input.restaurantId || input.restaurantName)}`,
    restaurantId: input.restaurantId,
    restaurantName: input.restaurantName,
    location: input.location,
    cuisineTags: input.cuisineTags,
    suggestedTime: input.suggestedTime,
    maxParticipants: 4,
    hostProfileId: "current-user",
    participantProfileIds: ["current-user"],
    status: "招募中"
  };
  persistActiveTable();
  return activeTable;
}

export function updateActiveFourPersonTable(update: Partial<ActiveFourPersonTable>) {
  if (!activeTable) {
    return null;
  }
  activeTable = normalizeActiveTable({ ...activeTable, ...update });
  persistActiveTable();
  return activeTable;
}

export function clearActiveFourPersonTable() {
  activeTable = null;
  storage.removeItem(activeTableStorageKey);
}

function readStoredActiveTable(): ActiveFourPersonTable | null {
  const raw = storage.getItem(activeTableStorageKey);
  if (!raw) {
    return null;
  }
  try {
    return normalizeActiveTable(JSON.parse(raw) as StoredActiveFourPersonTable);
  } catch {
    return null;
  }
}

function persistActiveTable() {
  if (!activeTable) {
    storage.removeItem(activeTableStorageKey);
    return;
  }
  storage.setItem(activeTableStorageKey, JSON.stringify(activeTable));
}

function safeId(value: string) {
  return encodeURIComponent(value).replace(/%/g, "").toLowerCase();
}

function normalizeActiveTable(table: StoredActiveFourPersonTable): ActiveFourPersonTable {
  const participantProfileIds = table.participantProfileIds ?? table.participantIds ?? [];
  return {
    tableId: table.tableId,
    restaurantId: table.restaurantId,
    restaurantName: table.restaurantName,
    location: table.location,
    cuisineTags: table.cuisineTags,
    suggestedTime: table.suggestedTime,
    maxParticipants: table.maxParticipants,
    hostProfileId: table.hostProfileId ?? participantProfileIds[0] ?? "current-user",
    participantProfileIds,
    status: table.status,
    groupChatThreadId: table.groupChatThreadId
  };
}
