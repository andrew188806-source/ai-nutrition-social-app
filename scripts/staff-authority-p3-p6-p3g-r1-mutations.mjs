#!/usr/bin/env node

import fs from "node:fs";

const r1 = fs.readFileSync("supabase/migrations/20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql", "utf8");
const replace = (source, needle, replacement) => {
  if (!source.includes(needle)) throw new Error(`mutation needle absent: ${needle.slice(0, 120)}`);
  return source.replace(needle, replacement);
};
const count = (source, pattern) => source.match(pattern)?.length ?? 0;

const EXACT_SET_BLOCK_START = "  -- Order-independent exact-set proof";
const EXACT_SET_BLOCK_END = "  v_cap := least(";
function extractExactSetBlock(source) {
  const start = source.indexOf(EXACT_SET_BLOCK_START);
  const end = source.indexOf(EXACT_SET_BLOCK_END, start);
  if (start < 0 || end < 0) throw new Error("exact-set block markers not found");
  return { start, end, block: source.slice(start, end) };
}

function accepts(candidate) {
  const start = candidate.indexOf("create or replace function admin_internal.staff_break_glass_extend_activation_v1(");
  const end = candidate.indexOf("\n$$;", start);
  const body = start >= 0 && end > start ? candidate.slice(start, end) : "";
  if (!body) return false;
  return [
    /if session_user <> 'postgres'/.test(body),
    /v_activation\.status_version <> p_expected_status_version/.test(body) && /message = 'stale_state'/.test(body),
    /v_activation\.status <> 'active'/.test(body) && /activation_not_active/.test(body),
    /v_now >= v_activation\.effective_until/.test(body) && /activation_expired/.test(body),
    /principal_not_active/.test(body),
    /staff_account_not_effective/.test(body),
    /staff_break_glass_assert_root_contract_v1/.test(body),
    // Exact-set proof must be present, order-independent, and complete: exact row count,
    // exact distinct-key count, zero unexpected keys, zero missing keys, no ORDER BY, no
    // literal-array equality against the permission set.
    !/array_agg\([^)]*order by[^)]*permission_key\)/i.test(body),
    !/v_permissions\s*<>\s*array\s*\[/i.test(body),
    /v_count <> 4/.test(body),
    /count\(distinct grant_row\.permission_key\)/i.test(body) && /v_distinct_count <> 4/.test(body),
    (body.match(/'admin_context\.read'/g) ?? []).length >= 2
      && (body.match(/'admin\.management\.staff\.account\.write'/g) ?? []).length >= 2
      && (body.match(/'admin\.management\.staff\.console_admission\.write'/g) ?? []).length >= 2
      && (body.match(/'admin\.management\.staff\.permission\.write'/g) ?? []).length >= 2,
    !/'admin_audit\.read'/.test(body) && !/'admin\.management\.staff\.delegation\.write'/.test(body)
      && !/'admin_restaurant_branch\.status\.write'/.test(body),
    /not in \(/.test(body),
    /not exists[\s\S]*expected\.permission_key/.test(body),
    /entitlement\.source_type = 'direct_grant'/.test(body),
    /entitlement\.source_bundle_assignment_id is null/.test(body),
    /entitlement\.staff_account_id = v_principal\.staff_account_id/.test(body),
    /entitlement\.effective_from = v_activation\.effective_from/.test(body),
    /entitlement\.effective_until = v_activation\.effective_until/.test(body),
    /v_activation\.effective_until \+ interval '30 minutes'/.test(body),
    /v_new_end <= v_activation\.effective_until/.test(body) && /extension_limit_reached/.test(body),
    /v_activation\.effective_from \+ interval '2 hours'/.test(body),
    /coalesce\(v_staff\.effective_until, 'infinity'::timestamptz\)/.test(body),
    /grant_row\.activation_id = p_activation_id[\s\S]{0,400}grant_row\.entitlement_id = entitlement\.entitlement_id/.test(
      body.slice(body.indexOf("update admin_internal.staff_permission_entitlements entitlement"))
    ),
    count(body, /insert into admin_internal\.staff_break_glass_control_receipts/g) === 1,
    count(body, /insert into admin_internal\.staff_break_glass_audit_log/g) === 1,
  ].every(Boolean);
}

const { block: originalBlock } = extractExactSetBlock(r1);

const oldOrderSensitiveBlock = `  select pg_catalog.count(*)::integer,
    pg_catalog.array_agg(grant_row.permission_key order by grant_row.permission_key)
  into v_count, v_permissions
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_id = p_activation_id
    and grant_row.status = 'active'
    and entitlement.status = 'active'
    and entitlement.effective_from = v_activation.effective_from
    and entitlement.effective_until = v_activation.effective_until;
  if v_count <> 4 or v_permissions <> array[
    'admin.management.staff.account.write',
    'admin.management.staff.console_admission.write',
    'admin.management.staff.permission.write',
    'admin_context.read'
  ]::text[] then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
`;
const reorderedOrderSensitiveBlock = oldOrderSensitiveBlock.replace(
  `array[
    'admin.management.staff.account.write',
    'admin.management.staff.console_admission.write',
    'admin.management.staff.permission.write',
    'admin_context.read'
  ]`,
  `array[
    'admin_context.read',
    'admin.management.staff.account.write',
    'admin.management.staff.console_admission.write',
    'admin.management.staff.permission.write'
  ]`
);

function withBlock(replacementBlock) {
  return replace(r1, originalBlock, replacementBlock);
}

const countOnlyBlock = originalBlock
  .replace(/if exists \(\s*select 1\s*from admin_internal\.staff_break_glass_activation_grants grant_row[\s\S]*?end if;\n(?=\s*if exists \(\s*select expected)/, "")
  .replace(/if exists \(\s*select expected\.permission_key[\s\S]*?end if;\n/, "");

const omitMissingKeyBlock = originalBlock.replace(/if exists \(\s*select expected\.permission_key[\s\S]*?end if;\n/, "");

const omitUnexpectedKeyBlock = originalBlock.replace(
  /if exists \(\s*select 1\s*from admin_internal\.staff_break_glass_activation_grants grant_row[\s\S]*?end if;\n(?=\s*if exists \(\s*select expected)/, ""
);

const noDuplicateCheckBlock = originalBlock
  .replace(
    "select pg_catalog.count(*)::integer,\n    pg_catalog.count(distinct grant_row.permission_key)::integer\n  into v_count, v_distinct_count",
    "select pg_catalog.count(*)::integer\n  into v_count"
  )
  .replace("if v_count <> 4 or v_distinct_count <> 4 then", "if v_count <> 4 then");

const threeKeyRootBlock = originalBlock.replaceAll(
  "'admin.management.staff.permission.write'\n      )",
  ")"
).replaceAll(
  "  'admin.management.staff.permission.write'\n    ]::text[]) expected(permission_key)",
  "]::text[]) expected(permission_key)"
).replaceAll(
  "'admin.management.staff.permission.write',\n      'admin_context.read',",
  "'admin_context.read',"
);

const fifthKeyBlock = originalBlock
  .replace(
    "'admin.management.staff.permission.write'\n      )",
    "'admin.management.staff.permission.write',\n        'admin_audit.read'\n      )"
  )
  .replace(
    "'admin.management.staff.permission.write'\n    ]::text[]) expected(permission_key)",
    "'admin.management.staff.permission.write',\n      'admin_audit.read'\n    ]::text[]) expected(permission_key)"
  );

const noProvenanceConsistencyBlock = originalBlock.replaceAll(
  "\n    and entitlement.source_type = 'direct_grant'\n    and entitlement.source_bundle_assignment_id is null\n    and entitlement.staff_account_id = v_principal.staff_account_id", ""
);

const mutants = [
  ["restore array_agg ORDER BY + literal equality", withBlock(oldOrderSensitiveBlock)],
  ["reorder hardcoded permission array only (naive locale patch)", withBlock(reorderedOrderSensitiveBlock)],
  ["accept only count=4 without checking expected keys", withBlock(countOnlyBlock)],
  ["omit missing-key detection", withBlock(omitMissingKeyBlock)],
  ["omit unexpected-key detection", withBlock(omitUnexpectedKeyBlock)],
  ["allow duplicate key to satisfy cardinality", withBlock(noDuplicateCheckBlock)],
  ["reduce expected root set to three", withBlock(threeKeyRootBlock)],
  ["add a fifth accepted root key", withBlock(fifthKeyBlock)],
  ["remove provenance/source consistency", withBlock(noProvenanceConsistencyBlock)],
  ["bypass status_version CAS", replace(r1, "if v_activation.status_version <> p_expected_status_version then\n    raise exception using errcode = '40001', message = 'stale_state';\n  end if;\n", "")],
  ["extend unrelated source", replace(r1,
    "update admin_internal.staff_permission_entitlements entitlement\n  set effective_until = v_new_end\n  from admin_internal.staff_break_glass_activation_grants grant_row\n  where grant_row.activation_id = p_activation_id\n    and grant_row.entitlement_id = entitlement.entitlement_id\n    and grant_row.status = 'active' and entitlement.status = 'active';",
    "update admin_internal.staff_permission_entitlements entitlement\n  set effective_until = v_new_end\n  from admin_internal.staff_break_glass_activation_grants grant_row\n  where entitlement.status = 'active';"
  )],
];

const survivors = [];
for (const [name, candidate] of mutants) {
  if (accepts(candidate)) survivors.push(name);
  else console.log(`PASS ${name}`);
}
for (const name of survivors) console.log(`FAIL ${name}`);
console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p3g-r1-mutations",
  mutations: mutants.length,
  killed: mutants.length - survivors.length,
  survivors: survivors.length,
  survivorNames: survivors,
  repositoryFilesWritten: 0,
  databaseUsed: false,
  developmentAccessed: false,
  productionAccessed: false,
}, null, 2));
process.exitCode = survivors.length ? 1 : 0;
