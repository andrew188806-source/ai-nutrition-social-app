import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { MealBuddyCandidate, MealBuddyCard, RankedMealBuddyCandidate } from "./types";

export function rankMealBuddyRecommendations(card: MealBuddyCard, candidates: MealBuddyCandidate[]): RankedMealBuddyCandidate[] {
  return candidates
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      if (card.restaurantId && candidate.restaurantId === card.restaurantId) {
        score += 38;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameRestaurant);
      } else if (card.restaurantName && candidate.restaurantName === card.restaurantName) {
        score += 34;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameRestaurant);
      }

      if (card.preferredFoodName && candidate.preferredFoodName === card.preferredFoodName) {
        score += 26;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameFood);
      }

      if (card.foodCategory && candidate.foodCategory === card.foodCategory) {
        score += 20;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameCategory);
      }

      if (card.nutritionGoal && candidate.nutritionGoal === card.nutritionGoal) {
        score += 15;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameGoal);
      }

      if (card.area && candidate.area === card.area) {
        score += 14;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.nearby);
      }

      if (card.preferredTime && candidate.preferredTime === card.preferredTime) {
        score += 13;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameTime);
      }

      if (candidate.intentionType === card.intentionType) {
        score += 12;
        reasons.push(zhTW.mobile.refinedLogic.mealBuddyCard.reason.sameIntention);
      }

      score += Math.max(0, 12 - candidate.distanceKm * 2);
      score += Math.min(10, candidate.activityScore);

      if (candidate.isPremium) {
        score += 4;
      }
      if (candidate.isVerified) {
        score += 3;
      }

      return {
        ...candidate,
        rankScore: Math.round(score),
        matchReasons: reasons.slice(0, 3)
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

export function groupRankedMealBuddies(card: MealBuddyCard, ranked: RankedMealBuddyCandidate[]) {
  return [
    {
      id: "best",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.best,
      items: ranked.slice(0, 4)
    },
    {
      id: "sameFood",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.sameFood,
      items: ranked.filter((candidate) => candidate.foodCategory === card.foodCategory || candidate.preferredFoodName === card.preferredFoodName).slice(0, 4)
    },
    {
      id: "nearby",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.nearby,
      items: ranked.filter((candidate) => candidate.area === card.area || candidate.distanceKm <= 1.5).slice(0, 4)
    },
    {
      id: "sameRestaurant",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.sameRestaurant,
      items: ranked.filter((candidate) => Boolean(card.restaurantName) && candidate.restaurantName === card.restaurantName).slice(0, 4)
    },
    {
      id: "chatFirst",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.chatFirst,
      items: ranked.filter((candidate) => candidate.intentionType === "chat_first").slice(0, 4)
    },
    {
      id: "eatTogether",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.eatTogether,
      items: ranked.filter((candidate) => candidate.intentionType === "eat_together").slice(0, 4)
    },
    {
      id: "hotTables",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.hotTables,
      items: ranked.filter((candidate) => candidate.intentionType === "eat_together" || candidate.activityScore >= 8).slice(0, 4)
    },
    {
      id: "latest",
      title: zhTW.mobile.refinedLogic.mealBuddyCard.sections.latest,
      items: ranked.slice().reverse().slice(0, 4)
    }
  ].filter((section) => section.items.length > 0);
}

