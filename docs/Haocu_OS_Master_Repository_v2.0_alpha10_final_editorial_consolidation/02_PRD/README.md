# 02 PRD

This section contains product requirement documents for the Haocu MVP and adjacent MVP+ features. These documents should be used to convert strategy into engineering backlog, QA test cases, and professional review items.

## PRD Standards

Each PRD should define:

- objective;
- user problem;
- scope;
- user stories;
- primary flow;
- functional requirements;
- non-functional requirements;
- data dependencies;
- API dependencies;
- UI states;
- analytics events;
- acceptance criteria;
- MVP / MVP+ / future boundary;
- review risks.

## Documents

| File | Scope |
|---|---|
| `001_MOBILE_APP_PRD.md` | Overall mobile app shell and core consumer journey. |
| `002_AI_ANALYSIS_PRD.md` | Photo/upload meal analysis, candidates, confidence, and correction. |
| `003_MEAL_RECORD_PRD.md` | Meal record collection, today intake, planned meal, and completion state. |
| `004_RECOMMENDATION_PRD.md` | Next-meal, dish, and restaurant recommendation logic. |
| `005_MEAL_BUDDY_PRD.md` | Meal-buddy card creation and candidate matching. |
| `006_SOCIAL_CARD_PRD.md` | Anonymous/real social card identity and profile display. |
| `007_GROUP_TABLE_PRD.md` | Four-person table and group dining lifecycle. |
| `008_RESTAURANT_PRD.md` | Restaurant list/card/menu and restaurant-to-social actions. |
| `009_PREMIUM_PRD.md` | Free vs premium capability rules. |
| `010_FOOD_DIARY_PRD.md` | Diary, ratings, favorites, saved windows, and share surfaces. |
| `011_CALORIE_SHARING_PRD.md` | Calorie/guilt sharing and deferred multi-photo design. |
| `012_ONBOARDING_PROFILE_PRD.md` | User onboarding, profile, preferences, and health-goal inputs. |
| `013_CHAT_INVITATION_PRD.md` | Chat, invite, acceptance, cancellation, and list ordering. |
| `014_RESTAURANT_ADMIN_PRD.md` | Restaurant partner admin concept and MVP+ dashboard scope. |
| `015_ADMIN_REVIEW_PRD.md` | Internal review queues for restaurant, nutrition, ads, and safety. |
| `016_ANALYTICS_EVENT_PRD.md` | Product event tracking requirements. |
| `017_NOTIFICATION_PRD.md` | Meal reminders, rating reminders, social notifications. |
| `018_HEALTH_GOAL_MODE_PRD.md` | Premium health-goal mode and safety boundaries. |
| `019_MASCOT_IDENTITY_PRD.md` | Mascot identity, anonymous avatars, and shareable IP layer. |
| `020_ERROR_EMPTY_STATE_PRD.md` | Cross-product empty, loading, error, and offline states. |

## MVP Consistency Notes

- The MVP is not a medical product.
- AI analysis must support correction.
- Today intake and full nutrition report must read from the same meal collection.
- Meal-buddy and group-table flows must reference unified user/card/chat data.
- Free and premium limits must be consistent across UI, backend, and QA.
- Traditional Chinese copy must be centralized in i18n resources.
