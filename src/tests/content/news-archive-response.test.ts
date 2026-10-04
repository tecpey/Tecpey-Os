import assert from "node:assert/strict";
import test from "node:test";
import { parseNewsArchiveResponse } from "../../components/news/news-archive-response";

const day = "2026-10-04";
const item = { archiveId: "one", sourceName: "Source", articleUrl: "https://example.com/story", publishedAt: `${day}T08:00:00Z`, sourceTitle: "Title", displayTitle: "Title", displayLead: "Lead", displayBody: "Body", thumbnailAlt: "Title", translationStatus: "completed", translationPending: false, publicSummaryAllowed: true, persianEditorialAllowed: true, thumbnailAttributionRequired: false, newsUrl: null, thumbnailUrl: null, taxonomy: { coinSymbols: [], toolSlugs: [], topicTags: [] } };
const response = () => ({ day, today: day, availableDays: [day], archiveItems: [{ ...item }] });

test("accepts a renderable response without rewriting its presentation", () => {
  const value = response();
  const parsed = parseNewsArchiveResponse(value, day);
  assert.equal(parsed?.items, value.archiveItems);
  assert.equal(parsed?.day, day);
});
test("accepts an empty requested day", () => {
  assert.deepEqual(parseNewsArchiveResponse({ ...response(), archiveItems: [] }, day)?.items, []);
});
for (const [name, override] of Object.entries({ timestamp: { publishedAt: "invalid" }, text: { displayLead: null }, taxonomy: { taxonomy: null }, tags: { taxonomy: { coinSymbols: "BTC", toolSlugs: [], topicTags: [] } }, flag: { translationPending: "false" }, link: { newsUrl: {} } })) {
  test(`rejects malformed ${name} before rendering`, () => {
    assert.equal(parseNewsArchiveResponse({ ...response(), archiveItems: [{ ...item, ...override }] }, day), null);
  });
}
test("rejects a partially valid batch instead of silently dropping stories", () => {
  assert.equal(parseNewsArchiveResponse({ ...response(), archiveItems: [item, null] }, day), null);
});
test("rejects duplicate story identities", () => {
  assert.equal(parseNewsArchiveResponse({ ...response(), archiveItems: [item, item] }, day), null);
});
test("rejects mismatched and invalid calendar metadata", () => {
  for (const value of [null, [], { ...response(), day: "2026-10-03" }, { ...response(), today: "2026-02-30" }, { ...response(), availableDays: [day, "2026-02-30"] }, { ...response(), availableDays: [] }]) assert.equal(parseNewsArchiveResponse(value, day), null);
});
test("future publication remains archived evidence, without granting recent eligibility", () => {
  assert.ok(parseNewsArchiveResponse({ ...response(), archiveItems: [{ ...item, publishedAt: "2027-01-01T00:00:00Z" }] }, day));
});
