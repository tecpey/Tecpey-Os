import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "src/app/academy/trading-arena/page.tsx"), "utf8");
const client = await readFile(path.join(root, "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx"), "utf8");
const failures = [];

for (const forbidden of ["TradingArenaDashboard", "loadArenaState", "useSimulatedPrices", "processPriceTick", "resetArenaState"]) {
  if (page.includes(forbidden) || client.includes(forbidden)) failures.push(`legacy Arena execution remains in primary UI: ${forbidden}`);
}

for (const required of [
  "/api/trading-arena/execution",
  "expectedRevision",
  "Idempotency-Key",
  "revision_conflict",
  "crypto.randomUUID",
]) {
  if (!client.includes(required)) failures.push(`authoritative Arena UI contract missing: ${required}`);
}

if (!page.includes("TradingArenaExecutionClient")) failures.push("primary Arena page is not mounted on authoritative execution client");
if (!client.includes('credentials: "include"') || !client.includes('cache: "no-store"')) failures.push("Arena execution requests must use authenticated no-store transport");

if (failures.length > 0) {
  console.error("Arena UI authority boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Arena UI authority boundary OK: primary UI uses revisioned, idempotent server execution.");
