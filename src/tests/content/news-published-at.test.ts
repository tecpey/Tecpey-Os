import assert from "node:assert/strict";
import test from "node:test";
import { MAX_NEWS_ARCHIVE_AGE_MS, validNewsPublishedAt } from "../../lib/news-published-at";

const fetchedAt = "2026-09-01T22:40:44.731Z";
const fetchedMs = Date.parse(fetchedAt);

test("accepts publication exactly at fetchedAt", () => {
  assert.equal(validNewsPublishedAt(fetchedAt, fetchedAt), fetchedAt);
});

test("accepts a valid past publication timestamp", () => {
  const publishedAt = new Date(fetchedMs - 60_000).toISOString();
  assert.equal(validNewsPublishedAt(publishedAt, fetchedAt), publishedAt);
});

test("rejects even slightly future-dated publication timestamps", () => {
  const publishedAt = new Date(fetchedMs + 1).toISOString();
  assert.equal(validNewsPublishedAt(publishedAt, fetchedAt), null);
});

test("rejects publication timestamps older than archive retention", () => {
  const publishedAt = new Date(fetchedMs - MAX_NEWS_ARCHIVE_AGE_MS - 1).toISOString();
  assert.equal(validNewsPublishedAt(publishedAt, fetchedAt), null);
});

test("accepts publication timestamp exactly at archive retention boundary", () => {
  const publishedAt = new Date(fetchedMs - MAX_NEWS_ARCHIVE_AGE_MS).toISOString();
  assert.equal(validNewsPublishedAt(publishedAt, fetchedAt), publishedAt);
});

test("rejects malformed timestamps", () => {
  assert.equal(validNewsPublishedAt("not-a-date", fetchedAt), null);
  assert.equal(validNewsPublishedAt(fetchedAt, "not-a-date"), null);
});
