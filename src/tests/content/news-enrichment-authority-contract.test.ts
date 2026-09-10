import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function read(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("news capture/enrichment authority contract", () => {
  it("keeps capture independent from paid AI and allows 300 items per source", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");
    assert.doesNotMatch(capture, /translateNewsFeedToPersian|callAiProvider|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
    assert.match(capture, /const DEFAULT_CAPTURE_LIMIT_PER_SOURCE = 300/);
    assert.match(capture, /const MAX_CAPTURE_LIMIT_PER_SOURCE = 300/);
    assert.match(
      capture,
      /"NEWS_MATERIALIZATION_LIMIT_PER_SOURCE"[\s\S]*DEFAULT_CAPTURE_LIMIT_PER_SOURCE[\s\S]*MAX_CAPTURE_LIMIT_PER_SOURCE/,
    );
    assert.match(capture, /aiCalls:\s*0/);
  });

  it("does not silently claim zero-loss when feed continuity cannot be proven", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");
    const registry = await read("src/lib/news-source-registry.ts");
    assert.match(capture, /SELECT DISTINCT ON \(source_name\)/);
    assert.match(registry, /replayedCount > 0/);
    assert.match(registry, /continuity_unproven/);
    assert.match(capture, /continuityRiskCount/);
    assert.match(capture, /blockingFailureCount/);
    assert.match(capture, /continuityScope:\s*"required_sources_only"/);
    assert.match(capture, /zeroLossClaim:\s*continuityObserved\s*\?\s*"continuity_observed"\s*:\s*"not_proven"/);
    assert.match(capture, /status:\s*continuityObserved\s*\?\s*"ok"\s*:\s*"degraded"/);
  });

  it("fails closed when enrichment database authority is disabled", async () => {
    const authority = await read("src/lib/ops/news-enrichment-authority.ts");
    assert.match(authority, /if \(!result\.enabled\) throw new Error\("news_enrichment_authority_disabled"\)/);
    assert.match(authority, /if \(!authority\.enabled\) throw new Error\("news_enrichment_authority_disabled"\)/);
  });

  it("serializes paid work and delegates retry decisions to the bounded policy", async () => {
    const authority = await read("src/lib/ops/news-enrichment-authority.ts");
    assert.match(authority, /pg_try_advisory_lock/);
    assert.match(authority, /pg_advisory_unlock/);
    assert.match(authority, /decideNewsEnrichmentRetry/);
    assert.match(authority, /attempt_budget_exhausted/);
    assert.match(authority, /terminal_failure/);
  });

  it("keeps AI disabled unless explicitly enabled and runs enrichment sequentially", async () => {
    const worker = await read("scripts/run-news-enrichment-worker.ts");
    assert.match(worker, /NEWS_AI_ENABLED\?\.trim\(\) === "1"/);
    assert.match(worker, /status: "ai_disabled"/);
    assert.match(worker, /for \(const candidate of candidates\)/);
    assert.match(worker, /NEWS_TRANSLATION_RETRY_MINUTES", 2, 1/);
    assert.match(worker, /NEWS_TRANSLATION_MAX_FAILURES_PER_VERSION", 3, 1, 5/);
    assert.match(worker, /translation_worker_exception/);
    assert.doesNotMatch(worker, /Promise\.all\([^)]*translateNewsFeedToPersian/);
  });

  it("keeps initial provider activation single-model with a deterministic two-call article ceiling", async () => {
    const worker = await read("scripts/run-news-enrichment-worker.ts");
    assert.match(worker, /NEWS_TRANSLATION_FALLBACK_MODEL/);
    assert.match(worker, /news_enrichment_fallback_model_disabled_for_initial_activation/);
    assert.match(worker, /news_enrichment_openrouter_requires_provider_call_ledger/);
    assert.match(worker, /maximumProviderCallsPerRun: limit \* 2/);
  });

  it("requires a durable cost reservation before every news provider network call", async () => {
    const worker = await read("scripts/run-news-enrichment-worker.ts");
    const costAuthority = await read("src/lib/ops/news-ai-cost-authority.ts");
    assert.match(worker, /newsAiCostConfigFromEnv\(\)/);
    assert.match(worker, /createNewsAiCostGovernedFetch\(\{/);
    assert.match(worker, /translateNewsFeedToPersian\([\s\S]*fetchImpl: observedGovernedFetch/);
    assert.match(worker, /providerNetworkCalls \+= 1/);
    assert.match(costAuthority, /platform_news_ai_provider_attempts/);
    assert.match(costAuthority, /status = 'egress_started'/);
    assert.match(costAuthority, /reservation_fallback/);
    assert.match(costAuthority, /x-tecpey-news-ai-authority/);
  });

  it("reconciles expired cross-day spend before the enrichment process can start", async () => {
    const service = await read("deploy/systemd/tecpey-news-enrichment.service.in");
    const reconciliation = await read("scripts/run-news-ai-cost-reconciliation-worker.ts");
    assert.match(
      service,
      /ExecStartPre=@@NPM_BIN@@ exec -- tsx scripts\/run-news-ai-cost-reconciliation-worker\.ts/,
    );
    assert.match(
      service,
      /ExecStartPre=[^\n]+\nExecStart=@@NPM_BIN@@ exec -- tsx scripts\/run-news-enrichment-worker\.ts/,
    );
    assert.match(reconciliation, /SELECT DISTINCT budget_day/);
    assert.match(reconciliation, /status = 'egress_started'/);
    assert.match(reconciliation, /expires_at <= NOW\(\)/);
    assert.match(reconciliation, /reservation_expired_after_egress/);
    assert.match(reconciliation, /cost_source = 'reservation_fallback'/);
    assert.match(reconciliation, /active_reserved_usd_micros = active_reserved_usd_micros - \$2/);
    assert.match(reconciliation, /settled_usd_micros = settled_usd_micros \+ \$2/);
    assert.match(reconciliation, /aiCalls:\s*0/);
    assert.match(reconciliation, /process\.exitCode = 1/);
  });

  it("registers the forward-only 0102 cost ledger in database migration authority", async () => {
    const registry = await read("src/lib/db-migration-registry.ts");
    const newsGrowth = await read("src/lib/db-migrate-news-growth.ts");
    assert.match(registry, /0102_news_ai_cost_authority\.sql/);
    assert.match(registry, /NEWS_ARCHIVE_AND_COST_MIGRATIONS/);
    assert.match(newsGrowth, /runNewsAiCostAuthorityMigrations/);
    assert.match(newsGrowth, /0098 is already present/);
  });

  it("uses separate five-minute capture and two-minute bounded enrichment timers", async () => {
    const captureTimer = await read("deploy/systemd/tecpey-news-capture.timer");
    const enrichmentTimer = await read("deploy/systemd/tecpey-news-enrichment.timer");
    assert.match(captureTimer, /OnUnitActiveSec=5min/);
    assert.match(enrichmentTimer, /OnUnitActiveSec=2min/);
    assert.match(enrichmentTimer, /RandomizedDelaySec=15/);
  });
});
