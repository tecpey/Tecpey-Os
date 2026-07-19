import { readFile } from "node:fs/promises";

const files = {
  page: "src/app/academy/trading-arena/page.tsx",
  client: "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
  journal: "src/components/academy/trading-arena/JournalView.tsx",
  journalPage: "src/app/academy/trading-arena/journal/page.tsx",
  scenariosPage: "src/app/academy/trading-arena/scenarios/page.tsx",
  parser: "src/lib/trading-arena-client.ts",
};

const content = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

const failures = [];
function forbid(target, pattern, reason) {
  if (content[target].includes(pattern)) failures.push(`${files[target]}: ${reason} (${pattern})`);
}
function requireText(target, pattern, reason) {
  if (!content[target].includes(pattern)) failures.push(`${files[target]}: ${reason} (${pattern})`);
}

for (const forbidden of [
  "TradingArenaDashboard",
  "loadArenaState",
  "useSimulatedPrices",
  "executeMarketBuy",
  "addLimitOrder",
  "processPriceTick",
  "resetArenaState",
  "@/lib/trading-journal",
  "localStorage.",
  "Math.random",
]) {
  forbid("page", forbidden, "primary Arena route must not expose browser authority");
  forbid("client", forbidden, "authoritative Arena client must not use legacy execution or persistence");
}

for (const forbidden of ["closedTrades.slice(-5).reverse()", "disabled={busy || !marketPrice}"]) {
  forbid("client", forbidden, "Arena UI must fail closed on unavailable prices and show newest-first history");
}

for (const forbidden of ["@/lib/trading-journal", "loadJournal", "completeJournalEntry", "localStorage."]) {
  forbid("journal", forbidden, "production journal must read server evidence only");
}

for (const forbidden of ["ScenarioPlayer", "@/lib/trading-arena", "localStorage."]) {
  forbid("scenariosPage", forbidden, "legacy scenario execution must stay quarantined from production route");
}

for (const [target, pattern, reason] of [
  ["page", "TradingArenaExecutionClient", "primary Arena page must mount the authoritative client"],
  ["client", "/api/trading-arena/execution", "client must use authoritative execution API"],
  ["client", "expectedRevision", "commands must carry optimistic concurrency revision"],
  ["client", "idempotency-key", "commands must carry idempotency header"],
  ["client", "parseArenaExecutionSnapshot", "all API payloads must pass strict runtime validation"],
  ["client", "resolveArenaCommandIdentity", "ambiguous commands must preserve one idempotency identity"],
  ["client", "pending.action", "polling must retry the unresolved command before any refresh command"],
  ["client", "shouldApplyArenaSnapshot", "stale response protection is required"],
  ["client", "refresh_market", "live orders and protective exits require server refresh commands"],
  ["client", "marketAvailable={snapshot.marketStatus === \"available\"}", "position exits must honor authoritative market availability"],
  ["client", "closedTrades.slice(0, 5)", "recent trades must use the newest-first execution ordering"],

  ["journal", "/api/trading-arena/execution", "journal must read authoritative execution API"],
  ["journal", "parseArenaExecutionSnapshot", "journal payloads must pass strict validation"],
  ["journalPage", "max-w-5xl", "journal needs a responsive production width"],
  ["scenariosPage", "در حال انتقال به موتور معتبر آرنا", "scenario route must disclose the secure migration boundary"],
  ["parser", "validateArenaExecutionStateV2", "client parser must reuse server execution invariants"],
]) requireText(target, pattern, reason);

if (failures.length > 0) {
  console.error("Arena UI authority boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Arena UI authority boundary OK: execution, journal and scenario routes respect server authority.");
