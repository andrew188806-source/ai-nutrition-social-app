# Terminology Standardization

## Purpose

This file standardizes vocabulary across the frozen Alpha 10 repository so engineers, investors, lawyers, advisors, and restaurant partners use consistent language.

## Brand Terms

| Standard Term | Use | Avoid / Notes |
|---|---|---|
| Haocu | English brand/workspace name. | Do not mix with unrelated romanization unless intentionally renamed. |
| 好廚 | Chinese working brand name. | Confirm trademark/brand availability before public registration. |
| Haocu OS | The master repository and operating documentation system. | Not necessarily a public product name. |
| Haocu App | Consumer-facing app concept. | Use when explaining to non-technical readers. |

## Product Terms

| Standard Term | Definition |
|---|---|
| AI Analysis | The meal photo/upload analysis flow that estimates dish identity, ingredients, calories, macros, and confidence/correction options. |
| Meal Record | A saved user meal entry with nutrition estimate, corrections, rating, and diary linkage. |
| Today Intake | The daily nutrition summary and current-day meal record view. |
| Food Diary | Historical saved meals, ratings, favorites, and paid retention surfaces. |
| Restaurant Recommendation | The restaurant/meal suggestion flow based on location, meal time, preferences, intake, and restaurant/menu data. |
| Meal Buddy Card | A user-created intent card for finding meal companions around a meal, restaurant, time, payment preference, and notes. |
| Social Card | A user-facing profile card for matching and meal-buddy discovery, with anonymous/free and real/paid modes. |
| Group Table | A four-person or larger shared dining table flow. |
| Premium | Paid subscription or paid feature tier. |
| Restaurant Admin | Restaurant-side menu, item, nutrition, and partner management interface. |
| Admin Review | Internal operations/admin review of restaurants, nutrition disclosures, sponsored content, and policy issues. |

## Evidence Terms

| Term | Definition |
|---|---|
| Planned | Described in product or business plan but not demonstrated or validated. |
| Demo | Shown in prototype, mock, screenshot, script, or staged walkthrough. |
| Pilot | Tested or discussed with limited real users, restaurants, partners, or advisors in a controlled setting. |
| Live | Operating with real production users, partners, transactions, or data. |
| Verified | Supported by third-party, professional, legal, financial, technical, or otherwise documented evidence. |

## Claim Language Standards

| Safer Language | Riskier Language |
|---|---|
| “Designed to help users understand meals.” | “Guarantees healthier eating.” |
| “Estimates nutrition and allows correction.” | “Accurately calculates nutrition.” |
| “Planned restaurant pilot path.” | “Restaurants are already partnered.” |
| “Demo flow shows the intended user journey.” | “Users are actively using this feature.” |
| “Professional review required.” | “Legally protected / compliant / approved.” |

## Engineering Naming Consistency

Use one consistent identity chain in implementation documents:

- `userId` for user identity.
- `communityCardId` or `socialCardId` for profile/social card identity; choose one in codebase and map legacy language.
- `mealBuddyCardId` for dining intent card.
- `matchId` for pairing result.
- `chatId` for one-to-one chat.
- `tableId` for group table.
- `restaurantId` for restaurant entity.
- `menuItemId` for menu item.
- `mealRecordId` for saved meal entry.

## Translation / Bilingual Note

The repository is primarily English for handoff consistency, while the user-facing product is Taiwan-first and Traditional Chinese. User-facing app copy should remain consistent with the i18n strategy in the UI/frontend sections.
