import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerPath = new URL(
  "../../../scripts/run-news-materialization-worker.ts",
  import.meta.url,
);

test("legacy materialization delegates publisher hydration to the shared authority", async () => {
  const source = await readFile(workerPath, "utf8");

  assert.match(
    source,
    /import \{ fetchNewsPublisherEvidence \} from "\.\.\/src\/lib\/news-publisher-evidence"/,
  );
  assert.match(source, /fetchNewsPublisherEvidence\(\{/);

  assert.doesNotMatch(source, /extractNewsArticleEvidence/);
  assert.doesNotMatch(source, /NEWS_ARTICLE_TIMEOUT_MS/);
  assert.doesNotMatch(source, /MAX_NEWS_ARTICLE_BYTES/);
  assert.doesNotMatch(source, /redirect: "error"/);
});
