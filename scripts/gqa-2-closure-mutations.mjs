#!/usr/bin/env node
// GQA-2 in-memory negative mutations. No file is written.
import assert from "node:assert/strict";
import { readGqa2Sources, validateGqa2, behaviourGqa2, FILES, ROOT } from "./gqa-2-closure-rules.mjs";
import fs from "node:fs";
import path from "node:path";

const source = readGqa2Sources();
assert.deepEqual(validateGqa2(source), []);
assert.deepEqual(behaviourGqa2(), []);
const replace = (field, from, to) => (s) => {
  assert.ok(s[field]?.includes(from), `missing mutation anchor in ${field}: ${from}`);
  s[field] = s[field].replace(from, to);
};
const staticMutants = [
  ["A /vip shows fake members", (s) => { s.vip = s.vip.replace("return (", "const members = zhTW.restaurant.vipMembers;\n  return ("); }],
  ["B /verification shows a submitted status", replace("verification", "也沒有任何送審或審核狀態", "目前狀態：已送出，等待平台審核")],
  ["C /vip route removed", (s) => { s.vip = null; }],
  ["D Restaurant nav advertises /vip", (s) => { s.restaurantNav += '\nexport const extra = { href: "/vip", label: "VIP" };'; }],
  ["E deferred notice gains a submit control", replace("notice", "</section>", "<form><button type=\"submit\">送出</button></form></section>")],
  ["F roster read runs for denied callers", replace("staffPage", "if (!canRead) return resolveStaffRosterState", "if (false) return resolveStaffRosterState")],
  ["G denied state shows empty-success copy", replace("staffPage", "此處不會顯示任何人員帳號或數量。", "目前沒有人員帳號。")],
  ["H denied state leaks a count", replace("staffPage", "此處不會顯示任何人員帳號或數量。", "共 {roster.rows.length} 位。")],
  ["I Primary set drops a key", replace("wizard", '  "admin.management.staff.delegation.write",\n', "")],
  ["J confirmation phrase weakened", replace("wizard", "GRANT admin.management.staff.permission.write TO {staffAccountId}", "CONFIRM")],
  ["K self-target submit not blocked", replace("wizard", "disabled={running || ready || selfTargetBlocked}", "disabled={running || ready}")],
  ["L self-target run guard removed", replace("wizard", "if (selfTargetBlocked)", "if (false)")],
  ["M relation guessed from display text", replace("detailPage", "targetAuthUserId: detail?.auth_user_id", "targetAuthUserId: detail?.status")],
  ["N Step-Up card removed", replace("wizard", "<StepUpCard />", "")]
];
for (const [name, mutate] of staticMutants) {
  const candidate = structuredClone(source);
  mutate(candidate);
  const failures = validateGqa2(candidate);
  assert.ok(failures.length > 0, `survived: ${name}`);
  console.log(`KILLED ${name}: ${failures[0]}`);
}
const roster = fs.readFileSync(path.join(ROOT, FILES.rosterState), "utf8");
const target = fs.readFileSync(path.join(ROOT, FILES.wizardTarget), "utf8");
const behaviourMutants = [
  ["O denied state returns rows", { rosterState: roster.replace('if (!input.canRead) return Object.freeze({ state: "permission_denied" as const });', "") }],
  ["P error masquerades as empty", { rosterState: roster.replace('if (input.error) return Object.freeze({ state: "unavailable" as const });', 'if (input.error) return Object.freeze({ state: "authorized_empty" as const });') }],
  ["Q any management key reads roster", { rosterState: roster.replace("permissions.includes(STAFF_ROSTER_READ_PERMISSION)", 'permissions.some((key) => key.startsWith("admin.management"))') }],
  ["R unknown target is treated as self", { wizardTarget: target.replace('return "unknown";\n  }', 'return "self";\n  }') }],
  ["S self-target never blocks", { wizardTarget: target.replace('return relation === "self";', "return false;") }]
];
for (const [name, overrides] of behaviourMutants) {
  const key = Object.keys(overrides)[0];
  assert.notEqual(overrides[key], key === "rosterState" ? roster : target, `mutation anchor missing: ${name}`);
  const failures = behaviourGqa2(overrides);
  assert.ok(failures.length > 0, `survived: ${name}`);
  console.log(`KILLED ${name}: ${failures[0]}`);
}
console.log(`GQA-2 closure mutations PASS: ${staticMutants.length + behaviourMutants.length}/${staticMutants.length + behaviourMutants.length} killed`);
