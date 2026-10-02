/**
 * Starts the whole demo with one command:
 *   1. local Hardhat chain
 *   2. deploy MaterialPassport, assign roles, place sample data
 *   3. the web application (Vite)
 *
 *   npm run demo        (Ctrl+C stops everything)
 *
 * Every start begins with a fresh chain: nothing is kept between runs.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

const HARDHAT = "node_modules/hardhat/dist/src/cli.js";
const VITE = "node_modules/vite/bin/vite.js";
const RPC_URL = "http://127.0.0.1:8545";
const APP_URL = "http://localhost:5173";

const children: ChildProcess[] = [];
let stopping = false;

function stopChild(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  // On Windows, kill() only stops the process itself, not what it spawned.
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(stopChild);
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

function start(name: string, args: string[], logFile?: string) {
  const log = logFile ? createWriteStream(logFile) : undefined;
  const child = spawn(process.execPath, args, { stdio: log ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (log) {
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
  }
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(`\n${name} has stopped (code ${code}).${logFile ? ` See ${logFile}.` : ""}`);
    stop(1);
  });
  children.push(child);
}

async function isReachable(url: string, init?: RequestInit) {
  try {
    await fetch(url, init);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(name: string, url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await isReachable(url, init)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`${name} did not come up.`);
  stop(1);
}

const rpc = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
};

if (await isReachable(RPC_URL, rpc)) {
  console.error("Port 8545 is already in use. Stop the other chain first (or an earlier demo).");
  process.exit(1);
}

await rm("app/public/deployment.json", { force: true });
await mkdir(".demo", { recursive: true });

console.log("1/3  Starting local chain...");
start("The chain", [HARDHAT, "node"], ".demo/chain.log");
await waitFor("The chain", RPC_URL, rpc);

console.log("2/3  Deploying contract and placing demo data...");
const seed = spawnSync(process.execPath, [HARDHAT, "run", "scripts/demo-data.ts", "--network", "localhost"], {
  stdio: "inherit",
});
if (seed.status !== 0) stop(1);

console.log("3/3  Starting web application...\n");
start("The web application", [VITE, "--config", "app/vite.config.ts"]);
await waitFor("The web application", APP_URL);

console.log(`
  Demo running at ${APP_URL}
  Stop: Ctrl+C
`);
