-- SR-2G-C-R1: Meal Buddy candidate pool authority grantor membership hygiene.
--
-- Privilege hygiene only. No schema, function, policy, eligibility or business rule changes anywhere.
-- The candidate pool primitive keeps its exact body, owner, SECURITY DEFINER / STABLE posture and
-- every privilege it holds; this migration removes one membership row and nothing else.
--
-- THE DEBT. SR-2G-C needed to assume meal_buddy_candidate_pool_authority in order to own its
-- primitive and receive EXECUTE on the frozen social_internal.authorized_candidates, and obtained
-- that ability with a bare `grant meal_buddy_candidate_pool_authority to postgres`. On PostgreSQL
-- 16+, pg_auth_members is keyed by (role, member, grantor), so that statement did not modify the
-- existing supabase_admin row — it created a SECOND row granted by postgres, and a bare GRANT
-- defaults INHERIT to true. The installation-time convenience therefore became a durable capability:
--
--     role                                  grantor         admin  inherit  set
--     meal_buddy_candidate_pool_authority   postgres        false  true     true    <- the debt
--     meal_buddy_candidate_pool_authority   supabase_admin  true   false    false   <- legitimate
--
-- This is the same debt shape SR-2G-B-R1 repaired on meal_buddy_card_write_authority, left behind by
-- the same installation pattern one round later. Nothing in the running product depends on the row.
-- The Edge runtime reaches the pool primitive as social_runtime_executor, which holds EXECUTE in its
-- own right; the row only lets postgres SET ROLE into the pool authority and, worse, inherit its
-- privileges — including SELECT on public.meal_buddy_cards and the role-scoped RLS policy that
-- reads every card — implicitly.
--
-- WHY REVOKE RATHER THAN `WITH SET FALSE`. Re-granting with SET FALSE would clear the SET flag but
-- leave the postgres-granted row in place, still carrying INHERIT — the very shape SR-2G-C measured
-- and rejected. GRANTED BY names the row exactly, so only the row SR-2G-C created is removed and the
-- frozen supabase_admin row, which carries ADMIN OPTION, is untouched.
--
-- THE PATTERN GOING FORWARD. A migration that needs temporary grantor authority must borrow it the
-- way SR-2G-C proved: grant with INHERIT FALSE and SET TRUE, perform the one narrow grant, return
-- the role to postgres, then REVOKE ... GRANTED BY postgres. The borrow never outlives the migration.

begin;

-- Removes ONLY the row whose grantor is postgres. The supabase_admin row keeps ADMIN OPTION, so
-- postgres retains the ability to administer this role's membership without holding SET or INHERIT.
revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;

commit;
