# Database Schema Draft

## Domains

- users, profiles, subscriptions
- meals, meal_logs, nutrition_estimates, food_memory_entries
- recommendations, social_matches, social_unlocks, community_cards
- group_meal_tables, group_table_members
- restaurants, menu_items, ingredients, cooking_methods
- restaurant_verification_requests
- ads, sponsored_recommendations
- consents, data_access_logs, audit_logs, platform_settings
- tags, user_tags, meal_tags, restaurant_tags, menu_item_tags
- restaurant_menu_identification_audits, user_correction_audits
- self_cooked_estimation_audits, exercise_data_access_logs

## Notes

Schema should avoid generic key-value tables for core product domains. Tags can be normalized and attached through join tables. Community Cards should reference Food Memory entries and visibility settings. Social privacy settings must be enforced server-side before any restaurant social match or group table recommendation is returned.
