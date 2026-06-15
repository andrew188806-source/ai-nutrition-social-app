import { storage } from "../../lib/storage";
import type { ChatId, TableId, UserId } from "../meal-buddy-card/types";

export type ActiveFourPersonTable = {
  tableId: TableId;
  restaurantId: string;
  restaurantName: string;
  location: string;
  cuisineTags: string[];
  suggestedTime: string;
  maxParticipants: 4 | 6 | 8;
  participantIds: UserId[];
  status: "招募中" | "已成團";
  groupChatThreadId?: ChatId;
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
    participantIds: ["demo-user"],
    status: "招募中"
  };
  persistActiveTable();
  return activeTable;
}

export function updateActiveFourPersonTable(update: Partial<ActiveFourPersonTable>) {
  if (!activeTable) {
    return null;
  }
  activeTable = { ...activeTable, ...update };
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
    return JSON.parse(raw) as ActiveFourPersonTable;
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
