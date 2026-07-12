# Restaurant Admin PRD

## Objective

Define the restaurant partner admin concept for MVP+ while keeping consumer MVP focused.

## Stage Boundary

Restaurant admin is not required for the first consumer MVP unless needed for demo. It should be specified now so data models and restaurant surfaces do not block future implementation.

## Restaurant Admin Goals

- Manage restaurant profile.
- Manage menu/dish data.
- Submit nutrition estimates for review.
- View basic demand/interest signals.
- Manage campaign or pilot participation in later phases.

## MVP+ Functional Requirements

1. Restaurant can log in or be invited.
2. Restaurant can view profile/card.
3. Restaurant can add/edit menu items.
4. Restaurant can upload dish photo.
5. Restaurant can submit nutrition information or request estimate.
6. Admin can review changes before public trust badges.
7. Restaurant can see basic analytics.

## Data Dependencies

- `restaurant_accounts`
- `restaurants`
- `restaurant_locations`
- `restaurant_dishes`
- `dish_photos`
- `nutrition_review_items`
- `restaurant_analytics_snapshots`

## API Dependencies

- `GET /restaurant-admin/profile`
- `PATCH /restaurant-admin/profile`
- `POST /restaurant-admin/dishes`
- `PATCH /restaurant-admin/dishes/{dishId}`
- `POST /restaurant-admin/nutrition-review`

## Acceptance Criteria for MVP+ Planning

1. Consumer restaurant card can later connect to restaurant-owned data.
2. Menu/dish model supports ownership and review status.
3. Nutrition claims can be separated by estimate/provided/reviewed.
4. Restaurant admin does not become a prerequisite for consumer MVP.
