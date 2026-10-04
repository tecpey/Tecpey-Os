import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLandingGrowthRadarFromNewsItems,
} from "../../lib/landing-growth";
import { getNewsImpactHistoryItems } from "../../lib/news-impact-history";

const stripSource = readFileSync(
  new URL("../../components/home/HomeDiscoveryStrip.tsx", import.meta.url),
  "utf8",
);
const radarSource = readFileSync(
  new URL("../../components/home/LandingGrowthRadar.tsx", import.meta.url),
  "utf8",
);

describe("Landing growth freshness presentation authority", () => {
  it("keeps fallback routes available without upgrading degraded evidence to ready", () => {
    const fallback = getNewsImpactHistoryItems("en");
    const radar = getLandingGrowthRadarFromNewsItems(
      "en",
      [],
      {
        sourceAuthority: "news-impact-history:seed-fallback",
        authorityUpdatedAt: null,
        now: "2026-10-04T12:00:00.000Z",
      },
      fallback,
    );

    assert.equal(radar.coins.length, 5);
    assert.equal(radar.evidence.status, "degraded");
    assert.equal(radar.evidence.sourceAuthority, "news-impact-history:seed-fallback");
  });

  it("binds mobile discovery freshness language to evidence readiness, not item count", () => {
    assert.match(
      stripSource,
      /const isEvidenceReady = radar\?\.evidence\?\.status === "ready";/,
    );
    assert.match(
      stripSource,
      /const isPartial = !isEvidenceReady \|\| hasPartialInventory;/,
    );
    assert.match(stripSource, /data-evidence-status=\{radar\?\.evidence\?\.status \?\? "unknown"\}/);
    assert.match(stripSource, /Curated learning routes/);
    assert.match(stripSource, /not as fresh market signals/);
    assert.match(stripSource, /مسیرهای آموزشی منتخب/);
    assert.match(stripSource, /نه به‌عنوان سیگنال یا زمینهٔ تازهٔ بازار/);
  });

  it("makes desktop degraded context explicit and suppresses stale impact headlines", () => {
    assert.match(
      radarSource,
      /const isEvidenceReady = radar\.evidence\.status === "ready";/,
    );
    assert.match(radarSource, /data-evidence-status=\{radar\.evidence\.status\}/);
    assert.match(radarSource, /Curated learning context/);
    assert.match(radarSource, /must not be interpreted as fresh market context or signals/);
    assert.match(radarSource, /زمینهٔ آموزشی منتخب/);
    assert.match(radarSource, /نباید به‌عنوان سیگنال یا زمینهٔ تازهٔ بازار تفسیر شوند/);
    assert.match(
      radarSource,
      /showCurrentEvidence \? coin\.latestNewsTitle : coinCategory\(coin, locale\)/,
    );
    assert.match(radarSource, /showCurrentEvidence=\{isEvidenceReady\}/);
    assert.match(radarSource, /<time dateTime=\{radar\.evidence\.updatedAt\}>/);
  });
});
