import { getCanonicalMenuItemById, getCanonicalRestaurantById, getDefaultRestaurantForProfileTags, getPrimaryMenuItemForRestaurant } from "../restaurants";
import type { ChatId, RankedMealBuddyCandidate, TableId, UserId } from "./types";

// DEMO_ONLY MOCK_DATA TODO_SUPABASE_REPLACE:
// Canonical Community Profile and social graph seed data for the MVP.
// Critical identity rules:
// - profileId is the only canonical person identity.
// - Do not use buddyId, tableId, chatId, sessionId, or userName as profile identity.
// - Meal Buddy Cards/candidates are generated from Community Profiles + restaurant/menu IDs.
// - Free mode may hide avatar/photo or sensitive details, but must not change displayName.

export type MockCommunityProfile = {
  id: string;
  profileId: string;
  displayName: string;
  anonymousName: string;
  avatar: string;
  mascotId: string;
  mascotAvatar: string;
  realAvatarKey: string;
  realAvatar: string;
  realAvatarUrl: string;
  age: number;
  ageRange: string;
  gender: "male" | "female" | "other";
  area: string;
  distanceKm: number;
  verificationStatus: "verified" | "unverified";
  verified: boolean;
  healthGoal: string;
  dietSummary: string;
  recentMealStyle: string;
  nutritionGoalSummary: string;
  willingToChat: boolean;
  tags: string[];
  preferredMealTypes: string[];
  favoriteRestaurantIds: string[];
  favoriteMenuItemIds: string[];
  commonInterests: string[];
  intro: string;
};

export type MockMatchedBuddy = {
  id: UserId;
  profileId: UserId;
  mealCount: number;
  knownSince: string;
  lastTable: string;
  chatThreadId: ChatId;
};

export type MockChatThread = {
  id: ChatId;
  type: "direct" | "group";
  buddyId?: UserId;
  participantProfileId?: UserId;
  tableId?: TableId;
  title?: string;
  lastMessage: string;
  relatedMeal: string;
  time: string;
  unread: boolean;
  demoLabel: string;
};

export type MockGatheringRecord = {
  id: string;
  name: string;
  location: string;
  time: string;
  people: string;
  status: string;
  payment: string;
  source: "meal_session" | "group_table";
  buddyId?: UserId;
  participantProfileId?: UserId;
  tableId?: TableId;
  hostProfileId?: UserId;
  participantProfileIds?: UserId[];
  chatThreadId: ChatId;
  chatName?: string;
  notes?: string;
  matchReasons?: string[];
};

const photoSeedBase = "https://api.dicebear.com/9.x/personas/png?backgroundColor=f2f4f7&radius=50&seed=";

export const mockCommunityProfiles: MockCommunityProfile[] = [
  profile({
    profileId: "current-user",
    displayName: "好厝用戶",
    anonymousName: "均衡守護者",
    avatar: "H",
    mascotId: "balance-guardian",
    age: 29,
    ageRange: "25-34",
    gender: "other",
    area: "大安",
    distanceKm: 0,
    verificationStatus: "verified",
    healthGoal: "穩定精神與體力",
    dietSummary: "均衡餐盤，重視蛋白質與蔬菜",
    recentMealStyle: "晚餐有事先規劃",
    nutritionGoalSummary: "熱量穩定，纖維再提高",
    willingToChat: true,
    tags: ["均衡", "蛋白質", "纖維"],
    preferredMealTypes: ["午餐", "晚餐"],
    favoriteRestaurantIds: ["restaurant-haochu-bowl", "restaurant-mori-veggie"],
    favoriteMenuItemIds: ["dish-haochu-1", "dish-mori-1"],
    commonInterests: ["均衡餐盒", "附近餐廳", "熱量分享"],
    intro: "喜歡實際、穩定的飲食安排，也願意和重視營養的人一起吃飯。"
  }),
  profile({
    profileId: "mina",
    displayName: "米娜",
    anonymousName: "嚐鮮探險家",
    avatar: "M",
    mascotId: "taste-explorer",
    age: 28,
    ageRange: "25-34",
    gender: "female",
    area: "大安",
    distanceKm: 0.6,
    verificationStatus: "verified",
    healthGoal: "維持均衡活力",
    dietSummary: "蔬菜多一點，搭配低脂蛋白質",
    recentMealStyle: "晚餐偏好均衡餐盒",
    nutritionGoalSummary: "蛋白質與纖維達標，不吃過量",
    willingToChat: true,
    tags: ["均衡", "新餐廳", "AA 制"],
    preferredMealTypes: ["午餐", "晚餐"],
    favoriteRestaurantIds: ["restaurant-haochu-bowl", "restaurant-mori-veggie"],
    favoriteMenuItemIds: ["dish-haochu-1", "dish-mori-1"],
    commonInterests: ["均衡餐盒", "探索餐廳", "AA 制"],
    intro: "喜歡嘗試健康餐盒，也希望晚餐可以輕鬆聊天、不要有壓力。"
  }),
  profile({
    profileId: "ivy",
    displayName: "小艾",
    anonymousName: "蔬食盤子",
    avatar: "I",
    mascotId: "vegetarian-believer",
    age: 26,
    ageRange: "25-34",
    gender: "female",
    area: "信義",
    distanceKm: 1.1,
    verificationStatus: "verified",
    healthGoal: "建立蔬食習慣",
    dietSummary: "多數餐點以蔬食為主，注意蛋白質",
    recentMealStyle: "晚餐偏好蔬食壽司組合",
    nutritionGoalSummary: "增加植物性蛋白，減少宵夜",
    willingToChat: true,
    tags: ["蔬食", "清爽晚餐", "先聊天"],
    preferredMealTypes: ["晚餐"],
    favoriteRestaurantIds: ["restaurant-mori-veggie", "restaurant-cafe-balance"],
    favoriteMenuItemIds: ["dish-mori-2", "dish-cafe-1"],
    commonInterests: ["蔬食餐點", "清爽晚餐", "營養小技巧"],
    intro: "偏好輕鬆的蔬食餐，也喜歡交換實用的飲食習慣。"
  }),
  profile({
    profileId: "bo",
    displayName: "阿博",
    anonymousName: "麵食偵查員",
    avatar: "B",
    mascotId: "taste-explorer",
    age: 30,
    ageRange: "25-34",
    gender: "male",
    area: "信義",
    distanceKm: 0.8,
    verificationStatus: "unverified",
    healthGoal: "控制份量",
    dietSummary: "常吃麵食與餐盒，會注意鈉含量",
    recentMealStyle: "午餐常選麵食套餐",
    nutritionGoalSummary: "份量剛好，多補蔬菜",
    willingToChat: false,
    tags: ["份量控制", "麵食", "均衡"],
    preferredMealTypes: ["午餐", "晚餐"],
    favoriteRestaurantIds: ["restaurant-noodle-soup", "restaurant-mori-veggie"],
    favoriteMenuItemIds: ["dish-noodle-1", "dish-mori-1"],
    commonInterests: ["麵店", "份量控制", "均衡配菜"],
    intro: "喜歡簡單直接的餐點，偏好沒有壓力的飯局。"
  }),
  profile({
    profileId: "leo",
    displayName: "里歐",
    anonymousName: "蛋白質規劃師",
    avatar: "L",
    mascotId: "protein-believer",
    age: 29,
    ageRange: "25-34",
    gender: "male",
    area: "松山",
    distanceKm: 0.8,
    verificationStatus: "verified",
    healthGoal: "增加肌肉量",
    dietSummary: "午餐高蛋白，晚餐清爽一點",
    recentMealStyle: "午餐偏好高蛋白套餐",
    nutritionGoalSummary: "提高蛋白質，同時控制熱量",
    willingToChat: true,
    tags: ["高蛋白", "健身", "AA 制"],
    preferredMealTypes: ["午餐"],
    favoriteRestaurantIds: ["restaurant-mountain-protein", "restaurant-haochu-bowl"],
    favoriteMenuItemIds: ["dish-mountain-1", "dish-haochu-1"],
    commonInterests: ["蛋白質目標", "訓練餐", "午餐規劃"],
    intro: "會認真記錄蛋白質，也喜歡分享運動後適合吃什麼。"
  }),
  profile({
    profileId: "an",
    displayName: "安",
    anonymousName: "穩定餐盒",
    avatar: "A",
    mascotId: "balance-guardian",
    age: 27,
    ageRange: "25-34",
    gender: "female",
    area: "大安",
    distanceKm: 1.0,
    verificationStatus: "verified",
    healthGoal: "維持穩定作息",
    dietSummary: "均衡套餐，飲料盡量低糖",
    recentMealStyle: "晚餐偏好均衡套餐",
    nutritionGoalSummary: "血糖穩定，纖維足夠",
    willingToChat: true,
    tags: ["均衡", "低糖", "清爽晚餐"],
    preferredMealTypes: ["午餐", "晚餐"],
    favoriteRestaurantIds: ["restaurant-mori-veggie", "restaurant-haochu-bowl"],
    favoriteMenuItemIds: ["dish-mori-1", "dish-haochu-2"],
    commonInterests: ["均衡套餐", "低糖選擇", "用餐時間"],
    intro: "重視穩定生活節奏，偏好安靜、均衡的飯局。"
  }),
  profile({
    profileId: "kai",
    displayName: "凱",
    anonymousName: "精打細算餐盒",
    avatar: "K",
    mascotId: "balance-guardian",
    age: 25,
    ageRange: "25-34",
    gender: "male",
    area: "松山",
    distanceKm: 0.7,
    verificationStatus: "unverified",
    healthGoal: "吃得健康也控制預算",
    dietSummary: "快速均衡午餐，營養資訊清楚",
    recentMealStyle: "午餐偏好高 CP 值餐盒",
    nutritionGoalSummary: "不超支，也盡量選高蛋白",
    willingToChat: true,
    tags: ["高 CP 值", "均衡", "AA 制"],
    preferredMealTypes: ["午餐"],
    favoriteRestaurantIds: ["restaurant-haochu-bowl", "restaurant-noodle-soup"],
    favoriteMenuItemIds: ["dish-haochu-2", "dish-noodle-2"],
    commonInterests: ["高 CP 值餐", "均衡午餐", "快速規劃"],
    intro: "喜歡價格透明、又不失健康感的選擇。"
  }),
  profile({
    profileId: "yuna",
    displayName: "優娜",
    anonymousName: "咖啡散步者",
    avatar: "Y",
    mascotId: "taste-explorer",
    age: 24,
    ageRange: "18-24",
    gender: "female",
    area: "信義",
    distanceKm: 1.3,
    verificationStatus: "unverified",
    healthGoal: "點心更清爽",
    dietSummary: "咖啡廳輕食、水果、少量甜點",
    recentMealStyle: "下午偏好咖啡廳輕食",
    nutritionGoalSummary: "點心清爽一點，補一點蛋白質",
    willingToChat: true,
    tags: ["咖啡廳", "輕食", "先聊天"],
    preferredMealTypes: ["下午茶", "晚餐"],
    favoriteRestaurantIds: ["restaurant-cafe-balance", "restaurant-mori-veggie"],
    favoriteMenuItemIds: ["dish-cafe-1", "dish-mori-3"],
    commonInterests: ["咖啡廳輕食", "少量甜點", "步行距離"],
    intro: "喜歡輕鬆的咖啡廳飯局，也願意先從聊天開始。"
  }),
  profile({
    profileId: "sean",
    displayName: "尚恩",
    anonymousName: "晚餐導航員",
    avatar: "S",
    mascotId: "taste-explorer",
    age: 31,
    ageRange: "25-34",
    gender: "male",
    area: "大安",
    distanceKm: 0.9,
    verificationStatus: "unverified",
    healthGoal: "晚餐選擇更穩定",
    dietSummary: "均衡晚餐，少一點油炸",
    recentMealStyle: "晚餐常參加多人桌",
    nutritionGoalSummary: "晚餐要有飽足感，也少油一點",
    willingToChat: true,
    tags: ["晚餐", "均衡", "新餐廳"],
    preferredMealTypes: ["晚餐"],
    favoriteRestaurantIds: ["restaurant-mori-veggie", "restaurant-mountain-protein"],
    favoriteMenuItemIds: ["dish-mori-1", "dish-mountain-2"],
    commonInterests: ["晚餐規劃", "多人桌", "清爽選擇"],
    intro: "常加入晚餐多人桌，喜歡找附近比較清爽的餐點。"
  })
];

export const mockMatchedBuddies: MockMatchedBuddy[] = [
  buildMatchedBuddy("mina", 9, "2026/05/08", "均衡晚餐桌", "chat-direct-mina"),
  buildMatchedBuddy("bo", 5, "2026/05/18", "麵食午餐", "chat-direct-bo"),
  buildMatchedBuddy("leo", 7, "2026/05/12", "高蛋白午餐", "chat-direct-leo"),
  buildMatchedBuddy("an", 12, "2026/04/26", "穩定晚餐", "chat-direct-an"),
  buildMatchedBuddy("ivy", 4, "2026/05/22", "蔬食晚餐", "chat-direct-ivy")
];

export const mockChatThreads: MockChatThread[] = [
  directChat("mina", "chat-direct-mina", "這個餐盒當晚餐剛好，要不要先簡單聊一下？", "米娜的均衡餐盒", "18:05", true),
  directChat("bo", "chat-direct-bo", "午餐可以，我這次會多加一份青菜。", "阿博的麵食套餐", "12:40", true),
  directChat("leo", "chat-direct-leo", "這份高蛋白套餐很符合目標，明天午餐可以嗎？", "里歐的高蛋白午餐", "14:30", false),
  directChat("an", "chat-direct-an", "均衡套餐聽起來不錯，我飲料會選無糖。", "安的穩定晚餐", "昨天", false),
  directChat("ivy", "chat-direct-ivy", "蔬食壽司可以，如果時間還開放我想加入。", "小艾的蔬食晚餐", "11:20", false),
  directChat("yuna", "chat-direct-yuna", "咖啡廳輕食很適合先聊聊。", "優娜的咖啡廳輕食", "15:00", true),
  {
    id: "chat-group-table-balanced-dinner",
    type: "group",
    tableId: "table-balanced-dinner",
    title: "均衡晚餐桌",
    lastMessage: "米娜開的桌還有一個空位。",
    relatedMeal: "小森蔬食套餐",
    time: "19:00",
    unread: true,
    demoLabel: "多人飯局"
  },
  {
    id: "chat-group-table-light-lunch",
    type: "group",
    tableId: "table-light-lunch",
    title: "清爽午餐桌",
    lastMessage: "小艾、優娜和尚恩正在比較清爽餐點。",
    relatedMeal: "清爽午餐組合",
    time: "12:10",
    unread: false,
    demoLabel: "多人飯局"
  }
];

export const mockGatheringRecords = {
  hosting: [
    {
      id: "host-balanced-dinner",
      name: "均衡晚餐桌",
      location: "小森蔬食",
      time: "今晚 19:00",
      people: "3/4 人",
      status: "招募中",
      payment: "AA 制",
      source: "group_table",
      tableId: "table-balanced-dinner",
      hostProfileId: "mina",
      participantProfileIds: ["mina", "bo", "an"],
      chatThreadId: "chat-group-table-balanced-dinner",
      chatName: "均衡晚餐桌",
      notes: "以均衡餐盒與輕鬆營養選擇為主的多人晚餐。",
      matchReasons: ["晚餐時間接近", "均衡目標相近", "距離接近"]
    },
    {
      id: "host-protein-lunch",
      name: "里歐的高蛋白午餐",
      location: "山系高蛋白",
      time: "明天 12:30",
      people: "2 人",
      status: "已確認",
      payment: "各付各的",
      source: "meal_session",
      buddyId: "leo",
      participantProfileId: "leo",
      chatThreadId: "chat-direct-leo",
      chatName: "Leo",
      notes: "營養標示清楚的高蛋白午餐。",
      matchReasons: ["蛋白質目標相近", "午餐時間接近", "餐廳距離接近"]
    }
  ] satisfies MockGatheringRecord[],
  joined: [
    {
      id: "joined-mina-bowl",
      name: "米娜的均衡餐盒",
      location: "好厝均衡碗",
      time: "今晚 18:30",
      people: "2 人",
      status: "已確認",
      payment: "AA 制",
      source: "meal_session",
      buddyId: "mina",
      participantProfileId: "mina",
      chatThreadId: "chat-direct-mina",
      chatName: "Mina",
      notes: "以纖維與均衡為重點的餐盒晚餐。",
      matchReasons: ["營養目標相近", "晚餐時間相同", "距離接近"]
    },
    {
      id: "joined-light-lunch",
      name: "清爽午餐桌",
      location: "均衡咖啡",
      time: "明天 12:10",
      people: "3/4 人",
      status: "開放中",
      payment: "AA 制",
      source: "group_table",
      tableId: "table-light-lunch",
      hostProfileId: "ivy",
      participantProfileIds: ["ivy", "yuna", "sean"],
      chatThreadId: "chat-group-table-light-lunch",
      chatName: "清爽午餐桌",
      notes: "以蔬食與咖啡廳輕食為主的午餐桌。",
      matchReasons: ["偏好清爽餐點", "適合先聊天", "地點接近"]
    }
  ] satisfies MockGatheringRecord[],
  ended: [
    {
      id: "ended-protein-table",
      name: "高蛋白午餐桌",
      location: "山系高蛋白",
      time: "昨天 12:30",
      people: "4 人",
      status: "已完成",
      payment: "AA 制",
      source: "group_table",
      tableId: "table-protein-lunch",
      hostProfileId: "leo",
      participantProfileIds: ["leo", "kai", "an", "bo"],
      chatThreadId: "chat-group-table-protein-lunch",
      chatName: "高蛋白午餐桌",
      notes: "已完成的高蛋白午餐多人桌。",
      matchReasons: ["蛋白質目標相近", "午餐時間接近"]
    },
    {
      id: "ended-an-balanced-set",
      name: "安的穩定晚餐",
      location: "小森蔬食",
      time: "上週 19:00",
      people: "2 人",
      status: "已完成",
      payment: "各付各的",
      source: "meal_session",
      buddyId: "an",
      participantProfileId: "an",
      chatThreadId: "chat-direct-an",
      chatName: "An",
      notes: "搭配低糖飲料的均衡晚餐。",
      matchReasons: ["作息穩定", "均衡目標相近"]
    }
  ] satisfies MockGatheringRecord[]
};

export function getMockProfile(profileId: string) {
  return mockCommunityProfiles.find((profileItem) => profileItem.profileId === profileId || profileItem.id === profileId);
}

export function getMockChatThreadByName(name: string) {
  const profile = getMockProfile(name);
  return mockChatThreads.find((thread) => thread.participantProfileId === profile?.profileId || thread.buddyId === profile?.profileId || thread.title === name || (thread.title ? thread.title.includes(name) || name.includes(thread.title) : false));
}

export function getMockMealBuddyCandidates(): RankedMealBuddyCandidate[] {
  return ["mina", "ivy", "bo", "leo", "an", "kai", "yuna", "sean"]
    .map(getMockProfile)
    .filter((profileItem): profileItem is MockCommunityProfile => Boolean(profileItem))
    .map(profileToCandidate);
}

export function getMockTableParticipantCandidates(tableId = "table-balanced-dinner"): RankedMealBuddyCandidate[] {
  const participantProfileIdsByTable: Record<string, string[]> = {
    "table-balanced-dinner": ["mina", "bo", "an"],
    "table-light-lunch": ["ivy", "yuna", "sean"],
    "table-protein-lunch": ["leo", "kai", "an", "bo"]
  };
  return (participantProfileIdsByTable[tableId] ?? participantProfileIdsByTable["table-balanced-dinner"])
    .map(getMockProfile)
    .filter((profileItem): profileItem is MockCommunityProfile => Boolean(profileItem))
    .map(profileToCandidate);
}

function profile(input: Omit<MockCommunityProfile, "id" | "profileId" | "mascotAvatar" | "realAvatarKey" | "realAvatar" | "realAvatarUrl" | "verified"> & { profileId: string }): MockCommunityProfile {
  const verified = input.verificationStatus === "verified";
  const realAvatarUrl = `${photoSeedBase}${encodeURIComponent(input.profileId)}`;
  return {
    ...input,
    id: input.profileId,
    profileId: input.profileId,
    mascotAvatar: input.mascotId,
    realAvatarKey: `avatar-photo-${input.profileId}`,
    realAvatar: realAvatarUrl,
    realAvatarUrl,
    verified
  };
}

function directChat(profileId: string, chatId: string, lastMessage: string, relatedMeal: string, time: string, unread: boolean): MockChatThread {
  const profileItem = getMockProfile(profileId);
  if (!profileItem) {
    throw new Error(`Missing mock community profile: ${profileId}`);
  }
  return {
    id: chatId,
    type: "direct",
    buddyId: profileId,
    participantProfileId: profileId,
    lastMessage,
    relatedMeal,
    time,
    unread,
    demoLabel: "飯友聊天"
  };
}

function buildMatchedBuddy(profileId: string, mealCount: number, knownSince: string, lastTable: string, chatThreadId: string): MockMatchedBuddy {
  if (!getMockProfile(profileId)) {
    throw new Error(`Missing mock community profile: ${profileId}`);
  }
  return {
    id: profileId,
    profileId,
    mealCount,
    knownSince,
    lastTable,
    chatThreadId
  };
}

function profileToCandidate(profileItem: MockCommunityProfile): RankedMealBuddyCandidate {
  const restaurant = getCanonicalRestaurantById(profileItem.favoriteRestaurantIds[0]) ?? getDefaultRestaurantForProfileTags(profileItem.tags);
  const preferredMenuItem = getCanonicalMenuItemById(profileItem.favoriteMenuItemIds[0]) ?? getPrimaryMenuItemForRestaurant(restaurant.restaurantId);
  return {
    userId: profileItem.profileId,
    displayName: profileItem.displayName,
    restaurantId: restaurant.restaurantId,
    menuItemId: preferredMenuItem?.menuItemId,
    restaurantName: restaurant.name,
    preferredFoodName: preferredMenuItem?.name ?? profileItem.commonInterests[0],
    foodCategory: restaurant.category,
    area: profileItem.area,
    preferredTime: profileItem.preferredMealTypes[0] ?? "晚餐",
    nutritionGoal: profileItem.nutritionGoalSummary,
    intentionType: profileItem.willingToChat ? "chat_first" : "eat_together",
    distanceKm: profileItem.distanceKm,
    activityScore: profileItem.verified ? 9 : 7,
    isPremium: profileItem.verified,
    isVerified: profileItem.verified,
    tags: profileItem.tags,
    socialNote: profileItem.intro,
    rankScore: profileItem.verified ? 88 : 82,
    matchReasons: ["用餐時間接近", "營養目標相近", `距離 ${profileItem.distanceKm.toFixed(1)} km`],
    mascotId: profileItem.mascotId
  };
}
