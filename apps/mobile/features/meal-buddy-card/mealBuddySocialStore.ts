import { storage } from "../../lib/storage";
import { getEffectiveCurrentDate } from "../demo-time";
import { getCanonicalMenuItemById, getCanonicalRestaurantById, getCanonicalRestaurantByName, getPrimaryMenuItemForRestaurant } from "../restaurants";
import { getMockChatThreadByName, mockChatThreads } from "./mealBuddyFlowMock";
import { getMealBuddyCardId, type CardId, type ChatId, type MatchId, type MealBuddyCard, type RankedMealBuddyCandidate, type TableId, type UserId } from "./types";

export type MealBuddyChatPreview = {
  id: ChatId;
  userName: string;
  lastMessage: string;
  messages?: MealBuddyChatMessage[];
  relatedMeal: string;
  time: string;
  unread: boolean;
  demoLabel?: string;
  expiresAt?: string;
  buddyId?: UserId;
  participantProfileId?: UserId;
  tableId?: TableId;
  threadType?: "direct" | "group";
  lastMessageAt?: string;
  updatedAt?: string;
};

export type MealBuddyChatMessage = {
  id: string;
  text: string;
  sender: "me" | "buddy" | "system";
  createdAt: string;
};

export type MealBuddyInvitePreview = {
  id: MatchId;
  type: "chat" | "meal" | "table";
  status: "pending" | "accepted" | "declined" | "expired";
  direction: "sent" | "received";
  profileId?: UserId;
  candidateUserId: UserId;
  sourceCardKey: CardId;
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
  tableId?: TableId;
  tableName?: string;
  hostName?: string;
  restaurantId?: string;
  restaurantName?: string;
  menuItemId?: string;
  currentParticipants?: number;
  requiredParticipants?: number;
  tableStatus?: "pending" | "accepted" | "declined" | "formed";
  mascotId?: string;
};

const socialStorageKey = "haocu.mealBuddy.socialState.v1";
const japaneseDinnerTableId = "table-japanese-dinner";
const japaneseDinnerChatId = "chat-group-table-japanese-dinner";
const japaneseDinnerTableName = "四人桌｜清爽日式晚餐";

function buildDefaultChats(): MealBuddyChatPreview[] {
  // Demo Chat Thread data: one shared thread per matched buddy or formed group table.
  return mockChatThreads.filter((thread) => thread.buddyId !== "ivy").map((thread, index) => ({
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
    lastMessageAt: defaultChatUpdatedAt(index),
    messages: [
      {
        id: `${thread.id}-seed`,
        text: thread.lastMessage,
        sender: thread.type === "group" ? "system" : "buddy",
        createdAt: defaultChatUpdatedAt(index)
      }
    ]
  }));
}

function buildDefaultInvites(): MealBuddyInvitePreview[] {
  const minaMealCard = buildInviteCard({
    sourceType: "manual",
    restaurantId: "restaurant-mori-veggie",
    menuItemId: "dish-mori-1",
    preferredFoodName: "清爽日式晚餐",
    restaurantName: "小森健康食堂",
    foodCategory: "日式",
    area: "台北大安",
    preferredTime: "今晚 18:30",
    nutritionGoal: "清爽高蛋白"
  });
  const leoChatCard = buildInviteCard({
    sourceType: "manual",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "dish-haochu-1",
    preferredFoodName: "高蛋白午餐",
    restaurantName: "好初健康碗",
    foodCategory: "健康餐",
    area: "台北信義",
    preferredTime: "今天 12:20",
    nutritionGoal: "補蛋白"
  });
  const tableInviteCard = buildInviteCard({
    sourceType: "manual",
    restaurantId: "restaurant-mori-veggie",
    menuItemId: "dish-mori-1",
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
    restaurantId: "restaurant-mori-veggie",
    menuItemId: "dish-mori-1",
    preferredFoodName: "日式烤魚定食",
    restaurantName: "小森健康食堂",
    foodCategory: "日式",
    area: "台北大安",
    preferredTime: "今晚 18:30",
    nutritionGoal: "高蛋白、油脂適中"
  });
  const myLunchCard = buildInviteCard({
    sourceType: "ai_recommendation",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "dish-haochu-1",
    preferredFoodName: "健康碗午餐",
    restaurantName: "好初健康碗",
    foodCategory: "健康餐",
    area: "台北信義",
    preferredTime: "今天 12:20",
    nutritionGoal: "蛋白質補足"
  });
  const ivySushiCard = buildInviteCard({
    sourceType: "manual",
    restaurantId: "restaurant-mori-veggie",
    menuItemId: "dish-mori-2",
    preferredFoodName: "壽司晚餐",
    restaurantName: "青葉壽司",
    foodCategory: "日式",
    area: "台北中山",
    preferredTime: "明天 18:30",
    nutritionGoal: "清爽、油脂適中"
  });
  const mySushiCard = buildInviteCard({
    sourceType: "ai_recommendation",
    restaurantId: "restaurant-mori-veggie",
    menuItemId: "dish-mori-2",
    preferredFoodName: "清爽壽司",
    restaurantName: "青葉壽司",
    foodCategory: "日式",
    area: "台北中山",
    preferredTime: "明天 18:30",
    nutritionGoal: "晚餐控制熱量"
  });

  return [
    {
      id: "invite-demo-table-japanese-dinner",
      type: "table",
      status: "pending",
      direction: "received",
      profileId: "mina",
      candidateUserId: "demo-mina",
      sourceCardKey: getMealBuddyCardId(tableInviteCard),
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
      restaurantId: tableInviteCard.restaurantId,
      restaurantName: "小森健康食堂",
      menuItemId: tableInviteCard.menuItemId,
      currentParticipants: 3,
      requiredParticipants: 4,
      tableStatus: "pending"
    },
    {
      id: "invite-demo-ivy-sushi-meal",
      type: "meal",
      status: "pending",
      direction: "received",
      profileId: "ivy",
      candidateUserId: "demo-ivy",
      sourceCardKey: getMealBuddyCardId(mySushiCard),
      inviterUser: "Ivy",
      inviteeUser: "我",
      userName: "Ivy",
      mealName: "壽司晚餐",
      time: "明天 18:30",
      inviterCard: ivySushiCard,
      matchedInviteeCard: mySushiCard,
      matchReasons: ["都想吃日式", "晚餐時間接近", "想吃清爽一點"],
      createdAt: "2026-06-04T11:00:00.000Z",
      expiresAt: "2026-06-05T11:00:00.000Z",
      demoLabel: "Demo Invitation 測試資料",
      area: "台北中山",
      distanceKm: 1.1,
      restaurantId: ivySushiCard.restaurantId,
      restaurantName: ivySushiCard.restaurantName,
      menuItemId: ivySushiCard.menuItemId
    },
    {
      id: "invite-demo-mina-meal",
      type: "meal",
      status: "pending",
      direction: "received",
      profileId: "mina",
      candidateUserId: "demo-mina",
      sourceCardKey: getMealBuddyCardId(myDinnerCard),
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
      distanceKm: 0.9,
      restaurantId: minaMealCard.restaurantId,
      restaurantName: minaMealCard.restaurantName,
      menuItemId: minaMealCard.menuItemId
    },
    {
      id: "invite-demo-leo-chat",
      type: "chat",
      status: "pending",
      direction: "received",
      profileId: "leo",
      candidateUserId: "demo-leo",
      sourceCardKey: getMealBuddyCardId(myLunchCard),
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
      distanceKm: 1.2,
      restaurantId: leoChatCard.restaurantId,
      restaurantName: leoChatCard.restaurantName,
      menuItemId: leoChatCard.menuItemId
    }
  ];
}

const storedSocialState = readStoredSocialState();
let chatPreviews: MealBuddyChatPreview[] = mergeMissingDefaultChats(storedSocialState?.chats ?? []);
let invitePreviews: MealBuddyInvitePreview[] = mergeMissingDefaultInvites(storedSocialState?.invites ?? []);

export function createOrOpenMealBuddyChat(candidate: RankedMealBuddyCandidate) {
  const mockThread = getMockChatThreadByName(candidate.displayName);
  const now = currentTimestamp();
  const fallbackChatId = `chat-direct-${candidate.userId}`;
  const chat: MealBuddyChatPreview = {
    id: mockThread?.id ?? fallbackChatId,
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
    lastMessageAt: now,
    messages: [
      {
        id: `${mockThread?.id ?? fallbackChatId}-seed`,
        text: `先聊聊 ${candidate.preferredFoodName} 嗎？`,
        sender: "buddy",
        createdAt: now
      }
    ]
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function createOrOpenMealSessionChat({
  buddyId,
  chatThreadId,
  participantProfileId,
  relatedMeal,
  userName
}: {
  buddyId?: string;
  chatThreadId?: string;
  participantProfileId?: string;
  relatedMeal: string;
  userName: string;
}) {
  // Backend integration entry: Meal Session -> shared direct ChatThread.
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
    participantProfileId: participantProfileId ?? mockThread?.participantProfileId,
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now,
    messages: [
      {
        id: `${resolvedChatId}-seed`,
        text: `這是關於「${relatedMeal}」的飯局聊天室。`,
        sender: "system",
        createdAt: now
      }
    ]
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function createOrOpenGroupTableChat(tableName = "四人桌", tableId?: string, chatThreadId?: string) {
  // Backend integration entry: Four-Person Table -> shared GroupChatThread.
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
    messages: [
      {
        id: `${resolvedChatId}-seed`,
        text: "四人桌已成團，可以在這裡確認時間與餐廳細節。",
        sender: "system",
        createdAt: now.toISOString()
      }
    ],
    // TODO: Replace this mock expiry with backend scheduled cleanup after real meal-session end time is stored.
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function addMealBuddyChatMessage(chatId: string, message: string) {
  touchChat(chatId, message, "剛剛", "me");
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
    touchChat(groupChat.id, message, "剛剛", "system");
    return;
  }

  const existingChat = chatPreviews.find((item) => chatUserName && item.userName.includes(chatUserName));
  if (existingChat) {
    touchChat(existingChat.id, message, "剛剛", "system");
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
    lastMessageAt: now,
    messages: [
      {
        id: `chat-cancel-${fallbackName}-seed`,
        text: message,
        sender: "system",
        createdAt: now
      }
    ]
  };
  chatPreviews = sortChatsByActivity([fallbackChat, ...chatPreviews.filter((item) => item.id !== fallbackChat.id)]);
  persistSocialState();
}

export function createMealBuddyInvite(candidate: RankedMealBuddyCandidate, type: "chat" | "meal" | "table" = "meal", inviterCard?: MealBuddyCard) {
  const sourceCardKey = inviterCard ? getMealBuddyCardId(inviterCard) : `candidate-${candidate.userId}`;
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
    profileId: candidate.userId,
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
    distanceKm: candidate.distanceKm,
    restaurantId: candidate.restaurantId,
    restaurantName: candidate.restaurantName,
    menuItemId: candidate.menuItemId,
    mascotId: candidate.mascotId
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
  const acceptedProfileId = invite.profileId;
  if (!acceptedProfileId) {
    persistSocialState();
    return;
  }
  const chat = createOrOpenMealBuddyChat({
    userId: acceptedProfileId,
    displayName: invite.userName,
    restaurantId: invite.inviterCard.restaurantId,
    menuItemId: invite.inviterCard.menuItemId,
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
  touchChat(chat.id, invite.type === "chat" ? `你已接受 ${invite.userName} 的聊天邀請。` : `你已接受 ${invite.userName} 的飯局邀請。`, "剛剛", "system");
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
  return chatPreviews.filter((item) => {
    if (item.buddyId === "ivy" && !hasAcceptedInviteForBuddy("ivy")) {
      return false;
    }
    return !item.expiresAt || new Date(item.expiresAt).getTime() > now;
  });
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
    touchChat(groupChat.id, "四人飯局已成團，飯局聊天室已開啟。", "剛剛", "system");
  } else {
    persistSocialState();
  }
}

function touchChat(chatId: string, lastMessage: string, time: string, sender: MealBuddyChatMessage["sender"] = "system") {
  const now = nextActivityTimestamp();
  chatPreviews = sortChatsByActivity(
    chatPreviews.map((item) =>
      item.id === chatId
        ? {
            ...item,
            lastMessage,
            messages: [
              ...(item.messages ?? []),
              {
                id: `${chatId}-${now}-${(item.messages ?? []).length}`,
                text: lastMessage,
                sender,
                createdAt: now
              }
            ],
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
    restaurantId: candidate.restaurantId,
    menuItemId: candidate.menuItemId,
    preferredFoodName: candidate.preferredFoodName,
    restaurantName: candidate.restaurantName,
    foodCategory: candidate.foodCategory,
    area: candidate.area,
    preferredTime: candidate.preferredTime,
    nutritionGoal: candidate.nutritionGoal
  };
}

function persistSocialState() {
  storage.setItem(socialStorageKey, JSON.stringify({ chats: chatPreviews, invites: invitePreviews }));
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
      continue;
    }
    mergedById.set(invite.id, { ...mergedById.get(invite.id)!, profileId: invite.profileId, tableId: mergedById.get(invite.id)!.tableId ?? invite.tableId });
  }
  return [...mergedById.values()];
}

function hasAcceptedInviteForBuddy(buddyId: string) {
  return invitePreviews.some((invite) => invite.status === "accepted" && invite.profileId === buddyId);
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
  if (chat.participantProfileId && canonicalDirectChats.has(chat.participantProfileId)) {
    return canonicalDirectChats.get(chat.participantProfileId);
  }
  return undefined;
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

function nextActivityTimestamp() {
  const current = new Date(currentTimestamp()).getTime();
  const latest = chatPreviews.reduce((max, chat) => Math.max(max, activityTime(chat)), 0);
  return new Date(Math.max(current, latest + 1)).toISOString();
}

function defaultChatUpdatedAt(index: number) {
  return new Date(Date.UTC(2026, 5, 4, 4, 40 - index * 20)).toISOString();
}

function readStoredSocialState() {
  const raw = storage.getItem(socialStorageKey);
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

function buildInviteCard(input: Partial<MealBuddyCard>): MealBuddyCard {
  const now = getEffectiveCurrentDate().toISOString();
  const restaurant = input.restaurantId ? getCanonicalRestaurantById(input.restaurantId) : getCanonicalRestaurantByName(input.restaurantName);
  const menuItem = input.menuItemId ? getCanonicalMenuItemById(input.menuItemId) : restaurant ? getPrimaryMenuItemForRestaurant(restaurant.restaurantId) : null;
  return {
    userId: input.userId ?? "mock-user",
    cardType: input.cardType ?? "general",
    sourceType: input.sourceType ?? "manual",
    intentionType: input.intentionType ?? "chat_first",
    preferredFoodName: input.preferredFoodName ?? menuItem?.name ?? "",
    restaurantId: restaurant?.restaurantId ?? input.restaurantId ?? "",
    menuItemId: menuItem?.menuItemId ?? input.menuItemId,
    restaurantName: restaurant?.name ?? input.restaurantName ?? "",
    foodCategory: input.foodCategory ?? restaurant?.category ?? "",
    area: input.area ?? "",
    preferredTime: input.preferredTime ?? "",
    nutritionGoal: input.nutritionGoal ?? "",
    maxParticipants: input.maxParticipants ?? 4,
    currentParticipants: input.currentParticipants ?? 1,
    isLargeTableEnabled: input.isLargeTableEnabled ?? false,
    visibilityStatus: input.visibilityStatus ?? "active",
    diningDate: input.diningDate ?? getEffectiveCurrentDate().toISOString().slice(0, 10),
    createdAt: input.createdAt ?? now,
    expiresAt: input.expiresAt ?? new Date(getEffectiveCurrentDate().getTime() + 6 * 60 * 60 * 1000).toISOString()
  };
}
