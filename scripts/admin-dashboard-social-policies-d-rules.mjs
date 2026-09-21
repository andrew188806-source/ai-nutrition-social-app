const has = (text, pattern) => typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

/** Shared static rules used by the ADMIN-D guard and focused source mutation suite. */
export function validateAdminD(source) {
  const errors = [];
  const need = (ok, code) => { if (!ok) errors.push(code); };
  const { migration, registry, dashboard, social, adapter, views } = source;

  need(has(registry, /id: "dashboard"[^\n]+requiredPermissions: \["admin_context\.read"\][^\n]+availability: "LIVE"/), "dashboard_route_split_authority");
  need(has(registry, /id: "social-policies"[^\n]+requiredPermissions: \["admin\.social\.policies\.read"\][^\n]+availability: "LIVE"/), "social_route_exact_authority");
  need(has(dashboard, /canReadCounts \? await readDashboardCounts\(\) : null/), "dashboard_rpc_not_conditional");
  need(has(dashboard, /has\(context, "admin\.dashboard\.counts\.read"\)/), "dashboard_wrong_permission");
  need(!has(dashboard, /\?\?\s*0|\|\|\s*0|state\s*!==\s*"ready"[\s\S]{0,200}(?:value:\s*0|counts:\s*\{)/), "dashboard_fake_zero_fallback");
  need(has(dashboard, /ReadFailureNotice/), "dashboard_error_not_distinct");
  need(!has(dashboard, /result\?\.state \?\? "ready"/), "dashboard_error_not_distinct");
  need(has(social, /readSocialPolicies\(page\)/) && has(social, /createAdminOperationalPage<Record<string, never>>\("social-policies"/), "social_contract_not_used");
  need(has(social, /<PageControls[^>]+pageSize=\{50\}/), "social_page_size_caption_wrong");
  need(has(views, /pageSize = 20/) && has(views, /每頁 \{pageSize\} 筆/), "shared_page_size_default_wrong");
  need(!has(social, /admin_context\.read|\.insert\(|\.update\(|\.delete\(|<button|contentEditable|mockTag|mockData/), "social_fallback_mutation_or_mock");
  need(has(adapter, /staff_admin_dashboard_counts_v1/) && has(adapter, /staff_admin_social_policies_v1/), "adapter_contract_missing");
  need(has(adapter, /raw\.state !== "ready"/) || has(adapter, /return call\(/), "adapter_not_fail_closed");
  need(!has(adapter, /from\(["'`]social_interest_catalog|\.insert\(|\.update\(|\.delete\(|mock/i), "adapter_raw_table_write_or_mock");

  need(has(migration, /staff_admin_restaurant_read_gate_v1\('admin\.dashboard\.counts\.read'\)/), "dashboard_db_exact_gate_missing");
  need(!has(migration, /staff_admin_restaurant_read_gate_v1\('admin_context\.read'\)/), "dashboard_db_base_fallback");
  need(has(migration, /staff_has_permission_v1\('admin\.social\.policies\.read'\)/), "social_db_exact_gate_missing");
  need(has(migration, /security definer/g) && (migration.match(/security definer/g) ?? []).length === 3, "security_definer_set_mismatch");
  need((migration.match(/set search_path = ''/g) ?? []).length === 3 && (migration.match(/set row_security = 'on'/g) ?? []).length === 3, "safe_function_config_missing");
  need(has(migration, /create role staff_admin_social_policy_reader nologin noinherit nobypassrls/), "social_sealed_reader_missing");
  need(has(migration, /grant select \(tag_key, namespace, parent_key, depth, selectable, display_order, active\)[\s\S]+to staff_admin_social_policy_reader/), "social_column_grant_missing");
  need(!has(migration, /grant select[^;]+social_interest_catalog[^;]+to (?:public|anon|authenticated)/i), "raw_social_client_select_added");
  need(has(migration, /revoke all on function public\.staff_admin_dashboard_counts_v1\(\)[\s\S]+from public, anon, authenticated, authenticator, service_role/) && has(migration, /grant execute on function public\.staff_admin_dashboard_counts_v1\(\) to authenticated/), "dashboard_acl_wrong");
  need(has(migration, /revoke all on function public\.staff_admin_social_policies_v1\(integer, integer\)[\s\S]+from public, anon, authenticated, authenticator, service_role/) && has(migration, /grant execute on function public\.staff_admin_social_policies_v1\(integer, integer\) to authenticated/), "social_acl_wrong");
  need(has(migration, /if v_limit not between 1 and 50 or v_offset not between 0 and 10000/), "social_contract_unbounded");
  need(has(migration, /order by c\.namespace collate "C", c\.display_order, c\.tag_key collate "C"/), "social_order_not_deterministic");
  need(!has(migration, /\b(?:insert into|update|delete from|truncate)\s+public\.(?:restaurants|restaurant_branches|menus|menu_items|social_interest_catalog|social_interest_catalog_label)\b/i), "contract_migration_writes_product_data");
  return errors;
}
