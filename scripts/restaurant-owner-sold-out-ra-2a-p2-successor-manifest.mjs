import {
  R1_BASELINE, R1_MIGRATION, R1_MIGRATION_SHA256, R1_PREVIEW,
  R1_ACCEPTANCE_TARGET, R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH,
  R1_ACCEPTANCE_MENU_ITEM, R1_FORBIDDEN_TARGETS, R1_FORBIDDEN_BRANCHES
} from "./restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs";
import {
  RA2AP1_MIGRATION, RA2AP1_MIGRATION_SHA256, RA2AP1_RPC
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

export const P2_ORIGIN_MAIN = "22a877c974e3efb39b3fe59e1b22f88a2711a319";
export const P2_P1 = R1_BASELINE;
export const P2_R1 = "9f40604784ee419d583dc43c454da284618c7f15";
export const P2_SUBJECT = "Activate Restaurant Owner sold-out control";
export const P2_P1_MIGRATION = RA2AP1_MIGRATION;
export const P2_P1_MIGRATION_SHA256 = RA2AP1_MIGRATION_SHA256;
export const P2_R1_MIGRATION = R1_MIGRATION;
export const P2_R1_MIGRATION_SHA256 = R1_MIGRATION_SHA256;
export const P2_PREVIEW_RPC = R1_PREVIEW.replace(/^public\./, "");
export const P2_MUTATION_RPC = RA2AP1_RPC.replace(/^public\./, "");
export const P2_ROUTE = "/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/sold-out";
export const P2_ACCEPTANCE_TARGET = R1_ACCEPTANCE_TARGET;
export const P2_ACCEPTANCE_RESTAURANT = R1_ACCEPTANCE_RESTAURANT;
export const P2_ACCEPTANCE_BRANCH = R1_ACCEPTANCE_BRANCH;
export const P2_ACCEPTANCE_MENU_ITEM = R1_ACCEPTANCE_MENU_ITEM;
export const P2_START_SOLD_OUT = false;
export const P2_START_VERSION = "2";
export const P2_START_AUDIT_ROWS = 2;
export const P2_FORBIDDEN_TARGETS = R1_FORBIDDEN_TARGETS;
export const P2_FORBIDDEN_BRANCHES = R1_FORBIDDEN_BRANCHES;

export const P2_PATHS = Object.freeze([
  "apps/restaurant-web/app/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/sold-out/route.ts",
  "apps/restaurant-web/components/menu/RestaurantOwnerSoldOutControl.tsx",
  "apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-sold-out-repository.ts",
  "apps/restaurant-web/runtime/restaurant-owner-sold-out.ts",
  "apps/restaurant-web/server/restaurant-owner-sold-out-runtime.ts",
  "docs/restaurant-owner-sold-out-ra-2a-p2.md",
  "package.json",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-contract.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-development-acceptance.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-guard.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-mutations.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-smoke.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p2-successor-manifest.mjs"
].sort());

export const P2_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-sold-out-ra-2a-p2",
  "test:restaurant-owner-sold-out-ra-2a-p2-smoke",
  "test:restaurant-owner-sold-out-ra-2a-p2-mutations",
  "test:restaurant-owner-sold-out-ra-2a-p2-development"
]);
