#!/usr/bin/env node
// In-memory SQL mutants only; repository bytes are never rewritten.
import fs from "node:fs";
const canonical = fs.readFileSync("supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql", "utf8");
function violations(sql) {
  const failed = []; const require = (name, ok) => { if (!ok) failed.push(name); };
  const sendFunction = sql.split("create function social_internal.send_meal_buddy_invite")[1]
    ?.split("create function social_internal.read_meal_buddy_relationship")[0] ?? "";
  const resolveFunction = sql.split("create function social_internal.resolve_meal_buddy_relationship")[1]
    ?.split("comment on function")[0] ?? "";
  require("unordered pair constraint", /user_low_id < user_high_id/.test(sql) && /unique \(user_low_id, user_high_id\)/.test(sql));
  require("self invite rejected", /p_actor_user_id = p_target_user_id/.test(sendFunction));
  require("candidate authorization reused", (sql.match(/may_evaluate_candidate/g) ?? []).length >= 3);
  require("pair lock", /:meal_buddy_relationship:/.test(sql));
  require("participation locks", (sql.match(/:social_participation/g) ?? []).length >= 2);
  require("bidirectional block locks", (sql.match(/:social_block:/g) ?? []).length >= 2);
  require("reverse send does not auto accept", !/set\s+state\s*=\s*'accepted'/i.test(sendFunction));
  require("recipient-only accept", /p_actor_user_id <> v_recipient/.test(sql));
  require("accepted replay remains behind current eligibility", resolveFunction.indexOf("may_evaluate_candidate") > 0 && resolveFunction.indexOf("may_evaluate_candidate") < resolveFunction.indexOf("v_relation.state = 'accepted'"));
  require("recipient-only decline", /p_action = 'decline' and p_actor_user_id = v_recipient/.test(sql));
  require("sender-only cancel", /p_action = 'cancel' and p_actor_user_id = v_relation.invited_by_user_id/.test(sql));
  require("accepted is atomic state transition", /set state = 'accepted'[\s\S]*accepted_at = v_now[\s\S]*resolved_at = v_now/.test(sql));
  require("executor-only functions", /grant execute on function social_internal\.send_meal_buddy_invite\(uuid, uuid\) to social_runtime_executor/.test(sql));
  require("direct clients denied", /revoke all on table public\.meal_buddy_relationships from public, anon, authenticated/.test(sql));
  require("no chat authority", !/create (table|function)[^;]*(chat|conversation|message)/i.test(sql));
  return failed;
}
const mutants = [
  ["drop pair ordering", (s) => s.replace("user_low_id < user_high_id", "user_low_id <> user_high_id")],
  ["drop pair uniqueness", (s) => s.replace("constraint meal_buddy_relationships_pair_unique unique (user_low_id, user_high_id),", "")],
  ["permit self invite", (s) => s.replace("or p_actor_user_id = p_target_user_id", "")],
  ["drop authorization calls", (s) => s.replaceAll("social_internal.may_evaluate_candidate", "social_internal.always_allow")],
  ["rename pair lock", (s) => s.replace(":meal_buddy_relationship:", ":parallel_relation:")],
  ["drop participation locks", (s) => s.replaceAll(":social_participation", ":other")],
  ["drop block locks", (s) => s.replaceAll(":social_block:", ":other:")],
  ["cross send auto accepts", (s) => s.replace("elsif v_relation.state in ('declined', 'cancelled') then", "elsif v_relation.state = 'pending' then update public.meal_buddy_relationships set state = 'accepted' where id = v_relation.id; elsif v_relation.state in ('declined', 'cancelled') then")],
  ["sender may accept", (s) => s.replace("if p_actor_user_id <> v_recipient then return; end if;", "")],
  ["accepted replay bypasses eligibility", (s) => s.replace("    if not social_internal.may_evaluate_candidate(p_actor_user_id, v_counterpart) then\n      raise exception 'RELATIONSHIP_TARGET_UNAVAILABLE' using errcode = '42501';\n    end if;\n    if v_relation.state = 'accepted' then", "    if v_relation.state = 'accepted' then")],
  ["sender may decline", (s) => s.replace("p_actor_user_id = v_recipient", "true")],
  ["recipient may cancel", (s) => s.replace("p_actor_user_id = v_relation.invited_by_user_id", "true")],
  ["accepted timestamp removed", (s) => s.replace("accepted_at = v_now", "accepted_at = null")],
  ["executor grant removed", (s) => s.replace("grant execute on function social_internal.send_meal_buddy_invite(uuid, uuid) to social_runtime_executor;", "")],
  ["authenticated direct table access", (s) => s.replace("revoke all on table public.meal_buddy_relationships from public, anon, authenticated", "grant all on table public.meal_buddy_relationships to authenticated")],
  ["chat table introduced", (s) => s.replace("commit;", "create table public.chat_messages(id uuid);\ncommit;")]
];
const canonicalViolations = violations(canonical);
console.log(`${canonicalViolations.length === 0 ? "PASS" : "FAIL"} canonical`);
const results = [];
for (const [name, mutate] of mutants) { const changed = mutate(canonical); const failed = changed === canonical ? ["not applied"] : violations(changed); const killed = failed.length > 0; results.push({ name, killed, violations: failed }); console.log(`${killed ? "KILLED" : "SURVIVED"} ${name}`); }
const survivors = results.filter((item) => !item.killed);
console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-a-mutations", canonicalPassed: canonicalViolations.length === 0, canonicalViolations, totalMutants: results.length, killed: results.length - survivors.length, survived: survivors.length, survivors, repositoryBytesModified: false }, null, 2));
if (canonicalViolations.length || survivors.length) process.exitCode = 1;
