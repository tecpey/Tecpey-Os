import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { extractGovernedPublishedArchiveIds } from "../../services/news/publication-snapshot-authority";

const FA_ID = "11111111-1111-4111-8111-111111111111";
const EN_ID = "22222222-2222-4222-8222-222222222222";

function decision(input: {
  archiveId?: string;
  locale?: "fa" | "en";
  status?: string;
  intelligenceStatus?: string;
  reasons?: string[];
  signedOff?: boolean;
  canonicalUrl?: string;
  sourceUrl?: string;
} = {}) {
  const locale = input.locale ?? "fa";
  const archiveId = input.archiveId ?? FA_ID;
  return {
    id: `archive-${archiveId}-${locale}`,
    status: input.status ?? "publishable",
    intelligence: {
      status: input.intelligenceStatus ?? "publishable",
      reasons: input.reasons ?? [],
      reviews: [
        { role: "chief_data_officer_ai", signedOff: input.signedOff ?? true },
        { role: "chief_risk_compliance_ai", signedOff: input.signedOff ?? true },
      ],
      sourceCard: {
        canonicalUrl: input.canonicalUrl ?? "https://publisher.example/story",
        sourceUrl: input.sourceUrl ?? "https://publisher.example/story",
      },
    },
  };
}

describe("governed public news feed authority", () => {
  it("accepts only exact-locale decisions that pass both publication and intelligence review", () => {
    const ids = extractGovernedPublishedArchiveIds([
      decision(),
      decision({ archiveId: EN_ID, locale: "en" }),
      decision({ archiveId: "33333333-3333-4333-8333-333333333333", status: "needs_review" }),
      decision({ archiveId: "44444444-4444-4444-8444-444444444444", intelligenceStatus: "human_review" }),
      decision({ archiveId: "55555555-5555-4555-8555-555555555555", reasons: ["near_duplicate_news"] }),
      decision({ archiveId: "66666666-6666-4666-8666-666666666666", signedOff: false }),
      decision({ archiveId: "77777777-7777-4777-8777-777777777777", canonicalUrl: "http://publisher.example/story" }),
    ], "fa");

    assert.deepEqual(ids, [FA_ID]);
  });

  it("parses persisted JSON and deduplicates identical archive evidence", () => {
    const payload = JSON.stringify([
      decision(),
      decision(),
      decision({ archiveId: EN_ID, locale: "en" }),
    ]);

    assert.deepEqual(extractGovernedPublishedArchiveIds(payload, "fa"), [FA_ID]);
    assert.deepEqual(extractGovernedPublishedArchiveIds(payload, "en"), [EN_ID]);
    assert.deepEqual(extractGovernedPublishedArchiveIds("{malformed", "fa"), []);
  });

  it("keeps archive visibility separate while gating every downstream feed consumer", () => {
    const route = readFileSync("src/app/api/crypto-news/route.ts", "utf8");

    assert.match(route, /readGovernedPublicationSnapshotAuthority\(locale\)/);
    assert.match(route, /publicationAuthority\.publishedArchiveIds\.has\(item\.archiveId\.toLowerCase\(\)\)/);
    assert.match(route, /const publishedArchiveItems = selectPublishedNewsForFeed\(governedArchiveItems, now\)/);
    assert.match(route, /buildNewsQuizBankFromFeed\(items\.slice\(0, 40\)/);
    assert.match(route, /automationPreview\(allItems, locale, updatedAt\)/);
    assert.match(route, /archiveItems,/);
    assert.match(route, /publicationGovernanceWithheldCount/);
    assert.match(route, /publicationAuthority: \{/);
  });
});
