import { readFile } from "node:fs/promises";

const files = {
  page: "src/app/academy/trading-arena/page.tsx",
  client: "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
  journal: "src/components/academy/trading-arena/JournalView.tsx",
  journalPage: "src/app/academy/trading-arena/journal/page.tsx",
  scenariosPage: "src/app/academy/trading-arena/scenarios/page.tsx",
  parser: "src/lib/trading-arena-client.ts",
  reflectionClient: "src/lib/trading-arena-reflection-client.ts",
  reflectionDomain: "src/lib/trading-arena-reflections.ts",
  reflectionRoute: "src/app/api/trading-arena/reflections/route.ts",
  migrations: "src/lib/db-migrate-user-state.ts",
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

for (const forbidden of [
  "@/lib/trading-journal",
  "loadJournal",
  "completeJournalEntry",
  "localStorage.",
  "sessionStorage.",
  "indexedDB",
]) {
  forbid("journal", forbidden, "production journal must use server-owned reflection authority only");
  forbid("reflectionClient", forbidden, "reflection client contract must not persist browser authority");
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
  ["journal", "/api/trading-arena/reflections", "journal must use authoritative reflection API"],
  ["journal", "parseArenaExecutionSnapshot", "journal execution payloads must pass strict validation"],
  ["journal", "parseArenaReflectionList", "reflection lists must pass runtime validation"],
  ["journal", "parseArenaReflectionMutation", "reflection writes and conflicts must pass runtime validation"],
  ["journal", "resolveArenaReflectionIdentity", "ambiguous reflection writes must preserve one identity"],
  ["journal", "shouldApplyArenaReflectionMutation", "reflection mutation responses must be monotonic"],
  ["journal", "reflectionMutationSequenceRef", "each trade requires ordered mutation response tracking"],
  ["journal", "incoming.revision >= current.revision", "reflection list refreshes must not roll back projected revisions"],
  ["journal", "\"Idempotency-Key\"", "reflection writes must carry an idempotency header"],
  ["journal", "expectedRevision", "reflection writes must carry optimistic revision"],
  ["journalPage", "max-w-5xl", "journal needs a responsive production width"],
  ["scenariosPage", "در حال انتقال به موتور معتبر آرنا", "scenario route must disclose the secure migration boundary"],
  ["parser", "validateArenaExecutionStateV2", "client parser must reuse server execution invariants"],

  ["reflectionRoute", "getCanonicalSession", "reflection API must use canonical Academy auth"],
  ["reflectionRoute", "strictRevocation: true", "reflection writes require strict session revocation"],
  ["reflectionRoute", "validateArenaExecutionStateV2", "closed-trade evidence must come from validated Execution V2 state"],
  ["reflectionRoute", "pg_advisory_xact_lock", "reflection commands require transaction-scoped serialization"],
  ["reflectionRoute", "academy_trading_arena_reflection_commands", "reflection writes require immutable command replay evidence"],
  ["reflectionRoute", "if (trade && !reflectionEvidenceMatchesTrade(reflection, trade))", "archived reflections must survive live trade pruning while present trades stay reconciled"],
  ["reflectionRoute", "academy_student_events", "committed reflection writes must append student evidence"],
  ["reflectionRoute", "recordLearningEvent", "committed reflection writes must append learning evidence"],
  ["reflectionRoute", "scheduleMentorProfileUpdate", "Mentor refresh must use the governed dispatcher"],
  ["reflectionRoute", "reflectionEvidenceMatchesTrade", "persisted evidence must be reconciled with the server trade"],
  ["reflectionDomain", "createArenaReflectionRequestHash", "normalized reflection requests require canonical SHA-256 hashing"],
  ["reflectionDomain", "ARENA_REFLECTION_MISTAKE_TAGS", "reflection tags require a controlled server enum"],
  ["reflectionClient", "resolveArenaReflectionIdentity", "client reflection retry rules require a pure identity helper"],
  ["reflectionClient", "shouldApplyArenaReflectionMutation", "client must reject stale and out-of-order reflection results"],
  ["reflectionClient", "input.incoming.revision >= input.current.revision", "client projection must never lower the authoritative revision"],
  ["migrations", "0022_trading_arena_reflections.sql", "authoritative reflection schema must be registered after 0021"],
  ["migrations", "FOREIGN KEY (attempt_id, student_id)", "database schema must enforce attempt ownership"],
]) requireText(target, pattern, reason);

const replayLookup = content.reflectionRoute.indexOf("const command = await client.query<ReflectionCommandRow>");
const liveAttemptLookup = content.reflectionRoute.indexOf(
  "const attempt = await loadOwnedAttempt(client, studentId, input.attemptId, true)",
);
if (replayLookup < 0 || liveAttemptLookup < 0 || replayLookup >= liveAttemptLookup) {
  failures.push(`${files.reflectionRoute}: immutable command replay must occur before prunable live trade lookup`);
}

for (const forbidden of [
  "evidenceAsset: input",
  "evidenceRealizedPnl: input",
  "evidenceClosureReason: input",
]) {
  forbid("reflectionRoute", forbidden, "clients must never provide immutable trade evidence");
}

if (failures.length > 0) {
  console.error("Arena UI authority boundary failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Arena UI authority boundary OK: execution, journal reflections and scenario routes respect server authority, immutable replay and monotonic client projection.");
