# Taste Memory and Embedding

## Purpose
Define the long-term AI asset behind Haocu: personal taste memory.

Taste memory is the bridge between meal records, ratings, restaurant recommendations, and social dining. It should eventually allow Haocu to recommend restaurants that match the user’s actual taste better than public average ratings.

## MVP Approach

MVP should use interpretable taste tags and weighted scoring rather than opaque embeddings.

Example tags:

- cuisine: Taiwanese, Japanese, Korean, healthy bento, dessert
- flavor: spicy, light, salty, sweet, rich
- meal style: quick meal, social dinner, solo lunch, healthy choice
- nutrition fit: high protein, low sugar, vegetable-rich, calorie-dense
- social fit: chat first, direct meal, group table

## Post-MVP Embedding Approach

Once enough data exists, each user, dish, restaurant, and menu item can have a taste vector.

Candidate vector inputs:

- User ratings.
- Repeat records.
- Dish tags.
- Restaurant categories.
- Nutrition profile.
- Correction patterns.
- Similar-user interaction.

## Entities

| Entity | Taste Representation |
|---|---|
| User | Preference vector + explicit constraints. |
| Dish | Flavor/nutrition/category vector. |
| Restaurant | Aggregated menu and user response vector. |
| Meal Buddy card | Intent/context vector. |
| Group table | Group dining context vector. |

## Recommendation Use Cases

- “You liked similar chicken bento meals.”
- “This restaurant matches your high-protein preference.”
- “People with similar taste saved this dish.”
- “This Meal Buddy wants a similar style of dinner.”

## Privacy and Governance

- Embeddings must not encode sensitive attributes intentionally.
- Similar-user recommendations should be aggregate and anonymized.
- Social matching must not reveal private food diary details.
- Users should be able to delete personal data according to compliance policy.

## Data Readiness

Embedding-based ranking should wait until:

1. Meal records have stable schema.
2. Rating data exists.
3. Restaurant/menu taxonomy is cleaned.
4. Correction loops are tracked.
5. Privacy policy and consent text are reviewed.

## Acceptance Criteria

1. MVP taste memory can work without ML embeddings.
2. All taste signals are traceable to explicit product events.
3. Future embedding fields are planned but not required for MVP launch.
4. Social recommendation does not expose another user’s detailed diary.
