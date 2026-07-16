BEGIN;

-- Phase 2V-C integrity boundary for the existing text-ID restaurant schema.
-- These constraints validate existing rows atomically and perform no backfill.

ALTER TABLE public.restaurant_branches
  ADD CONSTRAINT restaurant_branches_id_restaurant_id_key
  UNIQUE (id, restaurant_id);

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_id_restaurant_id_key
  UNIQUE (id, restaurant_id);

ALTER TABLE public.branch_menu_items
  ADD CONSTRAINT branch_menu_items_branch_restaurant_fkey
  FOREIGN KEY (branch_id, restaurant_id)
  REFERENCES public.restaurant_branches (id, restaurant_id)
  ON UPDATE RESTRICT
  ON DELETE CASCADE;

ALTER TABLE public.branch_menu_items
  ADD CONSTRAINT branch_menu_items_item_restaurant_fkey
  FOREIGN KEY (menu_item_id, restaurant_id)
  REFERENCES public.menu_items (id, restaurant_id)
  ON UPDATE RESTRICT
  ON DELETE CASCADE;

COMMIT;
