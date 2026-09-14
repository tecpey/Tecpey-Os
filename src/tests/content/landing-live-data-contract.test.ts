import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../../components/home/StoryLiveData.tsx", import.meta.url), "utf8");
const newsRoute = readFileSync(new URL("../../app/api/crypto-news/route.ts", import.meta.url), "utf8");

test("landing news consumes the governed thumbnailUrl response contract", () => {
  assert.match(newsRoute, /thumbnailUrl:\s*localizedThumbnailUrl/);
  assert.match(component, /thumbnailUrl\?: string \| null/);
  assert.match(component, /storySafeLink\(item\.thumbnailUrl\)/);
  assert.doesNotMatch(component, /item\.thumbnail\?\.(?:src|alt)/);
  assert.doesNotMatch(component, /fallbackNewsCovers\[index %/);
  assert.match(component, /neutralNewsCover/);
});

test("landing market only labels successful validated rows as live", () => {
  assert.match(component, /query\.isSuccess && !query\.isError && rows\.length > 0 \? "live" : "unavailable"/);
  assert.match(component, /داده در دسترس نیست/);
  assert.match(component, /Data unavailable/);
  assert.match(component, /data-state=\{marketState\}/);
});
