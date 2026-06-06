import type {
  CompatibilityScore,
  GroupMealTable,
  GroupTableMember,
  MatchAttemptLimit,
  SocialMatch,
  SocialUnlock,
  TableCreateLimit,
  TableJoinLimit,
  VisibilitySettings
} from "../types";

export const mockMatchAttemptLimits: MatchAttemptLimit[] = [
  { id: "limit-match-free", tier: "free", dailyMatchAttempts: 5, dailyProfileUnlocks: 0 },
  { id: "limit-match-premium", tier: "premium", dailyMatchAttempts: 30, dailyProfileUnlocks: 10 }
];

export const mockSocialMatches: SocialMatch[] = [
  {
    id: "match-demo-lunch",
    userId: "user-demo",
    matchedProfileId: "profile-social-preview",
    compatibilityScore: 92,
    sharedTagIds: ["tag-eating-high-protein", "tag-goal-calorie", "tag-social-lunch"],
    isUnlocked: false
  }
];

export const mockSocialUnlocks: SocialUnlock[] = [
  {
    id: "unlock-demo-premium-preview",
    userId: "user-demo",
    profileId: "profile-social-preview",
    unlockedAt: "2026-05-25T12:00:00.000Z"
  }
];

export const mockVisibilitySettings: VisibilitySettings[] = [
  {
    id: "visibility-demo-free",
    userId: "user-social-preview",
    showDisplayName: false,
    showPhoto: false,
    showMealTags: true,
    showHealthGoals: false,
    showSocialIntent: true
  }
];

export const mockCompatibilityScores: CompatibilityScore[] = [
  {
    id: "compat-demo-lunch",
    userId: "user-demo",
    matchedProfileId: "profile-social-preview",
    score: 92,
    sharedTagIds: ["tag-eating-high-protein", "tag-goal-calorie", "tag-social-lunch"],
    recentMealPattern: "weekday_high_protein_lunch",
    nutritionBehavior: "calorie_tracking_with_balanced_meals",
    socialIntentFit: "lunch_partner_and_accountability",
    tagMatchReasons: [
      {
        id: "reason-protein",
        tagId: "tag-eating-high-protein",
        reason: "Both profiles often choose high-protein lunch meals.",
        visibility: "free_preview"
      },
      {
        id: "reason-calorie",
        tagId: "tag-goal-calorie",
        reason: "Both profiles use calorie management as a lifestyle goal.",
        visibility: "premium_detail"
      }
    ]
  }
];

export const mockTableJoinLimits: TableJoinLimit[] = [
  { id: "limit-table-join-free", tier: "free", dailyJoinLimit: 1 },
  { id: "limit-table-join-premium", tier: "premium", dailyJoinLimit: 5 }
];

export const mockTableCreateLimits: TableCreateLimit[] = [
  { id: "limit-table-create-free", tier: "free", dailyCreateLimit: 0 },
  { id: "limit-table-create-premium", tier: "premium", dailyCreateLimit: 3 }
];

export const mockGroupMealTables: GroupMealTable[] = [
  {
    id: "table-high-protein-dinner",
    restaurantId: "restaurant-demo-verified",
    hostUserId: "user-social-preview",
    mealTheme: "high_protein_dinner",
    status: "waiting",
    currentMemberCount: 2,
    targetMemberCount: 4,
    tagIds: ["tag-restaurant-high-protein", "tag-goal-muscle-gain", "tag-social-dinner"],
    isPremiumOnly: false,
    compatibilityReason: "high_protein_and_dinner_partner"
  },
  {
    id: "table-health-goal-mode",
    restaurantId: "restaurant-demo-verified",
    hostUserId: "user-demo",
    mealTheme: "health_goal_mode_table",
    status: "open",
    currentMemberCount: 3,
    targetMemberCount: 4,
    tagIds: ["tag-goal-fat-loss", "tag-goal-high-fiber", "tag-restaurant-low-calorie"],
    isPremiumOnly: true,
    compatibilityReason: "health_goal_mode_and_high_fiber"
  },
  {
    id: "table-completed-demo",
    restaurantId: "restaurant-demo-verified",
    hostUserId: "user-restaurant-owner",
    mealTheme: "verified_restaurant_group_meal",
    status: "completed",
    currentMemberCount: 4,
    targetMemberCount: 4,
    tagIds: ["tag-restaurant-verified", "tag-restaurant-nutrition", "tag-social-new-restaurant"],
    isPremiumOnly: false,
    compatibilityReason: "verified_restaurant_and_new_restaurant_discovery"
  }
];

export const mockGroupTableMembers: GroupTableMember[] = [
  {
    id: "member-table-demo-1",
    tableId: "table-high-protein-dinner",
    userId: "user-demo",
    profileId: "profile-demo-user",
    isAnonymousPreview: false,
    joinedAt: "2026-05-25T11:00:00.000Z"
  },
  {
    id: "member-table-demo-2",
    tableId: "table-high-protein-dinner",
    userId: "user-social-preview",
    profileId: "profile-social-preview",
    isAnonymousPreview: true,
    joinedAt: "2026-05-25T11:30:00.000Z"
  }
];
