import assert from "node:assert/strict";
import test from "node:test";
import { isRecentNewsPublication, NEWS_RECENT_PUBLICATION_WINDOW_MS, selectPublishedNewsForFeed } from "../../lib/news-feed-publication-policy";

const now = Date.parse("2026-10-03T18:00:00.000Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const story = (id: string, publishedAt: string, overrides = {}) => ({
  archiveId: id, articleUrl: `https://publisher.example/${id}`, publishedAt,
  fetchedAt: iso(0), eventAt: iso(0), modifiedAt: iso(0), ...overrides,
});

test("publication wins over conflicting ingestion, modification and event times without mutating evidence", () => {
  const older = story("older", iso(-120_000));
  const newer = story("newer", iso(-60_000), { fetchedAt: iso(-30_000), eventAt: iso(-86_400_000), modifiedAt: iso(-30_000) });
  const input = Object.freeze([Object.freeze(older), Object.freeze(newer)]);
  const result = selectPublishedNewsForFeed(input, now);
  assert.deepEqual(result.map((item) => item.archiveId), ["newer", "older"]);
  assert.equal(result[0], newer);
  assert.deepEqual(input.map((item) => item.archiveId), ["older", "newer"]);
  assert.equal(isRecentNewsPublication(iso(-NEWS_RECENT_PUBLICATION_WINDOW_MS - 1), now), false);
});

test("same-day future and invalid publications cannot enter feed or receive a recent badge", () => {
  const items = [story("future", iso(1)), story("invalid", "not-a-date"), story("valid", iso(0))];
  assert.deepEqual(selectPublishedNewsForFeed(items, now).map((item) => item.archiveId), ["valid"]);
  assert.equal(items.length, 3); // Presentation/evidence retention is independent.
  assert.equal(isRecentNewsPublication(iso(1), now), false);
  assert.equal(isRecentNewsPublication("not-a-date", now), false);
  assert.deepEqual(selectPublishedNewsForFeed(items, NaN), []);
  assert.equal(isRecentNewsPublication(iso(0), NaN), false);
});

test("recent publication includes both exact boundaries and excludes one millisecond beyond", () => {
  assert.equal(isRecentNewsPublication(iso(0), now), true);
  assert.equal(isRecentNewsPublication(iso(-NEWS_RECENT_PUBLICATION_WINDOW_MS), now), true);
  assert.equal(isRecentNewsPublication(iso(-NEWS_RECENT_PUBLICATION_WINDOW_MS - 1), now), false);
});

test("equal publication times use stable URL then archive identity regardless of arrival order", () => {
  const items = [story("z", iso(-1)), story("b", iso(-1), { articleUrl: "https://publisher.example/a" }), story("a", iso(-1))];
  for (const order of [items, [...items].reverse(), [items[1], items[0], items[2]]]) {
    assert.deepEqual(selectPublishedNewsForFeed(order, now).map((item) => item.archiveId), ["a", "b", "z"]);
  }
});

test("equivalent timezone instants tie by identity and historic stories remain eligible without a recent badge", () => {
  const historic = story("historic", "2024-01-01T00:00:00.000Z");
  const a = story("a", "2026-10-03T21:29:59+03:30");
  const b = story("b", "2026-10-03T17:59:59.000Z");
  assert.deepEqual(selectPublishedNewsForFeed([historic, b, a], now).map((item) => item.archiveId), ["a", "b", "historic"]);
  assert.equal(isRecentNewsPublication(historic.publishedAt, now), false);
});
