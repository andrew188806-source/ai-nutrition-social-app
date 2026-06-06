import { getEffectiveCurrentDate } from "../demo-time";
import { getMockChatThreadByName, mockChatThreads } from "./mealBuddyFlowMock";
import type { MealBuddyCard, RankedMealBuddyCandidate } from "./types";

export type MealBuddyChatPreview = {
  id: string;
  userName: string;
  lastMessage: string;
  relatedMeal: string;
  time: string;
  unread: boolean;
  demoLabel?: string;
  expiresAt?: string;
  buddyId?: string;
  participantProfileId?: string;
  tableId?: string;
  threadType?: "direct" | "group";
  lastMessageAt?: string;
  updatedAt?: string;
};

export type MealBuddyInvitePreview = {
  id: string;
  type: "chat" | "meal" | "table";
  status: "pending" | "accepted" | "declined" | "expired";
  direction: "sent" | "received";
  candidateUserId: string;
  sourceCardKey: string;
  inviterUser: string;
  inviteeUser: string;
  userName: string;
  mealName: string;
  time: string;
  inviterCard: MealBuddyCard;
  matchedInviteeCard: MealBuddyCard;
  matchReasons: string[];
  createdAt: string;
  expiresAt: string;
  demoLabel: string;
  area: string;
  distanceKm: number;
  tableId?: string;
  tableName?: string;
  hostName?: string;
  restaurantName?: string;
  currentParticipants?: number;
  requiredParticipants?: number;
  tableStatus?: "pending" | "accepted" | "declined" | "formed";
};

const socialStorageKey = "haocu.mealBuddy.socialState.v1";
const japaneseDinnerTableId = "table-japanese-dinner";
const japaneseDinnerChatId = "chat-group-table-japanese-dinner";
const japaneseDinnerTableName = "四人桌｜清爽日式晚餐";

function buildDefaultChats(): MealBuddyChatPreview[] {
  return mockChatThreads.map((thread, index) => ({
    id: thread.id,
    userName: thread.title,
    lastMessage: thread.lastMessage,
    relatedMeal: thread.relatedMeal,
    time: thread.time,
    unread: thread.unread,
    demoLabel: thread.demoLabel,
    buddyId: thread.buddyId,
    participantProfileId: thread.participantProfileId,
    tableId: thread.tableId,
    threadType: thread.type,
    updatedAt: defaultChatUpdatedAt(index),
    lastMessageAt: defaultChatUpdatedAt(index)
  }));
}

function buildDefaultInvites(): MealBuddyInvitePreview[] {
  const minaMealCard = buildInviteCard({
    sourceType: "manual",
    preferredFoodName: "清爽日式晚餐",
    restaurantName: "小森健康食堂",
    foodCategory: "日式",
    area: "台北大安",
    preferredTime: "今晚 18:30",
    nutritionGoal: "清爽高蛋白"
  });
  const leoChatCard = buildInviteCard({
    sourceType: "manual",
    preferredFoodName: "高蛋白午餐",
    restaurantName: "好初健康碗",
    foodCategory: "健康餐",
    area: "台北信義",
    preferredTime: "今天 12:20",
    nutritionGoal: "補蛋白"
  });
  const tableInviteCard = buildInviteCard({
    sourceType: "manual",
    preferredFoodName: "清爽日式晚餐",
    restaurantName: "小森健康食堂",
    foodCategory: "日式",
    area: "台北大安",
    preferredTime: "今晚 19:00",
    nutritionGoal: "清爽少油",
    maxParticipants: 4,
    currentParticipants: 3
  });
  const myDinnerCard = buildInviteCard({
    sourceType: "ai_recommendation",
    preferredFoodName: "日式烤魚定食",
    restaurantName: "小森健康食堂",
    foodCategory: "日式",
    area: "台北大安",
    preferredTime: "今晚 18:30",
    nutritionGoal: "高蛋白、油脂適中"
  });
  const myLunchCard = buildInviteCard({
    sourceType: "ai_recommendation",
    preferredFoodName: "健康碗午餐",
    restaurantName: "好初健康碗",
    foodCategory: "健康餐",
    area: "台北信義",
    preferredTime: "今天 12:20",
    nutritionGoal: "蛋白質補足"
  });

  return [
    {
      id: "invite-demo-table-japanese-dinner",
      type: "table",
      status: "pending",
      direction: "received",
      candidateUserId: japaneseDinnerTableId,
      sourceCardKey: mealBuddyCardKey(tableInviteCard),
      inviterUser: "Mina",
      inviteeUser: "我",
      userName: "Mina",
      mealName: "清爽日式晚餐",
      time: "今晚 19:00",
      inviterCard: tableInviteCard,
      matchedInviteeCard: myDinnerCard,
      matchReasons: ["都想吃清爽日式", "用餐時間接近", "四人桌還差 1 位成團"],
      createdAt: "2026-06-04T09:00:00.000Z",
      expiresAt: "2026-06-05T09:00:00.000Z",
      demoLabel: "Demo Invitation 測試資料",
      area: "台北大安",
      distanceKm: 0.9,
      tableId: japaneseDinnerTableId,
      tableName: japaneseDinnerTableName,
      hostName: "Mina",
      restaurantName: "小森健康食堂",
      currentParticipants: 3,
      requiredParticipants: 4,
      tableStatus: "pending"
    },
    {
      id: "invite-demo-mina-meal",
      type: "meal",
      status: "pending",
      direction: "received",
      candidateUserId: "demo-mina",
      sourceCardKey: mealBuddyCardKey(myDinnerCard),
      inviterUser: "Mina",
      inviteeUser: "我",
      userName: "Mina",
      mealName: "清爽日式晚餐",
      time: "今晚 18:30",
      inviterCard: minaMealCard,
      matchedInviteeCard: myDinnerCard,
      matchReasons: ["都想吃日式定食", "營養目標接近", "距離接近"],
      createdAt: "2026-06-04T10:00:00.000Z",
      expiresAt: "2026-06-05T10:00:00.000Z",
      demoLabel: "Demo Invitation 測試資料",
      area: "台北大安",
      distanceKm: 0.9
    },
    {
      id: "invite-demo-leo-chat",
      type: "chat",
      status: "pending",
      direction: "received",
      candidateUserId: "demo-leo",
      sourceCardKey: mealBuddyCardKey(myLunchCard),
      inviterUser: "Leo",
      inviteeUser: "我",
      userName: "Leo",
      mealName: "高蛋白午餐",
      time: "今天 12:20",
      inviterCard: leoChatCard,
      matchedInviteeCard: myLunchCard,
      matchReasons: ["都在找健康餐", "午餐時間接近", "想先聊聊"],
      createdAt: "2026-06-04T09:30:00.000Z",
      expiresAt: "2026-06-05T09:30:00.000Z",
      demoLabel: "Demo Invitation 測試資料",
      area: "台北信義",
      distanceKm: 1.2
    }
  ];
}

const storedSocialState = readStoredSocialState();
let chatPreviews: MealBuddyChatPreview[] = mergeMissingDefaultChats(storedSocialState?.chats ?? []);
let invitePreviews: MealBuddyInvitePreview[] = mergeMissingDefaultInvites(storedSocialState?.invites ?? []);

export function createOrOpenMealBuddyChat(candidate: RankedMealBuddyCandidate) {
  const mockThread = getMockChatThreadByName(candidate.displayName);
  const now = currentTimestamp();
  const chat: MealBuddyChatPreview = {
    id: mockThread?.id ?? `chat-${candidate.userId}`,
    userName: mockThread?.title ?? candidate.displayName,
    lastMessage: `想聊聊 ${candidate.preferredFoodName} 嗎？`,
    relatedMeal: candidate.preferredFoodName,
    time: "剛剛",
    unread: true,
    demoLabel: "測試資料",
    buddyId: mockThread?.buddyId ?? candidate.userId,
    participantProfileId: mockThread?.participantProfileId ?? candidate.userId,
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function createOrOpenMealSessionChat({
  buddyId,
  chatThreadId,
  relatedMeal,
  userName
}: {
  buddyId?: string;
  chatThreadId?: string;
  relatedMeal: string;
  userName: string;
}) {
  const mockThread = getMockChatThreadByName(userName);
  const resolvedChatId = chatThreadId ?? mockThread?.id ?? `chat-session-${userName}`;
  const existingChat = chatPreviews.find((item) => item.id === resolvedChatId);
  if (existingChat) {
    return existingChat;
  }
  const now = currentTimestamp();
  const chat: MealBuddyChatPreview = {
    id: resolvedChatId,
    userName: mockThread?.title ?? userName,
    lastMessage: `這是「${relatedMeal}」的飯友聊天室，可以確認時間與地點。`,
    relatedMeal,
    time: "剛剛",
    unread: true,
    demoLabel: "一般飯局",
    buddyId: buddyId ?? mockThread?.buddyId,
    participantProfileId: mockThread?.participantProfileId,
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function createOrOpenGroupTableChat(tableName = "四人桌", tableId?: string, chatThreadId?: string) {
  const now = getEffectiveCurrentDate();
  const resolvedTableId = tableId ?? (tableName.includes("清爽日式晚餐") ? japaneseDinnerTableId : undefined);
  const resolvedChatId = chatThreadId ?? (resolvedTableId === japaneseDinnerTableId ? japaneseDinnerChatId : `chat-group-${tableName}`);
  const existingChat = chatPreviews.find((item) => item.id === resolvedChatId || (resolvedTableId && item.tableId === resolvedTableId));
  if (existingChat) {
    return existingChat;
  }
  const chat: MealBuddyChatPreview = {
    id: resolvedChatId,
    userName: tableName,
    lastMessage: "四人桌已成團，可以在這裡確認時間與餐廳細節。",
    relatedMeal: "四人餐桌",
    time: "剛剛",
    unread: true,
    demoLabel: "四人桌群聊",
    tableId: resolvedTableId,
    threadType: "group",
    updatedAt: now.toISOString(),
    lastMessageAt: now.toISOString(),
    // TODO: Replace this mock expiry with backend scheduled cleanup after real meal-session end time is stored.
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function addMealBuddyChatMessage(chatId: string, message: string) {
  touchChat(chatId, message, "剛剛");
}

export function addMealBuddyChatSystemMessage({
  chatUserName,
  groupTableName,
  reason,
  relatedMeal,
  userName = "我"
}: {
  chatUserName?: string;
  groupTableName?: string;
  reason: string;
  relatedMeal?: string;
  userName?: string;
}) {
  const message = `${userName} 因為「${reason}」取消參加飯局。`;

  if (groupTableName) {
    const groupChat = createOrOpenGroupTableChat(groupTableName);
    touchChat(groupChat.id, message, "剛剛");
    return;
  }

  const existingChat = chatPreviews.find((item) => chatUserName && item.userName.includes(chatUserName));
  if (existingChat) {
    touchChat(existingChat.id, message, "剛剛");
    return;
  }

  const fallbackName = chatUserName || "飯友";
  const now = currentTimestamp();
  const fallbackChat: MealBuddyChatPreview = {
    id: `chat-cancel-${fallbackName}`,
    userName: fallbackName,
    lastMessage: message,
    relatedMeal: relatedMeal || "一般飯友飯局",
    time: "剛剛",
    unread: true,
    demoLabel: "系統提醒",
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now
  };
  chatPreviews = sortChatsByActivity([fallbackChat, ...chatPreviews.filter((item) => item.id !== fallbackChat.id)]);
  persistSocialState();
}

export function createMealBuddyInvite(candidate: RankedMealBuddyCandidate, type: "chat" | "meal" | "table" = "meal", inviterCard?: MealBuddyCard) {
  const sourceCardKey = inviterCard ? mealBuddyCardKey(inviterCard) : `candidate-${candidate.userId}`;
  const existingPending = getPendingInviteForCandidate(candidate.userId, sourceCardKey);
  if (existingPending) {
    return existingPending;
  }
  const now = getEffectiveCurrentDate();
  const invite: MealBuddyInvitePreview = {
    id: `invite-${sourceCardKey}-${candidate.userId}`,
    type,
    status: "pending",
    direction: "sent",
    candidateUserId: candidate.userId,
    sourceCardKey,
    inviterUser: "我",
    inviteeUser: candidate.displayName,
    userName: candidate.displayName,
    mealName: candidate.preferredFoodName,
    time: candidate.preferredTime || "今晚",
    inviterCard: inviterCard ?? buildInviteCard(candidateToCardInput(candidate, "manual")),
    matchedInviteeCard: buildInviteCard(candidateToCardInput(candidate, "ai_recommendation")),
    matchReasons: candidate.matchReasons.length ? candidate.matchReasons : ["餐點偏好接近", "距離接近", "時間接近"],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    demoLabel: "Demo Invitation 測試資料",
    area: candidate.area,
    distanceKm: candidate.distanceKm
  };
  invitePreviews = [invite, ...invitePreviews.filter((item) => item.id !== invite.id)];
  persistSocialState();
  return invite;
}

export function acceptMealBuddyInvite(invite: MealBuddyInvitePreview) {
  if (invite.type === "table") {
    acceptFourPersonTableInvite(invite);
    return;
  }

  invitePreviews = invitePreviews.map((item) => (item.id === invite.id ? { ...item, status: "accepted" } : item));
  createOrOpenMealBuddyChat({
    userId: invite.direction === "sent" ? invite.inviteeUser : invite.inviterUser,
    displayName: invite.userName,
    restaurantId: invite.inviterCard.restaurantId,
    restaurantName: invite.inviterCard.restaurantName,
    preferredFoodName: invite.mealName,
    foodCategory: invite.inviterCard.foodCategory,
    area: invite.area,
    preferredTime: invite.inviterCard.preferredTime,
    nutritionGoal: invite.inviterCard.nutritionGoal,
    intentionType: invite.type === "chat" ? "chat_first" : "eat_together",
    distanceKm: invite.distanceKm,
    activityScore: 80,
    isPremium: false,
    isVerified: true,
    tags: ["測試資料", invite.inviterCard.foodCategory, invite.area],
    socialNote: "這是 demo 邀請資料，用來展示接受與聊天流程。",
    rankScore: 88,
    matchReasons: invite.matchReasons
  });
  persistSocialState();
}

export function declineMealBuddyInvite(invite: MealBuddyInvitePreview) {
  if (invite.type === "table") {
    invitePreviews = invitePreviews.map((item) => (item.id === invite.id ? { ...item, status: "declined", tableStatus: "declined" } : item));
    persistSocialState();
    return;
  }

  if (invite.direction === "received") {
    invitePreviews = invitePreviews.filter((item) => item.id !== invite.id);
    persistSocialState();
    return;
  }
  invitePreviews = invitePreviews.map((item) => (item.id === invite.id ? { ...item, status: "declined" } : item));
  persistSocialState();
}

export function deleteMealBuddyInvite(invite: MealBuddyInvitePreview) {
  invitePreviews = invitePreviews.filter((item) => item.id !== invite.id);
  persistSocialState();
}

export function getMealBuddyChats() {
  const now = getEffectiveCurrentDate().getTime();
  chatPreviews = sortChatsByActivity(mergeMissingDefaultChats(chatPreviews));
  persistSocialState();
  return chatPreviews.filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now);
}

export function getMealBuddyInvites() {
  const now = getEffectiveCurrentDate().getTime();
  invitePreviews = mergeMissingDefaultInvites(invitePreviews).filter((item) => item.status !== "declined" || item.direction !== "sent" || new Date(item.expiresAt).getTime() > now);
  return [...invitePreviews];
}

export function getPendingInviteForCandidate(candidateUserId: string, sourceCardKey: string) {
  return invitePreviews.find((item) => item.direction === "sent" && item.status === "pending" && item.candidateUserId === candidateUserId && item.sourceCardKey === sourceCardKey) ?? null;
}

export function resetMealBuddySocialDemoState() {
  chatPreviews = buildDefaultChats();
  invitePreviews = buildDefaultInvites();
  persistSocialState();
}

function acceptFourPersonTableInvite(invite: MealBuddyInvitePreview) {
  const requiredParticipants = invite.requiredParticipants ?? 4;
  const currentParticipants = Math.min(requiredParticipants, (invite.currentParticipants ?? 3) + 1);
  const isFormed = currentParticipants >= requiredParticipants;
  const tableStatus = isFormed ? "formed" : "accepted";

  invitePreviews = invitePreviews.map((item) =>
    item.id === invite.id
      ? {
          ...item,
          status: "accepted",
          currentParticipants,
          requiredParticipants,
          tableStatus
        }
      : item
  );

  if (isFormed) {
    const groupChat = createOrOpenGroupTableChat(invite.tableName ?? japaneseDinnerTableName, invite.tableId ?? japaneseDinnerTableId);
    touchChat(groupChat.id, "四人飯局已成團，飯局聊天室已開啟。", "剛剛");
  } else {
    persistSocialState();
  }
}

function touchChat(chatId: string, lastMessage: string, time: string) {
  const now = currentTimestamp();
  chatPreviews = sortChatsByActivity(
    chatPreviews.map((item) =>
      item.id === chatId
        ? {
            ...item,
            lastMessage,
            time,
            unread: true,
            updatedAt: now,
            lastMessageAt: now
          }
        : item
    )
  );
  persistSocialState();
}

function candidateToCardInput(candidate: RankedMealBuddyCandidate, sourceType: MealBuddyCard["sourceType"]): Partial<MealBuddyCard> {
  return {
    sourceType,
    preferredFoodName: candidate.preferredFoodName,
    restaurantName: candidate.restaurantName,
    foodCategory: candidate.foodCategory,
    area: candidate.area,
    preferredTime: candidate.preferredTime,
    nutritionGoal: candidate.nutritionGoal
  };
}

function mealBuddyCardKey(card: MealBuddyCard) {
  return `${card.cardType}-${card.createdAt}`;
}

function persistSocialState() {
  getStorage()?.setItem(socialStorageKey, JSON.stringify({ chats: chatPreviews, invites: invitePreviews }));
}

function mergeMissingDefaultChats(currentChats: MealBuddyChatPreview[]) {
  const defaultChats = buildDefaultChats();
  const canonicalDirectChats = new Map(defaultChats.filter((chat) => chat.threadType === "direct" && chat.buddyId).map((chat) => [chat.buddyId, chat]));
  const canonicalGroupChats = new Map(defaultChats.filter((chat) => chat.threadType === "group" && chat.tableId).map((chat) => [chat.tableId, chat]));
  const mergedByKey = new Map<string, MealBuddyChatPreview>();

  for (const chat of currentChats) {
    const canonicalDirect = findCanonicalDirectChat(chat, canonicalDirectChats);
    if (canonicalDirect) {
      mergedByKey.set(`direct:${canonicalDirect.buddyId}`, normalizeMergedChat(canonicalDirect, chat, { id: canonicalDirect.id, buddyId: canonicalDirect.buddyId, participantProfileId: canonicalDirect.participantProfileId, userName: canonicalDirect.userName, threadType: "direct" }));
      continue;
    }

    const canonicalGroup = findCanonicalGroupChat(chat, canonicalGroupChats);
    if (canonicalGroup) {
      mergedByKey.set(`group:${canonicalGroup.tableId}`, normalizeMergedChat(canonicalGroup, chat, { id: canonicalGroup.id, tableId: canonicalGroup.tableId, userName: canonicalGroup.userName, threadType: "group" }));
      continue;
    }

    mergedByKey.set(chat.threadType === "group" && chat.tableId ? `group:${chat.tableId}` : chat.buddyId ? `direct:${chat.buddyId}` : `chat:${chat.id}`, normalizeChatTimestamp(chat));
  }

  for (const chat of defaultChats) {
    const key = chat.threadType === "group" && chat.tableId ? `group:${chat.tableId}` : chat.buddyId ? `direct:${chat.buddyId}` : `chat:${chat.id}`;
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, chat);
    }
  }

  return [...mergedByKey.values()];
}

function mergeMissingDefaultInvites(currentInvites: MealBuddyInvitePreview[]) {
  const mergedById = new Map(currentInvites.map((invite) => [invite.id, invite]));
  for (const invite of buildDefaultInvites()) {
    if (!mergedById.has(invite.id)) {
      mergedById.set(invite.id, invite);
    }
  }
  return [...mergedById.values()];
}

function normalizeMergedChat(base: MealBuddyChatPreview, current: MealBuddyChatPreview, override: Partial<MealBuddyChatPreview>) {
  return normalizeChatTimestamp({ ...base, ...current, ...override });
}

function normalizeChatTimestamp(chat: MealBuddyChatPreview) {
  const timestamp = chat.updatedAt ?? chat.lastMessageAt ?? currentTimestamp();
  return {
    ...chat,
    updatedAt: timestamp,
    lastMessageAt: chat.lastMessageAt ?? timestamp
  };
}

function findCanonicalDirectChat(chat: MealBuddyChatPreview, canonicalDirectChats: Map<string | undefined, MealBuddyChatPreview>) {
  if (chat.buddyId && canonicalDirectChats.has(chat.buddyId)) {
    return canonicalDirectChats.get(chat.buddyId);
  }
  return [...canonicalDirectChats.values()].find((canonical) => canonical.userName === chat.userName || chat.userName.includes(canonical.userName) || canonical.userName.includes(chat.userName));
}

function findCanonicalGroupChat(chat: MealBuddyChatPreview, canonicalGroupChats: Map<string | undefined, MealBuddyChatPreview>) {
  if (chat.tableId && canonicalGroupChats.has(chat.tableId)) {
    return canonicalGroupChats.get(chat.tableId);
  }
  return [...canonicalGroupChats.values()].find((canonical) => canonical.userName === chat.userName || chat.userName.includes(canonical.userName) || canonical.userName.includes(chat.userName));
}

function sortChatsByActivity(chats: MealBuddyChatPreview[]) {
  return [...chats].sort((a, b) => activityTime(b) - activityTime(a));
}

function activityTime(chat: MealBuddyChatPreview) {
  return new Date(chat.updatedAt ?? chat.lastMessageAt ?? "2026-06-01T00:00:00.000Z").getTime();
}

function currentTimestamp() {
  return getEffectiveCurrentDate().toISOString();
}

function defaultChatUpdatedAt(index: number) {
  return new Date(Date.UTC(2026, 5, 4, 4, 40 - index * 20)).toISOString();
}

function readStoredSocialState() {
  const raw = getStorage()?.getItem(socialStorageKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { chats?: MealBuddyChatPreview[]; invites?: MealBuddyInvitePreview[] };
    if (!Array.isArray(parsed.chats) || !Array.isArray(parsed.invites)) {
      return null;
    }
    return { chats: parsed.chats, invites: parsed.invites };
  } catch {
    return null;
  }
}

function getStorage() {
  return (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ?? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
}

function buildInviteCard(input: Partial<MealBuddyCard>): MealBuddyCard {
  const now = getEffectiveCurrentDate().toISOString();
  return {
    userId: input.userId ?? "mock-user",
    cardType: input.cardType ?? "general",
    sourceType: input.sourceType ?? "manual",
    intentionType: input.intentionType ?? "chat_first",
    preferredFoodName: input.preferredFoodName ?? "",
    restaurantId: input.restaurantId ?? "",
    restaurantName: input.restaurantName ?? "",
    foodCategory: input.foodCategory ?? "",
    area: input.area ?? "",
    preferredTime: input.preferredTime ?? "",
    nutritionGoal: input.nutritionGoal ?? "",
    maxParticipants: input.maxParticipants ?? 4,
    currentParticipants: input.currentParticipants ?? 1,
    isLargeTableEnabled: input.isLargeTableEnabled ?? false,
    visibilityStatus: input.visibilityStatus ?? "active",
    createdAt: input.createdAt ?? now,
    expiresAt: input.expiresAt ?? new Date(getEffectiveCurrentDate().getTime() + 6 * 60 * 60 * 1000).toISOString()
  };
}
