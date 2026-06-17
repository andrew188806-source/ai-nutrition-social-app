import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = path.join(repoRoot, "apps", "mobile");
const extraArgs = process.argv.slice(2);

function quoteCmdArg(value) {
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", ["npx", "expo", "start", ...extraArgs].map(quoteCmdArg).join(" ")]
  : ["expo", "start", ...extraArgs];

const child = spawn(command, args, {
  cwd: mobileRoot,
  env: {
    ...process.env,
    EXPO_NO_DEPENDENCY_VALIDATION: "1"
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
