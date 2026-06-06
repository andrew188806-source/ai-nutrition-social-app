import type { Tag } from "../types";

export const eatingHabitTags: Tag[] = [
  { id: "tag-eating-high-protein", category: "eating_habit", label: "高蛋白", slug: "high_protein", description: "偏好蛋白質充足的餐點" },
  { id: "tag-eating-low-carb", category: "eating_habit", label: "低碳", slug: "low_carb", description: "偏好降低精緻碳水攝取" },
  { id: "tag-eating-balanced", category: "eating_habit", label: "均衡飲食", slug: "balanced", description: "重視營養比例與穩定飲食" },
  { id: "tag-eating-out", category: "eating_habit", label: "外食族", slug: "eats_out", description: "常以外食完成日常餐點" },
  { id: "tag-eating-home-cook", category: "eating_habit", label: "自煮族", slug: "home_cook", description: "常自己準備餐點" },
  { id: "tag-eating-late-night", category: "eating_habit", label: "宵夜控制", slug: "late_night_control", description: "想降低深夜進食頻率" },
  { id: "tag-eating-dessert", category: "eating_habit", label: "甜食控", slug: "dessert_fan", description: "喜歡甜食但希望更有節制" },
  { id: "tag-eating-vegetarian", category: "eating_habit", label: "蔬食友善", slug: "vegetarian_friendly", description: "偏好蔬食或植物性餐點" }
];

export const healthGoalTags: Tag[] = [
  { id: "tag-goal-fat-loss", category: "health_goal", label: "減脂", slug: "fat_loss", description: "以生活化方式支持體態管理" },
  { id: "tag-goal-muscle-gain", category: "health_goal", label: "增肌", slug: "muscle_gain", description: "重視蛋白質與訓練搭配" },
  { id: "tag-goal-maintain", category: "health_goal", label: "維持體態", slug: "maintain_shape", description: "維持穩定飲食與活動節奏" },
  { id: "tag-goal-journal", category: "health_goal", label: "飲食紀錄", slug: "food_journal", description: "用紀錄理解自己的飲食型態" },
  { id: "tag-goal-sugar-aware", category: "health_goal", label: "控糖友善", slug: "sugar_aware", description: "注意糖分與精緻碳水攝取" },
  { id: "tag-goal-high-fiber", category: "health_goal", label: "高纖飲食", slug: "high_fiber", description: "增加蔬菜、豆類與全穀攝取" },
  { id: "tag-goal-fitness", category: "health_goal", label: "運動搭配", slug: "fitness_pairing", description: "把飲食與運動生活搭配" },
  { id: "tag-goal-calorie", category: "health_goal", label: "熱量管理", slug: "calorie_management", description: "理解日常熱量與份量" }
];

export const socialIntentTags: Tag[] = [
  { id: "tag-social-healthy-meal", category: "social_intent", label: "找人一起吃健康餐", slug: "healthy_meal_partner", description: "想找健康飲食夥伴" },
  { id: "tag-social-meal-friend", category: "social_intent", label: "找飯友", slug: "meal_friend", description: "想找飲食節奏相近的飯友" },
  { id: "tag-social-healthy-together", category: "social_intent", label: "一起吃健康餐", slug: "eat_healthy_together", description: "想一起吃健康餐" },
  { id: "tag-social-post-workout-protein", category: "social_intent", label: "健身後補蛋白", slug: "post_workout_protein", description: "想找運動後補給夥伴" },
  { id: "tag-social-restaurant-explore", category: "social_intent", label: "一起探店", slug: "restaurant_explore", description: "想探索健康餐廳" },
  { id: "tag-social-new-friends", category: "social_intent", label: "認識新朋友", slug: "meet_new_friends", description: "想認識新的生活型態朋友" },
  { id: "tag-social-friends-only", category: "social_intent", label: "純朋友模式", slug: "friends_only", description: "只以朋友互動為主" },
  { id: "tag-social-single-open", category: "social_intent", label: "單身可認識", slug: "single_open", description: "單身且可認識新朋友" },
  { id: "tag-social-open-social", category: "social_intent", label: "開放交友", slug: "open_social", description: "開放一般社交互動" },
  { id: "tag-social-no-romance", category: "social_intent", label: "不考慮感情發展", slug: "no_romance", description: "明確不以感情發展為目的" },
  { id: "tag-social-no-offline", category: "social_intent", label: "不線下見面", slug: "no_offline_meetup", description: "只保留線上互動" },
  { id: "tag-social-chat-only", category: "social_intent", label: "只聊天室交流", slug: "chat_only", description: "僅開放聊天室交流" },
  { id: "tag-social-lunch", category: "social_intent", label: "找午餐夥伴", slug: "lunch_partner", description: "想找中午一起吃的人" },
  { id: "tag-social-dinner", category: "social_intent", label: "找晚餐夥伴", slug: "dinner_partner", description: "想找晚餐同行的人" },
  { id: "tag-social-control", category: "social_intent", label: "一起控制飲食", slug: "diet_accountability", description: "希望有人一起維持飲食節奏" },
  { id: "tag-social-new-restaurant", category: "social_intent", label: "一起嘗試新餐廳", slug: "try_new_restaurants", description: "想探索新餐廳與新菜單" },
  { id: "tag-social-recommend-only", category: "social_intent", label: "只想看推薦", slug: "recommendations_only", description: "暫時只想接收推薦" },
  { id: "tag-social-private", category: "social_intent", label: "暫不公開完整資料", slug: "private_profile", description: "偏好匿名或低可見度" }
];

export const restaurantTags: Tag[] = [
  { id: "tag-restaurant-verified", category: "restaurant", label: "藍勾勾認證", slug: "blue_badge_verified", description: "完成身分、營養揭露與平台品質審查" },
  { id: "tag-restaurant-nutrition", category: "restaurant", label: "有營養標示", slug: "nutrition_disclosed", description: "提供菜單營養資訊" },
  { id: "tag-restaurant-high-protein", category: "restaurant", label: "高蛋白菜單", slug: "high_protein_menu", description: "提供蛋白質較高的餐點" },
  { id: "tag-restaurant-low-calorie", category: "restaurant", label: "低卡選項", slug: "low_calorie_options", description: "提供熱量較低的餐點選擇" },
  { id: "tag-restaurant-vegetarian", category: "restaurant", label: "蔬食選項", slug: "vegetarian_options", description: "提供蔬食餐點" },
  { id: "tag-restaurant-muscle", category: "restaurant", label: "適合增肌", slug: "muscle_gain_friendly", description: "適合增肌與運動搭配族群" },
  { id: "tag-restaurant-fat-loss", category: "restaurant", label: "適合減脂", slug: "fat_loss_friendly", description: "適合體態管理與減脂目標" }
];

export const mealTags: Tag[] = [
  { id: "tag-meal-crispy", category: "meal", label: "酥脆口感", slug: "crispy", description: "可作為聊天與回憶提示" },
  { id: "tag-meal-light", category: "meal", label: "清爽不膩", slug: "light", description: "適合下一餐推薦" },
  { id: "tag-meal-favorite", category: "meal", label: "收藏餐點", slug: "favorite_meal", description: "可支援 Food Memory 搜尋" },
  { id: "tag-meal-self-cooked", category: "meal", label: "自煮", slug: "self_cooked", description: "自己動手做的餐點" },
  { id: "tag-meal-self-high-protein", category: "meal", label: "高蛋白自煮", slug: "self_cooked_high_protein", description: "高蛋白自煮餐" },
  { id: "tag-meal-self-fat-loss", category: "meal", label: "減脂自煮", slug: "self_cooked_fat_loss", description: "減脂目標自煮餐" },
  { id: "tag-meal-prep", category: "meal", label: "健身備餐", slug: "fitness_meal_prep", description: "運動與備餐情境" },
  { id: "tag-meal-home-style", category: "meal", label: "家常料理", slug: "home_style", description: "日常家常菜" },
  { id: "tag-meal-self-low-calorie", category: "meal", label: "低卡自煮", slug: "self_cooked_low_calorie", description: "較低熱量自煮餐" }
];

export const menuItemTags: Tag[] = [
  { id: "tag-menu-disclosed", category: "menu_item", label: "已揭露營養", slug: "nutrition_disclosed_menu_item", description: "菜單項目已有營養資訊" },
  { id: "tag-menu-ai-estimated", category: "menu_item", label: "AI 估算", slug: "ai_estimated", description: "由 mock AI 流程估算營養" },
  { id: "tag-menu-health-goal-fit", category: "menu_item", label: "符合健康目標", slug: "health_goal_fit", description: "可用於 Premium Health Goal Mode" }
];

export const mockTags: Tag[] = [
  ...eatingHabitTags,
  ...healthGoalTags,
  ...socialIntentTags,
  ...restaurantTags,
  ...mealTags,
  ...menuItemTags
];
