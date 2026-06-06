import type { RankedMealBuddyCandidate } from "./types";

// DEMO DATA FLOW: Community Profile -> Matched Buddy -> Chat Thread -> Meal Session / Four-Person Table.
// Keep IDs stable so every screen renders the same people and sessions from one source of truth.
export type MockCommunityProfile = {
  id: string;
  avatar: string;
  name: string;
  verified: boolean;
  ageRange: string;
  area: string;
  distanceKm: number;
  tags: string[];
  recentMealStatus: string;
  commonInterests: string[];
  intro: string;
};

export type MockMatchedBuddy = {
  id: string;
  profileId: string;
  avatar: string;
  name: string;
  verified: boolean;
  tags: string[];
  recentMealStatus: string;
  mealCount: number;
  knownSince: string;
  lastTable: string;
  commonInterests: string[];
  areas: string[];
  intro: string;
  chatThreadId: string;
};

export type MockChatThread = {
  id: string;
  type: "direct" | "group";
  buddyId?: string;
  participantProfileId?: string;
  tableId?: string;
  title: string;
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
  source: "飯友邀請" | "四人桌";
  withPerson: string;
  buddyId?: string;
  tableId?: string;
  chatThreadId: string;
  chatName: string;
  notes?: string;
  matchReasons?: string[];
};

// Community Profile: the origin record for every demo person.
export const mockCommunityProfiles: MockCommunityProfile[] = [
  {
    id: "mina",
    avatar: "M",
    name: "Mina",
    verified: true,
    ageRange: "25-34歲",
    area: "台北大安",
    distanceKm: 0.6,
    tags: ["日式", "拍照打卡", "AA 制"],
    recentMealStatus: "今天想吃清爽日式料理",
    commonInterests: ["烤魚定食", "清爽日式", "拍照打卡"],
    intro: "喜歡清爽晚餐，也想找人一起探索健康定食。"
  },
  {
    id: "bo",
    avatar: "B",
    name: "Bo",
    verified: false,
    ageRange: "25-34歲",
    area: "台北大安",
    distanceKm: 0.8,
    tags: ["高蛋白", "清湯", "AA 制"],
    recentMealStatus: "想找健康午餐飯友",
    commonInterests: ["雞胸便當", "豆腐鍋", "運動後補充"],
    intro: "想吃清淡一點，不想太油。"
  },
  {
    id: "ivy",
    avatar: "I",
    name: "Ivy",
    verified: true,
    ageRange: "25-34歲",
    area: "台北大安",
    distanceKm: 1.1,
    tags: ["蔬食", "高纖", "先聊聊"],
    recentMealStatus: "今天想吃蔬食咖哩",
    commonInterests: ["蔬食咖哩", "高纖飲食", "清爽晚餐"],
    intro: "喜歡先聊聊附近清爽選擇，再決定要不要一起吃。"
  },
  {
    id: "an",
    avatar: "安",
    name: "小安",
    verified: true,
    ageRange: "25-34歲",
    area: "台北大安",
    distanceKm: 1,
    tags: ["日式", "清爽", "聊聊後再決定"],
    recentMealStatus: "晚餐想吃茶泡飯套餐",
    commonInterests: ["日式定食", "烤魚", "飯後散步"],
    intro: "喜歡慢慢吃飯，也很在意餐後舒服感。"
  },
  {
    id: "sean",
    avatar: "S",
    name: "Sean",
    verified: false,
    ageRange: "25-34歲",
    area: "台北大安",
    distanceKm: 0.9,
    tags: ["新店", "日式", "先聊聊"],
    recentMealStatus: "想先看菜單再決定",
    commonInterests: ["日式烤魚", "新店探索", "輕鬆聊天"],
    intro: "喜歡探索新店，也會先交換菜單再約。"
  },
  {
    id: "kai",
    avatar: "K",
    name: "Kai",
    verified: true,
    ageRange: "25-34歲",
    area: "信義區",
    distanceKm: 0.7,
    tags: ["高蛋白", "健身後", "AA 制"],
    recentMealStatus: "想吃雞胸便當",
    commonInterests: ["高蛋白", "健身後補充", "健康碗"],
    intro: "健身後常找營養標示清楚的餐點。"
  },
  {
    id: "leo",
    avatar: "L",
    name: "Leo",
    verified: true,
    ageRange: "25-34歲",
    area: "信義區",
    distanceKm: 0.8,
    tags: ["健身", "備餐", "先聊聊"],
    recentMealStatus: "想聊高蛋白外食",
    commonInterests: ["高蛋白碗", "備餐", "健身外食"],
    intro: "常分享高蛋白外食選擇。"
  }
];

// Matched Buddy: references a Community Profile and exactly one direct Chat Thread.
export const mockMatchedBuddies: MockMatchedBuddy[] = [
  buildMatchedBuddy("mina", 9, "2026/05/08", "今天", "chat-direct-mina"),
  buildMatchedBuddy("bo", 5, "2026/05/18", "3 天前", "chat-direct-bo"),
  buildMatchedBuddy("ivy", 4, "2026/05/22", "5 天前", "chat-direct-ivy"),
  buildMatchedBuddy("an", 12, "2026/04/26", "昨天", "chat-direct-an")
];

// Chat Thread: direct chats reference buddy/profile IDs; group chats reference table IDs.
export const mockChatThreads: MockChatThread[] = [
  {
    id: "chat-direct-bo",
    type: "direct",
    buddyId: "bo",
    participantProfileId: "bo",
    title: "Bo",
    lastMessage: "我也想吃高蛋白午餐，要約好初健康碗嗎？",
    relatedMeal: "跟 Bo 約高蛋白午餐",
    time: "12:40",
    unread: true,
    demoLabel: "測試資料"
  },
  {
    id: "chat-direct-mina",
    type: "direct",
    buddyId: "mina",
    participantProfileId: "mina",
    title: "Mina",
    lastMessage: "小森健康食堂的烤魚定食看起來不錯。",
    relatedMeal: "跟 Mina 吃烤魚定食",
    time: "18:05",
    unread: true,
    demoLabel: "測試資料"
  },
  {
    id: "chat-direct-ivy",
    type: "direct",
    buddyId: "ivy",
    participantProfileId: "ivy",
    title: "Ivy",
    lastMessage: "可以先聊聊附近蔬食選擇。",
    relatedMeal: "蔬食咖哩",
    time: "11:20",
    unread: false,
    demoLabel: "測試資料"
  },
  {
    id: "chat-direct-an",
    type: "direct",
    buddyId: "an",
    participantProfileId: "an",
    title: "小安",
    lastMessage: "下次可以再約清爽火鍋。",
    relatedMeal: "跟小安吃小火鍋",
    time: "上週六",
    unread: false,
    demoLabel: "測試資料"
  }
];

// Meal Session / Four-Person Table: session records reference their shared chat thread.
export const mockGatheringRecords = {
  hosting: [
    {
      id: "host-japanese-dinner",
      name: "四人桌：清爽日式晚餐",
      location: "小森健康食堂",
      time: "今天 19:00",
      people: "4 人桌",
      status: "已確認",
      payment: "AA 制",
      source: "四人桌",
      withPerson: "Mina、Bo、小安",
      tableId: "table-japanese-dinner",
      chatThreadId: "chat-group-table-japanese-dinner",
      chatName: "四人桌｜清爽日式晚餐",
      notes: "清爽日式晚餐，成桌後可在群聊確認菜單。",
      matchReasons: ["都偏好日式", "晚餐時間接近", "距離接近"]
    },
    {
      id: "host-protein-lunch",
      name: "跟 Bo 約高蛋白午餐",
      location: "好初健康碗",
      time: "明天 12:20",
      people: "2人",
      status: "招募中",
      payment: "看情況",
      source: "飯友邀請",
      withPerson: "Bo",
      buddyId: "bo",
      chatThreadId: "chat-direct-bo",
      chatName: "Bo",
      notes: "適合運動後補充，午餐快速吃完。",
      matchReasons: ["都想吃高蛋白", "午餐時段接近", "飲食目標相似"]
    }
  ] satisfies MockGatheringRecord[],
  joined: [
    {
      id: "joined-fish-set",
      name: "跟 Mina 吃烤魚定食",
      location: "小森健康食堂",
      time: "今天 18:30",
      people: "2人",
      status: "已確認",
      payment: "AA 制",
      source: "飯友邀請",
      withPerson: "Mina",
      buddyId: "mina",
      chatThreadId: "chat-direct-mina",
      chatName: "Mina",
      notes: "晚餐走清爽路線，避免太油。",
      matchReasons: ["都想吃日式", "晚餐時間接近", "距離接近"]
    },
    {
      id: "joined-light-lunch",
      name: "四人桌：清爽午餐",
      location: "青葉食堂",
      time: "週五 12:10",
      people: "3/4 人",
      status: "等待開局",
      payment: "AA 制",
      source: "四人桌",
      withPerson: "Sean、Ivy",
      tableId: "table-light-lunch",
      chatThreadId: "chat-group-table-light-lunch",
      chatName: "四人桌｜清爽午餐",
      notes: "尚未成桌，成桌後才會開啟群聊。",
      matchReasons: ["都偏好清爽餐", "午餐時段接近"]
    }
  ] satisfies MockGatheringRecord[],
  ended: [
    {
      id: "ended-chicken",
      name: "四人桌：雞胸便當",
      location: "山線蛋白餐盒",
      time: "昨天 12:30",
      people: "4人桌",
      status: "已結束",
      payment: "AA 制",
      source: "四人桌",
      withPerson: "Kai、Leo、小安",
      tableId: "table-chicken-bento",
      chatThreadId: "chat-group-table-chicken-bento",
      chatName: "四人桌｜雞胸便當",
      notes: "已結束的高蛋白午餐。",
      matchReasons: ["都偏好高蛋白", "午餐時段接近"]
    },
    {
      id: "ended-hotpot",
      name: "跟小安吃小火鍋",
      location: "暖湯鍋物",
      time: "上週六 19:00",
      people: "2人",
      status: "已取消",
      payment: "看情況",
      source: "飯友邀請",
      withPerson: "小安",
      buddyId: "an",
      chatThreadId: "chat-direct-an",
      chatName: "小安",
      notes: "臨時取消，保留聊天紀錄。",
      matchReasons: ["都想吃火鍋", "晚餐時段接近"]
    }
  ] satisfies MockGatheringRecord[]
};

export function getMockProfile(profileId: string) {
  return mockCommunityProfiles.find((profile) => profile.id === profileId);
}

export function getMockChatThreadByName(name: string) {
  return mockChatThreads.find((thread) => thread.title === name || thread.title.includes(name) || name.includes(thread.title));
}

export function getMockTableParticipantCandidates(tableId = "table-japanese-dinner"): RankedMealBuddyCandidate[] {
  const participantIdsByTable: Record<string, string[]> = {
    "table-japanese-dinner": ["mina", "bo", "an"],
    "table-light-lunch": ["sean", "ivy"],
    "table-chicken-bento": ["kai", "leo", "an"]
  };
  return (participantIdsByTable[tableId] ?? participantIdsByTable["table-japanese-dinner"])
    .map(getMockProfile)
    .filter((profile): profile is MockCommunityProfile => Boolean(profile))
    .map(profileToCandidate);
}

function buildMatchedBuddy(profileId: string, mealCount: number, knownSince: string, lastTable: string, chatThreadId: string): MockMatchedBuddy {
  const profile = getMockProfile(profileId);
  if (!profile) {
    throw new Error(`Missing mock community profile: ${profileId}`);
  }
  return {
    id: profile.id,
    profileId: profile.id,
    avatar: profile.avatar,
    name: profile.name,
    verified: profile.verified,
    tags: profile.tags,
    recentMealStatus: profile.recentMealStatus,
    mealCount,
    knownSince,
    lastTable,
    commonInterests: profile.commonInterests,
    areas: [profile.area],
    intro: profile.intro,
    chatThreadId
  };
}

function profileToCandidate(profile: MockCommunityProfile): RankedMealBuddyCandidate {
  return {
    userId: profile.id,
    displayName: profile.name,
    restaurantId: "rest-demo",
    restaurantName: profile.tags.includes("高蛋白") ? "好初健康碗" : profile.tags.includes("蔬食") ? "青葉食堂" : "小森健康食堂",
    preferredFoodName: profile.commonInterests[0],
    foodCategory: profile.tags[0] ?? "均衡餐",
    area: profile.area,
    preferredTime: profile.recentMealStatus.includes("午餐") ? "午餐" : "晚餐",
    nutritionGoal: profile.commonInterests[1] ?? "均衡飲食",
    intentionType: profile.tags.includes("先聊聊") || profile.tags.includes("聊聊後再決定") ? "chat_first" : "eat_together",
    distanceKm: profile.distanceKm,
    activityScore: 8,
    isPremium: profile.verified,
    isVerified: profile.verified,
    tags: profile.tags,
    socialNote: profile.intro,
    rankScore: 82,
    matchReasons: ["餐點偏好相近", "用餐時段接近", "距離接近"]
  };
}
