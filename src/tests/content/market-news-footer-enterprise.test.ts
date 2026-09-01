import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("market board carries 30 rows, search-first layout, wide glass surface and governed motion", () => {
  const fa = read("src/app/markets/page.tsx");
  const en = read("src/app/en/markets/page.tsx");
  const table = read("src/components/markets/MarketsTable.tsx");
  const routes = read("src/components/brand/tecpey-scroll-motion-routes.ts");
  assert.match(fa, /const LIMIT = 30/);
  assert.ok(fa.indexOf("<MarketsSearchBar") < fa.indexOf("<MarketsHero"));
  assert.match(en, /getCurrencies\(1, 30/);
  assert.match(table, /max-w-\[1480px\]/);
  assert.match(table, /backdrop-blur-xl/);
  for (const route of ["/markets", "/en/markets", "/crypto-news", "/en/crypto-news"]) assert.ok(routes.includes(`\"${route}\"`));
});

test("news pages read the database archive and never activate RSS ingestion on mount", () => {
  const fa = read("src/app/crypto-news/page.tsx");
  const home = read("src/components/home/TecpeyHomeAI.tsx");
  const api = read("src/app/api/crypto-news/route.ts");
  const timer = read("deploy/systemd/tecpey-news-materialization.timer");
  assert.match(fa, /getNewsArchiveDayFromAuthority/);
  assert.doesNotMatch(fa, /CryptoNewsCenter/);
  assert.match(home, /fetch\(`\/api\/crypto-news/);
  assert.match(api, /getNewsArchiveDayFromAuthority/);
  assert.doesNotMatch(api, /readSource|outboundfeeds|cointelegraph\.com\/rss|decrypt\.co\/feed/);
  assert.match(timer, /OnBootSec=2min/);
  assert.match(timer, /OnUnitActiveSec=10min/);
  assert.match(timer, /Persistent=true/);
});

test("footer is one governed box with four equal groups in both locales and mobile horizontal scroll", () => {
  const footer = read("src/components/footer/Footer.tsx");
  assert.match(footer, /const faGroups/);
  assert.match(footer, /const enGroups/);
  assert.match(footer, /overflow-x-auto/);
  assert.match(footer, /snap-mandatory/);
  assert.match(footer, /xl:grid-cols-4/);
  assert.match(footer, /Collaboration & Support/);
});

test("growth authority includes SEO, AEO, GEO, trend radar, social/web evidence and anti-manipulation", () => {
  const organic = read("src/lib/organic-growth-automation.ts");
  const trend = read("src/lib/growth-trend-intelligence.ts");
  const worker = read("scripts/run-organic-growth-trend-worker.ts");
  assert.match(organic, /seoScore/);
  assert.match(organic, /aeoScore/);
  assert.match(organic, /geoScore/);
  assert.match(organic, /sourceAttributions/);
  assert.match(trend, /manipulationRisk/);
  assert.match(trend, /crossFamilyConfirmed/);
  assert.match(worker, /agentId: \"growth_hacker\"/);
  assert.match(worker, /PERPLEXITY_API_KEY/);
  assert.match(worker, /XAI_API_KEY/);
  assert.match(worker, /citations\.has\(url\)/);
});

test("news SEO preserves historical detail authority and keeps AEO answers visible instead of emitting FAQ schema spam", () => {
  const model = read("src/lib/news-detail-pages.ts");
  const authority = read("src/lib/news-impact-history-authority.ts");
  const faDetail = read("src/app/crypto-news/[slug]/page.tsx");
  const enDetail = read("src/app/en/crypto-news/[slug]/page.tsx");
  assert.match(authority, /getNewsImpactHistoryArchiveItemsFromAuthority/);
  assert.match(authority, /getNewsImpactHistoryItemBySlugFromAuthority/);
  assert.match(model, /getNewsImpactHistoryItemBySlugFromAuthority/);
  assert.match(model, /getNewsImpactHistoryArchiveItemsFromAuthority/);
  assert.match(model, /getNewsDirectAnswerCards/);
  assert.doesNotMatch(model, /"@type": "FAQPage"/);
  assert.match(faDetail, /پاسخ سریع و قابل استناد/);
  assert.match(enDetail, /Direct, citable answers/);
});
