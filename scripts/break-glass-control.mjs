#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Client } from "pg";

const TITLE = "TastKind Break-glass Control";
const ENV_URLS = Object.freeze({
  development: "TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL",
  production: "TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL",
});
const MUTATIONS = new Set(["activate", "extend", "close", "enroll", "revoke"]);
const ERROR_MESSAGES = Object.freeze({
  principal_capacity_reached: "Maximum two active break-glass principals already enrolled.",
  principal_exists: "This Auth user or staff account is already an active break-glass principal.",
  principal_not_found: "The requested break-glass principal was not found.",
  principal_not_active: "This break-glass principal is not active.",
  active_activation_exists: "Close the principal's active break-glass session first.",
  activation_exists: "This principal already has an active break-glass session.",
  activation_not_found: "The requested break-glass activation was not found.",
  activation_not_active: "This break-glass activation is closed.",
  activation_expired: "This break-glass activation has expired; open a new activation.",
  extension_limit_reached: "This activation has reached its maximum allowed duration.",
  root_contract_invalid: "Break-glass security contract changed; activation was refused.",
  break_glass_control_not_authorized: "This connection is not authorized for break-glass control.",
  staff_account_not_effective: "The existing staff account is not active and effective now.",
  target_not_found: "The target Auth user does not exist.",
  stale_state: "The record changed since it was displayed; refresh status and try again.",
  request_conflict: "This request identifier was already used with different inputs.",
  invalid_reason_code: "Reason must be 1–80 lowercase letters, digits, or underscores and start with a letter.",
  request_id_must_be_uuid_v4: "The request identifier must be UUIDv4.",
});

function help() {
  return `${TITLE}

Purpose:
  Database-owner-only emergency bootstrap and recovery. Enrollment grants no authority.
  Activation grants exactly four temporary staff permissions for 30 minutes.
  Each extension adds at most 30 minutes; one activation can never exceed 2 hours.

Usage:
  npm run break-glass -- --env development
  npm run break-glass -- --env production
  npm run break-glass -- --env development --command status
  npm run break-glass -- --help

Required environment variable names:
  TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL
  TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL

Menu:
  1. Status
  2. Activate
  3. Extend +30 minutes
  4. Close activation
  5. Enroll principal
  6. Revoke principal
  7. Recent audit
  8. Exit

Non-interactive commands:
  --command status
  --command audit [--limit 20]
  --command enroll --auth-user-id UUID --reason CODE --yes
  --command activate --principal-id UUID --reason CODE --yes
  --command extend --activation-id UUID --expected-version N --reason CODE --yes
  --command close --activation-id UUID --expected-version N --reason CODE --yes
  --command revoke --principal-id UUID --expected-version N --reason CODE --yes

Safety:
  The URL must use DB-owner postgres credentials. service_role credentials are invalid.
  No URL or password is printed. Production always requires the exact confirmation phrase
  "PRODUCTION BREAK GLASS" (interactive prompt or --confirm-production).
`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const equals = token.indexOf("=");
    if (equals > 2) {
      args[token.slice(2, equals)] = token.slice(equals + 1);
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args[token.slice(2)] = argv[index + 1];
      index += 1;
    } else {
      args[token.slice(2)] = true;
    }
  }
  return args;
}

function safeTarget(connectionString) {
  const parsed = new URL(connectionString);
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw Object.assign(new Error("invalid_database_url"), { code: "invalid_database_url" });
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres";
  return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${database}`;
}

function value(args, name) {
  const found = args[name];
  return found === true || found === undefined ? undefined : String(found);
}

function semanticCode(error) {
  const text = `${error?.message ?? ""} ${error?.code ?? ""}`;
  return Object.keys(ERROR_MESSAGES).find((code) => text.includes(code)) ?? error?.code ?? "unknown_error";
}

function showError(error) {
  const code = semanticCode(error);
  console.error(`Operation refused: ${ERROR_MESSAGES[code] ?? "The database refused the operation safely."}`);
  console.error(`Error code: ${code}`);
}

function formatTime(input) {
  return input ? new Date(input).toISOString() : "—";
}

function showStatus(status) {
  console.log(`\n${status.state}`);
  console.log(`Database time: ${formatTime(status.database_time)}`);
  console.log(`Active principals: ${status.active_principal_count}/${status.maximum_active_principals}`);
  if (!status.principals.length) console.log("No break-glass principals enrolled.");
  for (const principal of status.principals) {
    console.log("\nPrincipal:", principal.principal_id);
    console.log("  Auth user:", principal.auth_user_id);
    console.log("  Staff account:", principal.staff_account_id);
    console.log("  Principal status:", principal.principal_status, `v${principal.principal_status_version}`);
    console.log("  Activation:", principal.activation_id ?? "none");
    console.log("  Activation status:", principal.activation_status);
    if (principal.activation_id) {
      console.log("  Started:", formatTime(principal.effective_from));
      console.log("  Expires:", formatTime(principal.effective_until));
      console.log("  Remaining:", `${principal.remaining_seconds} seconds`);
      console.log("  Maximum continuous end:", formatTime(principal.maximum_continuous_end));
      console.log("  Extension possible:", principal.extension_available ? "yes" : "no");
    }
  }
}

async function ask(rl, prompt, required = true) {
  const answer = (await rl.question(prompt)).trim();
  if (required && !answer) throw Object.assign(new Error("input_required"), { code: "input_required" });
  return answer;
}

async function resolveEnvironment(args, rl) {
  let environment = value(args, "env")?.toLowerCase();
  if (!environment) {
    if (!process.stdin.isTTY) throw Object.assign(new Error("target_environment_required"), { code: "target_environment_required" });
    environment = (await ask(rl, "Environment (development/production): ")).toLowerCase();
  }
  if (!Object.hasOwn(ENV_URLS, environment)) {
    throw Object.assign(new Error("target_environment_invalid"), { code: "target_environment_invalid" });
  }
  return environment;
}

async function confirmMutation({ args, rl, environment, target, operation, subject, reason }) {
  console.log("\nConfirm break-glass mutation");
  console.log("Target environment:", environment);
  console.log("Target database:", target);
  console.log("Operation:", operation);
  console.log("Principal/Activation:", subject);
  console.log("Reason:", reason);
  if (environment === "production") {
    const phrase = value(args, "confirm-production")
      ?? (process.stdin.isTTY ? await ask(rl, "Type PRODUCTION BREAK GLASS to continue: ") : "");
    if (phrase !== "PRODUCTION BREAK GLASS") {
      throw Object.assign(new Error("production_confirmation_required"), { code: "production_confirmation_required" });
    }
    return;
  }
  if (args.yes === true) return;
  const confirmation = process.stdin.isTTY ? await ask(rl, "Type CONFIRM to continue: ") : "";
  if (confirmation !== "CONFIRM") {
    throw Object.assign(new Error("confirmation_required"), { code: "confirmation_required" });
  }
}

async function status(client) {
  return (await client.query("select admin_internal.staff_break_glass_status_v1() as result")).rows[0].result;
}

async function audit(client, limit) {
  return (await client.query(
    "select admin_internal.staff_break_glass_recent_audit_v1($1) as result", [limit])).rows[0].result;
}

async function mutation(client, operation, params) {
  const calls = {
    enroll: ["select admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3) as result", params],
    activate: ["select admin_internal.staff_break_glass_activate_v1($1,$2,$3) as result", params],
    extend: ["select admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4) as result", params],
    close: ["select admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4) as result", params],
    revoke: ["select admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4) as result", params],
  };
  return (await client.query(...calls[operation])).rows[0].result;
}

async function executeCommand({ client, args, rl, environment, target, command }) {
  if (command === "status") {
    showStatus(await status(client));
    return;
  }
  if (command === "audit") {
    const limit = Number(value(args, "limit") ?? 20);
    const rows = await audit(client, limit);
    console.log(rows.length ? JSON.stringify(rows, null, 2) : "No break-glass audit events.");
    return;
  }
  if (!MUTATIONS.has(command)) throw Object.assign(new Error("command_invalid"), { code: "command_invalid" });

  const reason = value(args, "reason") ?? await ask(rl, "Reason code: ");
  const requestId = randomUUID();
  let subject;
  let params;
  if (command === "enroll") {
    subject = value(args, "auth-user-id") ?? await ask(rl, "Auth user UUID: ");
    params = [subject, reason, requestId];
  } else if (command === "activate") {
    subject = value(args, "principal-id") ?? await ask(rl, "Principal UUID: ");
    params = [subject, reason, requestId];
  } else {
    subject = value(args, command === "revoke" ? "principal-id" : "activation-id")
      ?? await ask(rl, command === "revoke" ? "Principal UUID: " : "Activation UUID: ");
    const versionText = value(args, "expected-version") ?? await ask(rl, "Expected status version: ");
    const expectedVersion = Number(versionText);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw Object.assign(new Error("expected_version_invalid"), { code: "expected_version_invalid" });
    }
    params = [subject, expectedVersion, reason, requestId];
  }

  if (command === "extend") {
    const current = await status(client);
    const principal = current.principals.find((item) => item.activation_id === subject);
    if (principal) {
      const oldEnd = new Date(principal.effective_until);
      const maximum = new Date(principal.maximum_continuous_end);
      const proposed = new Date(Math.min(oldEnd.getTime() + 30 * 60 * 1000, maximum.getTime()));
      console.log("\nCurrent expiry:", oldEnd.toISOString());
      console.log("New expiry:", proposed.toISOString());
      console.log("Maximum expiry:", maximum.toISOString());
    }
  }

  await confirmMutation({ args, rl, environment, target, operation: command, subject, reason });
  const result = await mutation(client, command, params);
  console.log("\nOperation applied.");
  console.log(JSON.stringify(result, null, 2));
}

async function menu(context) {
  const items = ["status", "activate", "extend", "close", "enroll", "revoke", "audit", "exit"];
  while (true) {
    console.log(`\n${TITLE}`);
    console.log(`Target: ${context.environment} — ${context.target}`);
    console.log("1. Status\n2. Activate\n3. Extend +30 minutes\n4. Close activation");
    console.log("5. Enroll principal\n6. Revoke principal\n7. Recent audit\n8. Exit");
    const choice = Number(await ask(context.rl, "Choose: "));
    const command = items[choice - 1];
    if (!command) {
      console.error("Choose a number from 1 to 8.");
      continue;
    }
    if (command === "exit") return;
    try {
      await executeCommand({ ...context, args: {}, command });
    } catch (error) {
      showError(error);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help === true) {
  console.log(help());
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
let client;
try {
  const environment = await resolveEnvironment(args, rl);
  const variableName = ENV_URLS[environment];
  const connectionString = process.env[variableName];
  if (!connectionString) throw Object.assign(new Error("database_configuration_missing"), {
    code: "database_configuration_missing",
  });
  const target = safeTarget(connectionString);
  console.log(TITLE);
  console.log("Target environment:", environment);
  console.log("Target database:", target);
  client = new Client({ connectionString, application_name: "tastkind-break-glass-control" });
  await client.connect();
  const command = value(args, "command");
  if (command) {
    await executeCommand({ client, args, rl, environment, target, command: command.toLowerCase() });
  } else {
    if (!process.stdin.isTTY) throw Object.assign(new Error("interactive_terminal_required"), {
      code: "interactive_terminal_required",
    });
    await menu({ client, rl, environment, target });
  }
} catch (error) {
  showError(error);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  rl.close();
}
