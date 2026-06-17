import { storage } from "../../lib/storage";
import { getEffectiveCurrentDate } from "../demo-time";
import { getCanonicalMenuItemById, getCanonicalRestaurantById, getCanonicalRestaurantByName, getPrimaryMenuItemForRestaurant } from "../restaurants";
import { buildMealBuddyCardFromProfile } from "./mealBuddyCardMock";
import { getMockChatThreadByName, getMockProfile, mockChatThreads } from "./mealBuddyFlowMock";
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

const socialStorageKey = "haocu.mealBuddy.socialState.v6";
const defaultGroupTableId = "table-balanced-dinner";
const defaultGroupChatId = "chat-group-table-balanced-dinner";
const defaultGroupTableName = "均衡晚餐桌";

function buildDefaultChats(): MealBuddyChatPreview[] {
  return mockChatThreads
    .filter((thread) => thread.buddyId !== "ivy")
    .map((thread, index) => ({
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
  const myDinnerCard = buildMealBuddyCardFromProfile("current-user", "restaurant-mori-veggie", "dish-mori-1", {
    sourceType: "ai_recommendation",
    intentionType: "chat_first",
    diningMode: "chatFirst",
    mealTime: "今晚 18:30",
    paymentPreference: "AA 制",
    note: "想找同樣重視均衡晚餐的人。",
    status: "active"
  });
  const myLunchCard = buildMealBuddyCardFromProfile("current-user", "restaurant-haochu-bowl", "dish-haochu-2", {
    sourceType: "ai_recommendation",
    intentionType: "eat_together",
    diningMode: "eatTogether",
    mealTime: "明天 12:30",
    paymentPreference: "AA 制",
    note: "明天午餐想找附近飯友一起吃。",
    status: "active"
  });
  const myCafeCard = buildMealBuddyCardFromProfile("current-user", "restaurant-cafe-balance", "dish-cafe-1", {
    sourceType: "ai_recommendation",
    intentionType: "chat_first",
    diningMode: "chatFirst",
    mealTime: "明天 15:00",
    paymentPreference: "AA 制",
    note: "適合先聊天的咖啡廳輕食。",
    status: "active"
  });

  const minaTableCard = buildMealBuddyCardFromProfile("mina", "restaurant-mori-veggie", "dish-mori-1", {
    sourceType: "manual",
    intentionType: "eat_together",
    diningMode: "eatTogether",
    mealTime: "今晚 19:00",
    paymentPreference: "AA 制",
    note: "多人桌共享均衡晚餐。",
    status: "invited",
    maxParticipants: 4,
    currentParticipants: 3,
    isLargeTableEnabled: true
  });
  const ivyMealCard = buildMealBuddyCardFromProfile("ivy", "restaurant-mori-veggie", "dish-mori-2", {
    sourceType: "manual",
    intentionType: "eat_together",
    diningMode: "eatTogether",
    mealTime: "今晚 18:30",
    paymentPreference: "AA 制",
    note: "蔬食為主的清爽晚餐。",
    status: "invited"
  });
  const yunaChatCard = buildMealBuddyCardFromProfile("yuna", "restaurant-cafe-balance", "dish-cafe-1", {
    sourceType: "manual",
    intentionType: "chat_first",
    diningMode: "chatFirst",
    mealTime: "明天 15:00",
    paymentPreference: "AA 制",
    note: "清爽咖啡廳輕食，先聊聊再決定。",
    status: "invited"
  });
  const kaiLunchCard = buildMealBuddyCardFromProfile("kai", "restaurant-haochu-bowl", "dish-haochu-2", {
    sourceType: "manual",
    intentionType: "eat_together",
    diningMode: "eatTogether",
    mealTime: "明天 12:30",
    paymentPreference: "AA 制",
    note: "高 CP 值午餐，蛋白質再多一點。",
    status: "invited"
  });
  const seanDinnerCard = buildMealBuddyCardFromProfile("sean", "restaurant-mori-veggie", "dish-mori-1", {
    sourceType: "manual",
    intentionType: "eat_together",
    diningMode: "eatTogether",
    mealTime: "明天 19:00",
    paymentPreference: "AA 制",
    note: "晚餐清爽少油。",
    status: "invited"
  });

  return [
    invite({
      id: "invite-mina-balanced-table",
      type: "table",
      direction: "received",
      profileId: "mina",
      inviterCard: minaTableCard,
      matchedInviteeCard: myDinnerCard,
      time: "今晚 19:00",
      matchReasons: ["晚餐時間接近", "均衡目標相近", "多人桌還有一個空位"],
      tableId: defaultGroupTableId,
      tableName: defaultGroupTableName,
      hostName: "米娜",
      currentParticipants: 3,
      requiredParticipants: 4,
      tableStatus: "pending"
    }),
    invite({
      id: "invite-ivy-veggie-dinner",
      type: "meal",
      direction: "received",
      profileId: "ivy",
      inviterCard: ivyMealCard,
      matchedInviteeCard: myDinnerCard,
      time: "今晚 18:30",
      matchReasons: ["都偏好清爽晚餐", "餐廳距離接近", "蔬食餐點相近"]
    }),
    invite({
      id: "invite-yuna-cafe-chat",
      type: "chat",
      direction: "received",
      profileId: "yuna",
      inviterCard: yunaChatCard,
      matchedInviteeCard: myCafeCard,
      time: "明天 15:00",
      matchReasons: ["都適合先聊天", "偏好咖啡廳輕食", "活動區域接近"]
    }),
    invite({
      id: "invite-kai-lunch-sent",
      type: "meal",
      direction: "sent",
      profileId: "kai",
      inviterCard: myLunchCard,
      matchedInviteeCard: kaiLunchCard,
      time: "明天 12:30",
      matchReasons: ["都重視高 CP 值", "午餐時間接近", "均衡餐盒相近"]
    }),
    invite({
      id: "invite-sean-dinner-sent",
      type: "meal",
      direction: "sent",
      profileId: "sean",
      inviterCard: myDinnerCard,
      matchedInviteeCard: seanDinnerCard,
      time: "明天 19:00",
      matchReasons: ["都在找晚餐", "偏好清爽選擇", "附近有可加入的桌"]
    })
  ];
}

const storedSocialState = readStoredSocialState();
let chatPreviews: MealBuddyChatPreview[] = mergeMissingDefaultChats(storedSocialState?.chats ?? []);
let invitePreviews: MealBuddyInvitePreview[] = mergeMissingDefaultInvites(storedSocialState?.invites ?? []);

export function createOrOpenMealBuddyChat(candidate: RankedMealBuddyCandidate) {
  const mockThread = getMockChatThreadByName(candidate.displayName);
  const now = currentTimestamp();
  const fallbackChatId = `chat-direct-${candidate.userId}`;
  const message = `想一起看看「${candidate.preferredFoodName}」嗎？`;
  const chat: MealBuddyChatPreview = {
    id: mockThread?.id ?? fallbackChatId,
    userName: mockThread?.title ?? candidate.displayName,
    lastMessage: message,
    relatedMeal: candidate.preferredFoodName,
    time: "剛剛",
    unread: true,
    demoLabel: "飯友聊天",
    buddyId: mockThread?.buddyId ?? candidate.userId,
    participantProfileId: mockThread?.participantProfileId ?? candidate.userId,
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now,
    messages: [
      {
        id: `${mockThread?.id ?? fallbackChatId}-seed`,
        text: message,
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
  const mockThread = getMockChatThreadByName(userName);
  const resolvedChatId = chatThreadId ?? mockThread?.id ?? `chat-session-${participantProfileId ?? buddyId ?? userName}`;
  const existingChat = chatPreviews.find((item) => item.id === resolvedChatId);
  if (existingChat) return existingChat;

  const now = currentTimestamp();
  const chat: MealBuddyChatPreview = {
    id: resolvedChatId,
    userName: mockThread?.title ?? userName,
    lastMessage: `已開啟「${relatedMeal}」飯局聊天。`,
    relatedMeal,
    time: "剛剛",
    unread: true,
    demoLabel: "飯局聊天",
    buddyId: buddyId ?? mockThread?.buddyId,
    participantProfileId: participantProfileId ?? mockThread?.participantProfileId,
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now,
    messages: [
      {
        id: `${resolvedChatId}-seed`,
        text: `已開啟「${relatedMeal}」飯局聊天。`,
        sender: "system",
        createdAt: now
      }
    ]
  };
  chatPreviews = sortChatsByActivity([chat, ...chatPreviews.filter((item) => item.id !== chat.id)]);
  persistSocialState();
  return chat;
}

export function createOrOpenGroupTableChat(tableName = defaultGroupTableName, tableId?: string, chatThreadId?: string) {
  const now = getEffectiveCurrentDate();
  const resolvedTableId = tableId ?? (tableName === defaultGroupTableName ? defaultGroupTableId : undefined);
  const resolvedChatId = chatThreadId ?? (resolvedTableId === defaultGroupTableId ? defaultGroupChatId : `chat-group-${safeId(tableName)}`);
  const existingChat = chatPreviews.find((item) => item.id === resolvedChatId || (resolvedTableId && item.tableId === resolvedTableId));
  if (existingChat) return existingChat;

  const chat: MealBuddyChatPreview = {
    id: resolvedChatId,
    userName: tableName,
    lastMessage: "多人飯局已成團，可以確認時間與餐廳細節。",
    relatedMeal: "多人飯局",
    time: "剛剛",
    unread: true,
    demoLabel: "多人飯局",
    tableId: resolvedTableId,
    threadType: "group",
    updatedAt: now.toISOString(),
    lastMessageAt: now.toISOString(),
    messages: [
      {
        id: `${resolvedChatId}-seed`,
        text: "多人飯局已成團，可以確認時間與餐廳細節。",
        sender: "system",
        createdAt: now.toISOString()
      }
    ],
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
  const message = `${userName} 更新飯局狀態：${reason}`;

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
    id: `chat-cancel-${safeId(fallbackName)}`,
    userName: fallbackName,
    lastMessage: message,
    relatedMeal: relatedMeal || "飯友飯局",
    time: "剛剛",
    unread: true,
    demoLabel: "系統提醒",
    threadType: "direct",
    updatedAt: now,
    lastMessageAt: now,
    messages: [{ id: `chat-cancel-${safeId(fallbackName)}-seed`, text: message, sender: "system", createdAt: now }]
  };
  chatPreviews = sortChatsByActivity([fallbackChat, ...chatPreviews.filter((item) => item.id !== fallbackChat.id)]);
  persistSocialState();
}

export function createMealBuddyInvite(candidate: RankedMealBuddyCandidate, type: "chat" | "meal" | "table" = "meal", inviterCard?: MealBuddyCard) {
  const sourceCardKey = inviterCard ? getMealBuddyCardId(inviterCard) : `candidate-${candidate.userId}`;
  const existingPending = getPendingInviteForCandidate(candidate.userId, sourceCardKey);
  if (existingPending) return existingPending;

  const now = getEffectiveCurrentDate();
  const profile = getMockProfile(candidate.userId);
  const matchedCard = buildMealBuddyCardFromProfile(candidate.userId, candidate.restaurantId, candidate.menuItemId, {
    sourceType: "manual",
    intentionType: candidate.intentionType,
    diningMode: candidate.intentionType === "chat_first" ? "chatFirst" : "eatTogether",
    mealTime: candidate.preferredTime,
    paymentPreference: "AA 制",
    note: candidate.socialNote,
    status: "invited"
  });
  const invitePreview: MealBuddyInvitePreview = {
    id: `invite-${sourceCardKey}-${candidate.userId}`,
    type,
    status: "pending",
    direction: "sent",
    profileId: candidate.userId,
    candidateUserId: candidate.userId,
    sourceCardKey,
    inviterUser: "current-user",
    inviteeUser: profile?.displayName ?? candidate.displayName,
    userName: profile?.displayName ?? candidate.displayName,
    mealName: candidate.preferredFoodName,
    time: candidate.preferredTime || "晚餐",
    inviterCard: inviterCard ?? buildMealBuddyCardFromProfile("current-user", candidate.restaurantId, candidate.menuItemId, { sourceType: "manual", intentionType: candidate.intentionType }),
    matchedInviteeCard: matchedCard,
    matchReasons: candidate.matchReasons.length ? candidate.matchReasons : ["用餐時間接近", "距離接近", "營養目標相近"],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    demoLabel: "飯友邀請",
    area: candidate.area,
    distanceKm: candidate.distanceKm,
    restaurantId: candidate.restaurantId,
    restaurantName: candidate.restaurantName,
    menuItemId: candidate.menuItemId,
    mascotId: candidate.mascotId
  };
  invitePreviews = [invitePreview, ...invitePreviews.filter((item) => item.id !== invitePreview.id)];
  persistSocialState();
  return invitePreview;
}

export function acceptMealBuddyInvite(invitePreview: MealBuddyInvitePreview) {
  if (invitePreview.type === "table") {
    acceptFourPersonTableInvite(invitePreview);
    return;
  }

  invitePreviews = invitePreviews.map((item) => (item.id === invitePreview.id ? { ...item, status: "accepted" } : item));
  const acceptedProfileId = invitePreview.profileId;
  if (!acceptedProfileId) {
    persistSocialState();
    return;
  }
  const chat = createOrOpenMealBuddyChat({
    userId: acceptedProfileId,
    displayName: invitePreview.userName,
    restaurantId: invitePreview.inviterCard.restaurantId,
    menuItemId: invitePreview.inviterCard.menuItemId,
    restaurantName: invitePreview.inviterCard.restaurantName,
    preferredFoodName: invitePreview.mealName,
    foodCategory: invitePreview.inviterCard.foodCategory,
    area: invitePreview.area,
    preferredTime: invitePreview.inviterCard.preferredTime,
    nutritionGoal: invitePreview.inviterCard.nutritionGoal,
    intentionType: invitePreview.type === "chat" ? "chat_first" : "eat_together",
    distanceKm: invitePreview.distanceKm,
    activityScore: 80,
    isPremium: Boolean(getMockProfile(acceptedProfileId)?.verified),
    isVerified: Boolean(getMockProfile(acceptedProfileId)?.verified),
    tags: getMockProfile(acceptedProfileId)?.tags ?? [],
    socialNote: getMockProfile(acceptedProfileId)?.intro ?? "",
    rankScore: 88,
    matchReasons: invitePreview.matchReasons,
    mascotId: getMockProfile(acceptedProfileId)?.mascotId
  });
  touchChat(chat.id, `已接受 ${invitePreview.userName} 的飯友邀請。`, "剛剛", "system");
  persistSocialState();
}

export function declineMealBuddyInvite(invitePreview: MealBuddyInvitePreview) {
  if (invitePreview.type === "table") {
    invitePreviews = invitePreviews.map((item) => (item.id === invitePreview.id ? { ...item, status: "declined", tableStatus: "declined" } : item));
    persistSocialState();
    return;
  }
  if (invitePreview.direction === "received") {
    invitePreviews = invitePreviews.filter((item) => item.id !== invitePreview.id);
    persistSocialState();
    return;
  }
  invitePreviews = invitePreviews.map((item) => (item.id === invitePreview.id ? { ...item, status: "declined" } : item));
  persistSocialState();
}

export function deleteMealBuddyInvite(invitePreview: MealBuddyInvitePreview) {
  invitePreviews = invitePreviews.filter((item) => item.id !== invitePreview.id);
  persistSocialState();
}

export function getMealBuddyChats() {
  const now = getEffectiveCurrentDate().getTime();
  chatPreviews = sortChatsByActivity(mergeMissingDefaultChats(chatPreviews));
  persistSocialState();
  return chatPreviews.filter((item) => {
    if (item.buddyId === "ivy" && !hasAcceptedInviteForBuddy("ivy")) return false;
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

function invite(input: {
  id: string;
  type: MealBuddyInvitePreview["type"];
  direction: MealBuddyInvitePreview["direction"];
  profileId: UserId;
  inviterCard: MealBuddyCard;
  matchedInviteeCard: MealBuddyCard;
  time: string;
  matchReasons: string[];
  tableId?: TableId;
  tableName?: string;
  hostName?: string;
  currentParticipants?: number;
  requiredParticipants?: number;
  tableStatus?: MealBuddyInvitePreview["tableStatus"];
}): MealBuddyInvitePreview {
  const profile = getMockProfile(input.profileId);
  if (!profile) throw new Error(`Missing mock community profile: ${input.profileId}`);
  return {
    id: input.id,
    type: input.type,
    status: "pending",
    direction: input.direction,
    profileId: profile.profileId,
    candidateUserId: profile.profileId,
    sourceCardKey: getMealBuddyCardId(input.direction === "received" ? input.matchedInviteeCard : input.inviterCard),
    inviterUser: input.direction === "received" ? profile.displayName : "current-user",
    inviteeUser: input.direction === "received" ? "current-user" : profile.displayName,
    userName: profile.displayName,
    mealName: input.inviterCard.preferredFoodName,
    time: input.time,
    inviterCard: input.inviterCard,
    matchedInviteeCard: input.matchedInviteeCard,
    matchReasons: input.matchReasons,
    createdAt: getEffectiveCurrentDate().toISOString(),
    expiresAt: new Date(getEffectiveCurrentDate().getTime() + 24 * 60 * 60 * 1000).toISOString(),
    demoLabel: "飯友邀請",
    area: profile.area,
    distanceKm: profile.distanceKm,
    tableId: input.tableId,
    tableName: input.tableName,
    hostName: input.hostName,
    restaurantId: input.inviterCard.restaurantId,
    restaurantName: input.inviterCard.restaurantName,
    menuItemId: input.inviterCard.menuItemId,
    currentParticipants: input.currentParticipants,
    requiredParticipants: input.requiredParticipants,
    tableStatus: input.tableStatus,
    mascotId: profile.mascotId
  };
}

function acceptFourPersonTableInvite(invitePreview: MealBuddyInvitePreview) {
  const requiredParticipants = invitePreview.requiredParticipants ?? 4;
  const currentParticipants = Math.min(requiredParticipants, (invitePreview.currentParticipants ?? 3) + 1);
  const isFormed = currentParticipants >= requiredParticipants;
  const tableStatus = isFormed ? "formed" : "accepted";

  invitePreviews = invitePreviews.map((item) =>
    item.id === invitePreview.id ? { ...item, status: "accepted", currentParticipants, requiredParticipants, tableStatus } : item
  );

  if (isFormed) {
    const groupChat = createOrOpenGroupTableChat(invitePreview.tableName ?? defaultGroupTableName, invitePreview.tableId ?? defaultGroupTableId);
    touchChat(groupChat.id, "多人飯局已成團，飯局聊天室已開啟。", "剛剛", "system");
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
            messages: [...(item.messages ?? []), { id: `${chatId}-${now}-${(item.messages ?? []).length}`, text: lastMessage, sender, createdAt: now }],
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

function persistSocialState() {
  storage.setItem(socialStorageKey, JSON.stringify({ chats: chatPreviews, invites: invitePreviews }));
}

function mergeMissingDefaultChats(currentChats: MealBuddyChatPreview[]) {
  const defaultChats = buildDefaultChats();
  const canonicalDirectChats = new Map(defaultChats.filter((chat) => chat.threadType === "direct" && chat.buddyId).map((chat) => [chat.buddyId, chat]));
  const canonicalGroupChats = new Map(defaultChats.filter((chat) => chat.threadType === "group" && chat.tableId).map((chat) => [chat.tableId, chat]));
  const mergedByKey = new Map<string, MealBuddyChatPreview>();

  for (const chat of currentChats.filter(isUsableStoredChat)) {
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
    if (!mergedByKey.has(key)) mergedByKey.set(key, chat);
  }
  return [...mergedByKey.values()];
}

function mergeMissingDefaultInvites(currentInvites: MealBuddyInvitePreview[]) {
  const mergedById = new Map(currentInvites.filter(isUsableStoredInvite).map((invitePreview) => [invitePreview.id, invitePreview]));
  for (const invitePreview of buildDefaultInvites()) {
    if (!mergedById.has(invitePreview.id)) {
      mergedById.set(invitePreview.id, invitePreview);
      continue;
    }
    mergedById.set(invitePreview.id, { ...mergedById.get(invitePreview.id)!, profileId: invitePreview.profileId, candidateUserId: invitePreview.candidateUserId, tableId: mergedById.get(invitePreview.id)!.tableId ?? invitePreview.tableId });
  }
  return [...mergedById.values()];
}

function hasAcceptedInviteForBuddy(buddyId: string) {
  return invitePreviews.some((invitePreview) => invitePreview.status === "accepted" && invitePreview.profileId === buddyId);
}

function normalizeMergedChat(base: MealBuddyChatPreview, current: MealBuddyChatPreview, override: Partial<MealBuddyChatPreview>) {
  return normalizeChatTimestamp({ ...base, ...current, ...override });
}

function normalizeChatTimestamp(chat: MealBuddyChatPreview) {
  const timestamp = chat.updatedAt ?? chat.lastMessageAt ?? currentTimestamp();
  return { ...chat, updatedAt: timestamp, lastMessageAt: chat.lastMessageAt ?? timestamp };
}

function findCanonicalDirectChat(chat: MealBuddyChatPreview, canonicalDirectChats: Map<string | undefined, MealBuddyChatPreview>) {
  if (chat.buddyId && canonicalDirectChats.has(chat.buddyId)) return canonicalDirectChats.get(chat.buddyId);
  if (chat.participantProfileId && canonicalDirectChats.has(chat.participantProfileId)) return canonicalDirectChats.get(chat.participantProfileId);
  return undefined;
}

function findCanonicalGroupChat(chat: MealBuddyChatPreview, canonicalGroupChats: Map<string | undefined, MealBuddyChatPreview>) {
  if (chat.tableId && canonicalGroupChats.has(chat.tableId)) return canonicalGroupChats.get(chat.tableId);
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
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { chats?: MealBuddyChatPreview[]; invites?: MealBuddyInvitePreview[] };
    if (!Array.isArray(parsed.chats) || !Array.isArray(parsed.invites)) return null;
    const chats = parsed.chats.filter(isUsableStoredChat);
    const invites = parsed.invites.filter(isUsableStoredInvite);
    if (!chats.length && !invites.length) return null;
    return { chats, invites };
  } catch {
    return null;
  }
}

function isUsableStoredChat(chat: MealBuddyChatPreview) {
  if (isLegacyIdentity(chat.buddyId) || isLegacyIdentity(chat.participantProfileId)) return false;
  if (chat.threadType === "direct") {
    const profileId = chat.participantProfileId ?? chat.buddyId;
    return Boolean(profileId && getMockProfile(profileId));
  }
  return true;
}

function isUsableStoredInvite(invitePreview: MealBuddyInvitePreview) {
  if (isLegacyIdentity(invitePreview.profileId) || isLegacyIdentity(invitePreview.candidateUserId)) return false;
  return Boolean(invitePreview.profileId && invitePreview.candidateUserId === invitePreview.profileId && getMockProfile(invitePreview.profileId));
}

function isLegacyIdentity(value?: string) {
  return Boolean(value && /^(demo-|buddy-|chat-|session-|table-)/.test(value));
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table";
}
