/**
 * Start de volledige demo met één commando:
 *   1. lokale keten (begint op 1 maart 2018)
 *   2. documentopslag
 *   3. contract uitrollen en de casus uit SPEC §10 erop zetten
 *   4. de webapplicatie
 *
 *   npm run demo        (Ctrl+C stopt alles)
 *
 * Elke start begint met een lege keten en lege opslag. Logboeken van keten en
 * opslag staan in .demo/.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

const HARDHAT = "node_modules/hardhat/dist/src/cli.js";
const VITE = "node_modules/vite/bin/vite.js";
const RPC_URL = "http://127.0.0.1:8545";
const STORAGE_URL = "http://localhost:8787";
const APP_URL = "http://localhost:5173";

const children: ChildProcess[] = [];
let stopping = false;

function stopChild(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  // Op Windows stopt kill() alleen het proces zelf, niet wat dat heeft gestart.
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
    console.error(`\n${name} is gestopt (code ${code}).${logFile ? ` Zie ${logFile}.` : ""}`);
    stop(1);
  });
  children.push(child);
}

async function bereikbaar(url: string, init?: RequestInit) {
  try {
    await fetch(url, init);
    return true;
  } catch {
    return false;
  }
}

async function wachtOp(naam: string, url: string, init?: RequestInit) {
  for (let poging = 0; poging < 120; poging++) {
    if (await bereikbaar(url, init)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`${naam} kwam niet op gang.`);
  stop(1);
}

const rpc = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
};

if (await bereikbaar(RPC_URL, rpc)) {
  console.error("Poort 8545 is al in gebruik. Stop eerst de andere keten (of een eerdere demo).");
  process.exit(1);
}
if (await bereikbaar(STORAGE_URL)) {
  console.error("Poort 8787 is al in gebruik. Stop eerst de andere documentopslag.");
  process.exit(1);
}

await Promise.all(
  ["storage/data", "demo/documenten", "app/public/deployment.json"].map((pad) => rm(pad, { recursive: true, force: true })),
);
await mkdir(".demo", { recursive: true });

console.log("1/4  Lokale keten starten…");
start("De keten", [HARDHAT, "node", "--network", "demo"], ".demo/keten.log");
await wachtOp("De keten", RPC_URL, rpc);

console.log("2/4  Documentopslag starten…");
start("De documentopslag", ["--import", "tsx", "storage/server.ts"], ".demo/opslag.log");
await wachtOp("De documentopslag", STORAGE_URL);

console.log("3/4  Contract uitrollen en demodata plaatsen…");
const seed = spawnSync(process.execPath, [HARDHAT, "run", "scripts/demo-data.ts", "--network", "localhost"], {
  stdio: "inherit",
});
if (seed.status !== 0) stop(1);

console.log("4/4  Webapplicatie starten…\n");
start("De webapplicatie", [VITE, "--config", "app/vite.config.ts"]);
await wachtOp("De webapplicatie", APP_URL);

console.log(`
  Demo draait op ${APP_URL}

  Vervals een document:  npm run demo:vervals   (in een tweede terminal)
  Stoppen:               Ctrl+C
`);
