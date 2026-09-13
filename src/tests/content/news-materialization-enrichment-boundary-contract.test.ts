import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKER_PATH = "scripts/run-news-materialization-worker.ts";

test("news materialization consumes governed translations without invoking translation providers", async () => {
  const source = await readFile(WORKER_PATH, "utf8");

  assert.match(source, /\bbuildReusedPersianNewsTranslation\b/);
  assert.match(source, /translation_pending_enrichment/);

  assert.doesNotMatch(source, /\btranslateNewsFeedToPersian\b/);
  assert.doesNotMatch(source, /\bresolveReusableOrFreshPersianNewsTranslation\b/);
  assert.doesNotMatch(source, /\bpersistNewsArchiveTranslationTx\b/);
});

test("news materialization keeps translation generation owned by enrichment", async () => {
  const source = await readFile(WORKER_PATH, "utf8");

  assert.doesNotMatch(source, /\bfresh\s*:\s*\(\)\s*=>/);
  assert.doesNotMatch(source, /OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY/);
});
