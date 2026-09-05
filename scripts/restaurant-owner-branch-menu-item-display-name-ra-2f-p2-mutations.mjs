#!/usr/bin/env node
import fs from "node:fs";
const paths = [
  "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name.ts",
  "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name-client.ts",
  "apps/restaurant-web/server/restaurant-owner-menu-item-display-name-runtime.ts",
  "apps/restaurant-web/repositories/supabase/restaurant-owner-menu-item-display-name-repository.ts",
  "apps/restaurant-web/components/menu/RestaurantOwnerMenuItemDisplayNameControl.tsx"
];
const source = paths.map(path => fs.readFileSync(path, "utf8")).join("\n");
const required = ["operation: \"set\"", "operation: \"clear\"", "expectedDisplayName", "branchSpecificDisplayName === null", "[...value].length", "canonicalizeDisplayName", "state !== \"applied\"", "Object.keys(value).sort()", "restaurant_owner_preview_branch_menu_item_display_name_v1", "restaurant_owner_set_branch_menu_item_display_name_v1", "private, no-store", "credentials: \"same-origin\"", "encodeURIComponent", "setConfirmation(\"set\")", "setConfirmation(\"clear\")", "系統不會自動重送", "canonicalDisplayName"];
const forbidden = ["service_role", ".from(", "PATCH", "branch_specific_description", "menu_items.name", "sold_out", "availability", "price", "branch_specific_status", "parseInt(", "normalize(", "Number(input.expectedVersion)"];
let survivors = 0;
for (const token of required) { const pass = source.includes(token); console.log(`${pass ? "KILLED" : "SURVIVED"} required ${token}`); if (!pass) survivors++; }
for (const token of forbidden) { const pass = !source.includes(token); console.log(`${pass ? "KILLED" : "SURVIVED"} forbidden ${token}`); if (!pass) survivors++; }
console.log(JSON.stringify({ suite: "ra-2f-p2-mutations", total: required.length + forbidden.length, killed: required.length + forbidden.length - survivors, survivors }));
if (survivors) process.exitCode = 1;
