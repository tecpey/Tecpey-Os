import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const capture = readFileSync(
  new URL("../../../scripts/run-news-capture-worker.ts", import.meta.url),
  "utf8",
);

const migration = readFileSync(
  new URL("../../lib/db-migrate-news-full-evidence-capture.ts", import.meta.url),
  "utf8",
);

test("capture preserves feed evidence before appending publisher evidence", () => {
  const feedLoop = capture.indexOf("for (const article of articles)");
  const feedPersist = capture.indexOf(
    "const feedArchive = await persistNewsArchiveItemTx",
    feedLoop,
  );
  const richPersist = capture.indexOf(
    "const richArchive = await persistNewsArchiveItemTx",
    feedPersist,
  );

  assert.ok(feedLoop >= 0, "feed evidence loop must exist");
  assert.ok(feedPersist > feedLoop, "feed archive must be persisted");
  assert.ok(
    richPersist > feedPersist,
    "publisher evidence must append only after feed evidence",
  );

  assert.doesNotMatch(capture, /for \(const article of hydratedArticles\)/);
});

test("failed hydration records state without creating rich evidence", () => {
  const failureBranch = capture.indexOf(
    'if (!hydrated || hydrated.sourceCoverage !== "article_full")',
  );
  const failureState = capture.indexOf(
    "await persistHydrationAttemptTx(client",
    failureBranch,
  );
  const continueAt = capture.indexOf("continue;", failureState);
  const richPersist = capture.indexOf(
    "const richArchive = await persistNewsArchiveItemTx",
    failureBranch,
  );

  assert.ok(failureBranch >= 0);
  assert.ok(failureState > failureBranch);
  assert.ok(continueAt > failureState);
  assert.ok(richPersist > continueAt);
});

test("terminal hydration requires a newly appended rich archive identity", () => {
  assert.match(
    capture,
    /outcome:\s*richArchive\.inserted\s*\?\s*"hydrated"\s*:\s*"identity_collision"/,
  );

  const richPersist = capture.indexOf(
    "const richArchive = await persistNewsArchiveItemTx",
  );
  const terminalState = capture.indexOf(
    'outcome: richArchive.inserted ? "hydrated" : "identity_collision"',
  );

  assert.ok(richPersist >= 0);
  assert.ok(
    terminalState > richPersist,
    "terminal hydration state must follow rich archive persistence",
  );
});

test("hydration retry state is durable and governed by migration 0103", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS platform_news_hydration_state/,
  );
  assert.match(migration, /article_url TEXT PRIMARY KEY/);
  assert.match(migration, /attempt_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /next_retry_at TIMESTAMPTZ/);
  assert.match(migration, /hydrated_at TIMESTAMPTZ/);
  assert.match(migration, /'identity_collision'/);
  assert.match(
    migration,
    /last_outcome = 'hydrated'[\s\S]*hydrated_at IS NOT NULL[\s\S]*next_retry_at IS NULL/,
  );
  assert.match(
    migration,
    /last_outcome IS DISTINCT FROM 'hydrated'[\s\S]*hydrated_at IS NULL/,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS platform_news_hydration_retry_idx/,
  );
});

test("hydration state mutation uses the archive transaction client", () => {
  const helperStart = capture.indexOf(
    "async function persistHydrationAttemptTx(",
  );
  const helperEnd = capture.indexOf(
    "async function main(): Promise<void>",
    helperStart,
  );

  assert.ok(helperStart >= 0 && helperEnd > helperStart);

  const helper = capture.slice(helperStart, helperEnd);
  assert.match(helper, /client:\s*PoolClient/);
  assert.match(helper, /await client\.query/);
  assert.doesNotMatch(helper, /withTx\(/);
});

test("publisher rich versions cannot influence feed continuity counters", () => {
  const richPersist = capture.indexOf(
    "const richArchive = await persistNewsArchiveItemTx",
  );
  const richState = capture.indexOf(
    "await persistHydrationAttemptTx(client",
    richPersist,
  );

  assert.ok(richPersist >= 0);
  assert.ok(richState > richPersist);

  const richSection = capture.slice(richPersist, richState);

  assert.doesNotMatch(
    richSection,
    /result\.(?:insertedCount|replayedCount)\s*\+=/,
  );
  assert.match(
    richSection,
    /hydrationAudit\.richVersionInsertedCount/,
  );
  assert.match(
    richSection,
    /hydrationAudit\.richVersionReplayedCount/,
  );
});

test("committed terminal hydration state cannot be overwritten by a racing capture", () => {
  const helperStart = capture.indexOf(
    "async function persistHydrationAttemptTx(",
  );
  const helperEnd = capture.indexOf(
    "async function main(): Promise<void>",
    helperStart,
  );

  assert.ok(helperStart >= 0 && helperEnd > helperStart);

  const helper = capture.slice(helperStart, helperEnd);

  assert.match(
    helper,
    /WHERE platform_news_hydration_state\.hydrated_at IS NULL/,
  );
  assert.match(
    helper,
    /if \(!persisted\)\s*\{[\s\S]*?return;/,
  );
});


test("hydration audit exposes evidence deferred by the per-run request ceiling", () => {
  assert.match(
    capture,
    /readyCount:\s*hydrationReadyCount/,
  );
  assert.match(
    capture,
    /requestCeilingDeferredCount:\s*Math\.max\([\s\S]*?hydrationReadyCount\s*-\s*hydrationResults\.length/,
  );
});
