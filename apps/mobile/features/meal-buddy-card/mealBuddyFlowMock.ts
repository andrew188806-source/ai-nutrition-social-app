import { getDefaultRestaurantForProfileTags, getPrimaryMenuItemForRestaurant } from "../restaurants";
import type { ChatId, RankedMealBuddyCandidate, TableId, UserId } from "./types";

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
  mascotId?: string;
};

export type MockMatchedBuddy = {
  id: UserId;
  profileId: UserId;
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
  chatThreadId: ChatId;
  mascotId?: string;
};

export type MockChatThread = {
  id: ChatId;
  type: "direct" | "group";
  buddyId?: UserId;
  participantProfileId?: UserId;
  tableId?: TableId;
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
  source: "憌臬??隢? | "?犖獢?;
  withPerson: string;
  buddyId?: UserId;
  participantProfileId?: UserId;
  tableId?: TableId;
  chatThreadId: ChatId;
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
    ageRange: "25-34甇?,
    area: "?啣?憭批?",
    distanceKm: 0.6,
    tags: ["?亙?", "??", "AA ??],
    recentMealStatus: "隞予?喳?皜?亙???",
    commonInterests: ["?日?摰?", "皜?亙?", "??"],
    intro: "?迭皜??嚗??單鈭箔?韏瑟蝝Ｗ摨瑕?憌?,
    mascotId: "taste-explorer"
  },
  {
    id: "bo",
    avatar: "B",
    name: "Bo",
    verified: false,
    ageRange: "25-34甇?,
    area: "?啣?憭批?",
    distanceKm: 0.8,
    tags: ["擃???, "皜僖", "AA ??],
    recentMealStatus: "?單?亙熒??憌臬?",
    commonInterests: ["?靘輻", "鞊???, "??敺???],
    intro: "?喳?皜楚銝暺?銝憭芣硃??,
    mascotId: "protein-believer"
  },
  {
    id: "ivy",
    avatar: "I",
    name: "Ivy",
    verified: true,
    ageRange: "25-34甇?,
    area: "?啣?憭批?",
    distanceKm: 1.1,
    tags: ["?祇?", "擃?", "????],
    recentMealStatus: "隞予?喳??祇??",
    commonInterests: ["?祇??", "擃?憌脤?", "皜??"],
    intro: "?迭????餈??賡???捱摰?銝?銝韏瑕???,
    mascotId: "vegetarian-believer"
  },
  {
    id: "an",
    avatar: "摰?,
    name: "撠?",
    verified: true,
    ageRange: "25-34甇?,
    area: "?啣?憭批?",
    distanceKm: 1,
    tags: ["?亙?", "皜", "??敺?瘙箏?"],
    recentMealStatus: "???喳??嗆部憌臬?擗?,
    commonInterests: ["?亙?摰?", "?日?", "憌臬???郊"],
    intro: "?迭?Ｘ?ㄞ嚗?敺??敺?????,
    mascotId: "balance-guardian"
  },
  {
    id: "sean",
    avatar: "S",
    name: "Sean",
    verified: false,
    ageRange: "25-34甇?,
    area: "?啣?憭批?",
    distanceKm: 0.9,
    tags: ["?啣?", "?亙?", "????],
    recentMealStatus: "?喳????桀?瘙箏?",
    commonInterests: ["?亙??日?", "?啣??Ｙ揣", "頛??予"],
    intro: "?迭?Ｙ揣?啣?嚗???鈭斗??????,
    mascotId: "taste-explorer"
  },
  {
    id: "kai",
    avatar: "K",
    name: "Kai",
    verified: true,
    ageRange: "25-34甇?,
    area: "靽∠儔?",
    distanceKm: 0.7,
    tags: ["擃???, "?亥澈敺?, "AA ??],
    recentMealStatus: "?喳??靘輻",
    commonInterests: ["擃???, "?亥澈敺???, "?亙熒蝣?],
    intro: "?亥澈敺虜?曄?擗?蝷箸?璆?擗???,
    mascotId: "protein-believer"
  },
  {
    id: "leo",
    avatar: "L",
    name: "Leo",
    verified: true,
    ageRange: "25-34甇?,
    area: "靽∠儔?",
    distanceKm: 0.8,
    tags: ["?亥澈", "??", "????],
    recentMealStatus: "?唾?擃??賢?憌?,
    commonInterests: ["擃??賜?", "??", "?亥澈憭?"],
    intro: "撣詨?鈭恍??憭??豢???,
    mascotId: "low-carb-ninja"
  }
];

// Matched Buddy: references a Community Profile and exactly one direct Chat Thread.
export const mockMatchedBuddies: MockMatchedBuddy[] = [
  buildMatchedBuddy("mina", 9, "2026/05/08", "隞予", "chat-direct-mina"),
  buildMatchedBuddy("bo", 5, "2026/05/18", "3 憭拙?", "chat-direct-bo"),
  buildMatchedBuddy("ivy", 4, "2026/05/22", "5 憭拙?", "chat-direct-ivy"),
  buildMatchedBuddy("an", 12, "2026/04/26", "?典予", "chat-direct-an")
];

// Chat Thread: direct chats reference buddy/profile IDs; group chats reference table IDs.
export const mockChatThreads: MockChatThread[] = [
  {
    id: "chat-direct-bo",
    type: "direct",
    buddyId: "bo",
    participantProfileId: "bo",
    title: "Bo",
    lastMessage: "???喳?擃??賢?擗?閬?憟賢??亙熒蝣?嚗?,
    relatedMeal: "頝?Bo 蝝????",
    time: "12:40",
    unread: true,
    demoLabel: "皜祈岫鞈?"
  },
  {
    id: "chat-direct-mina",
    type: "direct",
    buddyId: "mina",
    participantProfileId: "mina",
    title: "Mina",
    lastMessage: "撠ㄝ?亙熒憌??擳?憌?韏瑚?銝??,
    relatedMeal: "頝?Mina ?擳?憌?,
    time: "18:05",
    unread: true,
    demoLabel: "皜祈岫鞈?"
  },
  {
    id: "chat-direct-ivy",
    type: "direct",
    buddyId: "ivy",
    participantProfileId: "ivy",
    title: "Ivy",
    lastMessage: "?臭誑????餈憌??,
    relatedMeal: "?祇??",
    time: "11:20",
    unread: false,
    demoLabel: "皜祈岫鞈?"
  },
  {
    id: "chat-direct-an",
    type: "direct",
    buddyId: "an",
    participantProfileId: "an",
    title: "撠?",
    lastMessage: "銝活?臭誑??皜?恍???,
    relatedMeal: "頝?摰?撠??,
    time: "銝勗",
    unread: false,
    demoLabel: "皜祈岫鞈?"
  }
];

// Meal Session / Four-Person Table: session records reference their shared chat thread.
export const mockGatheringRecords = {
  hosting: [
    {
      id: "host-japanese-dinner",
      name: "?犖獢?皜?亙???",
      location: "撠ㄝ?亙熒憌?",
      time: "隞予 19:00",
      people: "4 鈭箸?",
      status: "撌脩Ⅱ隤?,
      payment: "AA ??,
      source: "?犖獢?,
      withPerson: "Mina?o??摰?,
      tableId: "table-japanese-dinner",
      chatThreadId: "chat-group-table-japanese-dinner",
      chatName: "?犖獢?皜?亙???",
      notes: "皜?亙???嚗?獢??臬蝢方?蝣箄????,
      matchReasons: ["?賢?憟賣撘?, "?????亥?", "頝?亥?"]
    },
    {
      id: "host-protein-lunch",
      name: "頝?Bo 蝝????",
      location: "憟賢??亙熒蝣?,
      time: "?予 12:20",
      people: "2鈭?,
      status: "??銝?,
      payment: "??瘜?,
      source: "憌臬??隢?,
      withPerson: "Bo",
      buddyId: "bo",
      participantProfileId: "bo",
      chatThreadId: "chat-direct-bo",
      chatName: "Bo",
      notes: "?拙???敺?????敹恍?摰?,
      matchReasons: ["?賣???", "???挾?亥?", "憌脤??格??訾撮"]
    }
  ] satisfies MockGatheringRecord[],
  joined: [
    {
      id: "joined-fish-set",
      name: "頝?Mina ?擳?憌?,
      location: "撠ㄝ?亙熒憌?",
      time: "隞予 18:30",
      people: "2鈭?,
      status: "撌脩Ⅱ隤?,
      payment: "AA ??,
      source: "憌臬??隢?,
      withPerson: "Mina",
      buddyId: "mina",
      participantProfileId: "mina",
      chatThreadId: "chat-direct-mina",
      chatName: "Mina",
      notes: "??韏唳??質楝蝺??踹?憭芣硃??,
      matchReasons: ["?賣?撘?, "?????亥?", "頝?亥?"]
    },
    {
      id: "joined-light-lunch",
      name: "?犖獢?皜??",
      location: "??憌?",
      time: "?曹? 12:10",
      people: "3/4 鈭?,
      status: "蝑???",
      payment: "AA ??,
      source: "?犖獢?,
      withPerson: "Sean?vy",
      tableId: "table-light-lunch",
      chatThreadId: "chat-group-table-light-lunch",
      chatName: "?犖獢?皜??",
      notes: "撠??嚗?獢?????蝢方???,
      matchReasons: ["?賢?憟賣??賡?", "???挾?亥?"]
    }
  ] satisfies MockGatheringRecord[],
  ended: [
    {
      id: "ended-chicken",
      name: "?犖獢??靘輻",
      location: "撅梁??擗?",
      time: "?典予 12:30",
      people: "4鈭箸?",
      status: "撌脩???,
      payment: "AA ??,
      source: "?犖獢?,
      withPerson: "Kai?eo??摰?,
      tableId: "table-chicken-bento",
      chatThreadId: "chat-group-table-chicken-bento",
      chatName: "?犖獢??靘輻",
      notes: "撌脩???擃??賢?擗?,
      matchReasons: ["?賢?憟賡??", "???挾?亥?"]
    },
    {
      id: "ended-hotpot",
      name: "頝?摰?撠??,
      location: "?僖?",
      time: "銝勗 19:00",
      people: "2鈭?,
      status: "撌脣?瘨?,
      payment: "??瘜?,
      source: "憌臬??隢?,
      withPerson: "撠?",
      buddyId: "an",
      participantProfileId: "an",
      chatThreadId: "chat-direct-an",
      chatName: "撠?",
      notes: "?冽???嚗???憭拍???,
      matchReasons: ["?賣???, "???挾?亥?"]
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
    chatThreadId,
    mascotId: profile.mascotId
  };
}

function profileToCandidate(profile: MockCommunityProfile): RankedMealBuddyCandidate {
  const restaurant = getDefaultRestaurantForProfileTags(profile.tags);
  const menuItem = getPrimaryMenuItemForRestaurant(restaurant.restaurantId);
  return {
    userId: profile.id,
    displayName: profile.name,
    restaurantId: restaurant.restaurantId,
    menuItemId: menuItem?.menuItemId,
    restaurantName: restaurant.name,
    preferredFoodName: menuItem?.name ?? profile.commonInterests[0],
    foodCategory: restaurant.category,
    area: profile.area,
    preferredTime: profile.recentMealStatus.includes("午餐") ? "午餐" : "晚餐",
    nutritionGoal: profile.commonInterests[1] ?? "均衡飲食",
    intentionType: profile.tags.includes("先聊聊") || profile.tags.includes("聊天") ? "chat_first" : "eat_together",
    distanceKm: profile.distanceKm,
    activityScore: 8,
    isPremium: profile.verified,
    isVerified: profile.verified,
    tags: profile.tags,
    socialNote: profile.intro,
    rankScore: 82,
    matchReasons: ["餐點偏好接近", "健康目標相近", "距離相近"],
    mascotId: profile.mascotId
  };
}
