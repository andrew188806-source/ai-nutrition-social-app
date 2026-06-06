import { spawn } from "node:child_process";
import net from "node:net";

process.noDeprecation = true;

const root = process.cwd();
const apps = [
  { name: "Mobile App", script: "mobile", port: 8081, url: "http://localhost:8081" },
  { name: "Restaurant Dashboard", script: "restaurant", port: 3001, url: "http://localhost:3001" },
  { name: "Admin Dashboard", script: "admin", port: 3002, url: "http://localhost:3002" }
];

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(600);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

function startApp(app) {
  const child = spawn("npm.cmd", ["run", app.script], {
    cwd: root,
    shell: true,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.log(`[demo] Failed to start ${app.name}: ${error.message}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.log(`[demo] ${app.name} exited with code ${code}.`);
    }
  });
}

function openUrl(url) {
  spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process", url], {
    detached: true,
    shell: true,
    stdio: "ignore"
  }).unref();
}

console.log("");
console.log("Starting Haocu investor demo...");
console.log("");

for (const app of apps) {
  const occupied = await isPortOpen(app.port);
  if (occupied) {
    console.log(`[demo] ${app.name} port ${app.port} is already in use. Keeping existing service.`);
  } else {
    console.log(`[demo] Starting ${app.name} on port ${app.port}...`);
    startApp(app);
  }
}

setTimeout(() => {
  console.log("");
  console.log("Demo URLs");
  console.log(`Mobile App:`);
  console.log(`  ${apps[0].url}`);
  console.log("");
  console.log(`Restaurant Dashboard:`);
  console.log(`  ${apps[1].url}`);
  console.log("");
  console.log(`Admin Dashboard:`);
  console.log(`  ${apps[2].url}`);
  console.log("");
  console.log("If Expo shows a QR code, you can scan it with Expo Go when the SDK is compatible.");

  for (const app of apps) {
    openUrl(app.url);
  }
}, 2500);
