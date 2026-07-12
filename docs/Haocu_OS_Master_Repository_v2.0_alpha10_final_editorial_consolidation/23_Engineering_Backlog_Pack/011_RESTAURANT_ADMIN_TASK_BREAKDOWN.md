# 011 Restaurant Admin Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document turns the restaurant/admin PRDs into implementation tasks for web/admin surfaces and backend support.

## MVP Restaurant Admin Goal

Restaurant admin should prove that Haocu can evolve from user-side AI estimation into a restaurant-supported nutrition data network. It does not need to be a full POS or enterprise dashboard in MVP.

## Surfaces

- Restaurant owner/admin login placeholder.
- Restaurant profile page.
- Menu item list.
- Menu item editor.
- Nutrition estimate/review state.
- Admin review queue placeholder.

## Task Group A — Restaurant Profile

Fields:

- Restaurant name.
- Branch/location.
- Contact or admin owner.
- Cuisine/category tags.
- Verification status.
- Display image.
- Operating status placeholder.

Tasks:

- Build profile read/edit form.
- Validate required fields.
- Save through restaurant service.
- Display profile in consumer restaurant detail.

Done when:

- Editing profile updates the demo/consumer restaurant card.

## Task Group B — Menu Item CRUD

Fields:

- Dish name.
- Price.
- Portion size.
- Ingredients.
- Cooking method.
- Calories.
- Protein/carbs/fat/fiber.
- Dietary tags.
- Source: AI estimate / restaurant confirmed / admin approved.

Tasks:

- Build menu list.
- Build create/edit form.
- Add validation for nutrition fields.
- Add source and confidence labels.
- Save to local adapter and Supabase adapter interface.

Done when:

- Created/edited item appears on restaurant detail menu list.

## Task Group C — AI Nutrition Estimate Support

Tasks:

- Add button or flow to request AI estimate for a menu item.
- Store estimate separately from confirmed/approved values.
- Allow restaurant to accept/edit estimate.
- Record status transition.

Done when:

- AI estimate can be visibly distinguished from restaurant-confirmed value.

## Task Group D — Admin Review Queue

Statuses:

- draft
- submitted
- under_review
- approved
- rejected
- needs_changes

Tasks:

- Create review list placeholder.
- Show changed fields.
- Add approve/reject buttons in demo mode.
- Add audit log entry.
- Control consumer verified badge based on approved state.

Done when:

- Approved menu item shows verified/source label on consumer side.

## Task Group E — Restaurant-to-Meal-Buddy Integration

Tasks:

- Menu item card exposes “use this meal to create Meal Buddy card” data.
- Restaurant/detail page passes restaurant ID, menu item ID, date/time, and dish name to Meal Buddy service.
- Date selector placement is close to card.

Done when:

- User can create Meal Buddy card from a restaurant menu item and see the result immediately.

## Out of Scope for MVP

- Full POS integration.
- Payments between restaurant and user.
- Supply chain and surplus food marketplace.
- Automated nutrition certification.
- Multi-branch enterprise permissions beyond simple owner/admin mapping.

## QA Checklist

- Required fields block invalid save.
- Consumer view reflects approved/demo data.
- Draft/rejected data does not show as verified.
- Restaurant admin cannot edit another restaurant in Supabase mode.
- Menu item nutrition source is always visible.
