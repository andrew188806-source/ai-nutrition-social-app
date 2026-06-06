export type ActiveFourPersonTable = {
  tableId: string;
  restaurantId: string;
  restaurantName: string;
  location: string;
  cuisineTags: string[];
  suggestedTime: string;
  maxParticipants: 4 | 6 | 8;
  participantIds: string[];
  status: "招募中" | "已成團";
  groupChatThreadId?: string;
};

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
  getStorage()?.removeItem(activeTableStorageKey);
}

function readStoredActiveTable(): ActiveFourPersonTable | null {
  const raw = getStorage()?.getItem(activeTableStorageKey);
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
    getStorage()?.removeItem(activeTableStorageKey);
    return;
  }
  getStorage()?.setItem(activeTableStorageKey, JSON.stringify(activeTable));
}

function safeId(value: string) {
  return encodeURIComponent(value).replace(/%/g, "").toLowerCase();
}

function getStorage() {
  return (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ?? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}
