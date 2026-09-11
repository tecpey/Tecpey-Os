import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authorityPath = new URL(
  "../../lib/ops/news-enrichment-authority.ts",
  import.meta.url,
);

const workerPath = new URL(
  "../../../scripts/run-news-enrichment-worker.ts",
  import.meta.url,
);

test("paid enrichment selects one richest immutable version per article URL", async () => {
  const source = await readFile(authorityPath, "utf8");

  assert.match(source, /PARTITION BY archive\.article_url/);
  assert.match(source, /WHEN 'article_full' THEN 3/);
  assert.match(source, /WHEN 'feed_full' THEN 2/);
  assert.match(source, /WHEN 'feed_summary' THEN 1/);
  assert.match(source, /archive\.fetched_at DESC/);
  assert.match(source, /archive\.authority_rank = 1/);
});

test("enrichment preserves durable archive source coverage", async () => {
  const authority = await readFile(authorityPath, "utf8");
  const worker = await readFile(workerPath, "utf8");

  assert.match(
    authority,
    /sourceCoverage: "feed_full" \| "feed_summary" \| "article_full" \| null/,
  );
  assert.match(authority, /archive\.source_coverage/);
  assert.match(worker, /candidate\.sourceCoverage/);
  assert.match(
    worker,
    /candidate\.sourceCoverage[\s\S]*\?\?[\s\S]*sourceCoverage\(candidate\.sourceLead, candidate\.sourceBody\)/,
  );
});
