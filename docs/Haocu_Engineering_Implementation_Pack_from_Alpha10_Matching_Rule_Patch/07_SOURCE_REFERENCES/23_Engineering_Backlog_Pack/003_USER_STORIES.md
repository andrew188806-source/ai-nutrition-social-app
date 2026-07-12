# 003 User Stories

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document translates Haocu MVP features into user stories. These are designed to be copied into engineering tickets or sprint planning docs.

## Consumer App Stories

### AI Meal Analysis

**US-C01 — Analyze a meal from a photo**  
As a user, I want to take or upload a meal photo so that Haocu can estimate what I ate without requiring full manual entry.

**US-C02 — Choose the correct AI candidate**  
As a user, I want to choose from likely meal candidates so that the saved record matches my actual meal.

**US-C03 — Correct an AI result manually**  
As a user, I want to edit restaurant, dish, ingredients, portion, cooking method, and nutrition values so that incorrect analysis can be fixed.

**US-C04 — Save the confirmed result**  
As a user, I want to save a confirmed meal to today’s intake so that my nutrition summary, diary, and recommendations update.

**US-C05 — Preserve analysis state**  
As a user, I want the analysis page to stay on the same result when I briefly leave the page so that I do not lose my work.

### Today Intake and Food Diary

**US-C06 — View today’s nutrition summary**  
As a user, I want the home page to show a clean summary of today’s nutrition so that I understand my current status quickly.

**US-C07 — View full nutrition details**  
As a user, I want a detailed intake report so that I can understand calories, protein, carbs, fat, fiber, and balance.

**US-C08 — View meal history**  
As a user, I want a food diary so that I can remember what I ate and how I rated it.

**US-C09 — Rate meals after eating**  
As a user, I want to rate a meal after eating so that Haocu can learn my taste and improve future recommendations.

**US-C10 — Plan dinner without counting it as eaten**  
As a user, I want to mark a planned dinner so that I can preview my day without incorrectly logging food I have not eaten.

### Recommendations

**US-C11 — Receive next-meal guidance**  
As a user, I want Haocu to recommend my next meal based on what I already ate so that I can make a better choice.

**US-C12 — Understand why a meal is recommended**  
As a user, I want a short reason for each suggestion so that I trust the recommendation.

**US-C13 — Find restaurants by context**  
As a user, I want to filter restaurants by location, meal time, and food type so that I can find options near me.

**US-C14 — Get recommendations based on similar taste**  
As a user, I want recommendations influenced by users with similar taste so that I avoid misleading public ratings.

### Meal Buddy

**US-C15 — Create a Meal Buddy card from an AI result**  
As a user, I want to use my analyzed meal to find a meal buddy so that food logging naturally connects to social dining.

**US-C16 — Create a Meal Buddy card from a restaurant**  
As a user, I want to create a Meal Buddy card from a restaurant card so that I can find someone to eat there with me.

**US-C17 — See the card I just created**  
As a user, I want to be taken to the correct card area after creation so that I know the card exists.

**US-C18 — Invite a candidate**  
As a user, I want to invite a candidate to chat or eat so that I can coordinate a meal safely.

**US-C19 — Accept an invitation**  
As a user, I want accepting an invitation to update my friend/match state so that the relationship is not lost between tabs.

**US-C20 — Return to the correct chat list**  
As a user, I want the back action from chat to return to the chat list so that navigation feels predictable.

### Group Table

**US-C21 — Join a four-person table**  
As a user, I want to join a group table so that I can participate in a shared dining plan.

**US-C22 — View table participants**  
As a user, I want to see participant cards so that I understand who is joining the meal.

**US-C23 — Cancel with a reason**  
As a user, I want cancellation to include a reason so that other participants are informed.

**US-C24 — Use guilt/calorie sharing after a meal**  
As a user, I want to split or share the feeling of eating together so that the social feature feels playful, not clinical.

### Premium

**US-C25 — Understand free vs premium limits**  
As a user, I want clear limit states so that I understand why some actions are locked or limited.

**US-C26 — Unlock richer social identity**  
As a premium user, I want to show a real profile photo after verification so that I can build more trust.

## Restaurant Stories

**US-R01 — Manage restaurant profile**  
As a restaurant operator, I want to manage profile and basic details so that users see accurate information.

**US-R02 — Manage menu items**  
As a restaurant operator, I want to create and edit menu items with price, portion, ingredients, cooking method, and nutrition fields.

**US-R03 — Review AI nutrition estimates**  
As a restaurant operator, I want to review AI-estimated nutrition so that I can approve or correct menu disclosures.

**US-R04 — See menu items reflected in consumer surfaces**  
As a restaurant operator, I want approved menu items to appear in the user-facing restaurant page.

## Admin Stories

**US-A01 — Review restaurant submissions**  
As an admin, I want to review restaurant profile/menu/nutrition submissions so that public information is trustworthy.

**US-A02 — Moderate verification status**  
As an admin, I want to approve/reject verification states so that badges are meaningful.

**US-A03 — Audit changes**  
As an admin, I want changes to be logged so that disputes or compliance reviews can be handled.

## Investor / Demo Stories

**US-I01 — Run a three-minute product demo**  
As the founder, I want a stable demo route so that I can show the product narrative to advisors, investors, and partners.

**US-I02 — Reset demo seed data**  
As the founder, I want demo data to reset so that repeated presentations start from a known state.

**US-I03 — Avoid misleading claims**  
As the founder, I want demo/investor copy to distinguish demo data, projections, and actual traction so that the pitch remains credible.
