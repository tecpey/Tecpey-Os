import assert from "node:assert/strict";
import { describe, it } from "node:test";
import rawTools from "@/data/traderTools.json";
import { toolGrowthCandidates, type ToolGrowthCandidate } from "@/data/toolGrowthCandidates";
import {
  materializeToolGrowthSnapshot,
  scoreToolGrowthCandidate,
  slugifyToolName,
  type TraderToolRecord,
} from "@/lib/tool-growth-automation";

const coreTools = rawTools as TraderToolRecord[];

describe("tool growth automation", () => {
  it("materializes educational tool pages without enabling external integrations", () => {
    const snapshot = materializeToolGrowthSnapshot(toolGrowthCandidates, {
      generatedAt: "2026-08-10T00:00:00.000Z",
      existingSlugs: coreTools.map((tool) => slugifyToolName(tool.name)),
      existingDomains: coreTools.map((tool) => tool.domain),
    });

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.stats.externalEnabled, 0);
    assert.ok(snapshot.stats.publishedContent >= 24);
    assert.ok(snapshot.tools.every((tool) => tool.automation.status === "published_content"));
    assert.ok(snapshot.tools.every((tool) => tool.automation.publishCapability === "educational_directory"));
    assert.ok(snapshot.tools.every((tool) => tool.automation.externalCapability === "manual_review_required"));
    assert.ok(snapshot.tools.every((tool) => tool.site.startsWith("https://")));
    assert.ok(snapshot.tools.every((tool) => tool.organicGrowth?.fa.policyVersion === "tecpey-organic-growth-policy-v1"));
    assert.ok(snapshot.tools.every((tool) => tool.organicGrowth?.en.policyVersion === "tecpey-organic-growth-policy-v1"));
    assert.ok(snapshot.tools.every((tool) => tool.organicGrowth?.fa.canonicalPath === `/trading-tools/${slugifyToolName(tool.name)}`));
    assert.ok(snapshot.tools.every((tool) => tool.organicGrowth?.en.canonicalPath === `/en/trading-tools/${slugifyToolName(tool.name)}`));
  });

  it("scores high-trust research and security tools above the publication threshold", () => {
    const l2beat = toolGrowthCandidates.find((tool) => tool.name === "L2Beat");
    const tokenSniffer = toolGrowthCandidates.find((tool) => tool.name === "Token Sniffer");

    assert.ok(l2beat);
    assert.ok(tokenSniffer);
    assert.ok(scoreToolGrowthCandidate(l2beat) >= 0.5);
    assert.ok(scoreToolGrowthCandidate(tokenSniffer) >= 0.5);
  });

  it("rejects duplicates against manually curated tools", () => {
    const duplicate: ToolGrowthCandidate = {
      ...toolGrowthCandidates[0],
      name: "TradingView",
      domain: "tradingview.com",
      site: "https://www.tradingview.com",
    };
    const snapshot = materializeToolGrowthSnapshot([duplicate], {
      generatedAt: "2026-08-10T00:00:00.000Z",
      existingSlugs: coreTools.map((tool) => slugifyToolName(tool.name)),
      existingDomains: coreTools.map((tool) => tool.domain),
    });

    assert.equal(snapshot.stats.publishedContent, 0);
    assert.equal(snapshot.rejected[0]?.reason, "already_curated");
  });

  it("keeps trade-execution tools behind manual review", () => {
    const executionTool: ToolGrowthCandidate = {
      ...toolGrowthCandidates[0],
      name: "Execution Bot Example",
      domain: "execution.example",
      site: "https://execution.example",
      integrationRisk: "trade_execution",
      trendSignal: 1,
      learningRelevance: 1,
      sourceTrust: 1,
    };
    const snapshot = materializeToolGrowthSnapshot([executionTool], {
      generatedAt: "2026-08-10T00:00:00.000Z",
    });

    assert.equal(snapshot.stats.publishedContent, 0);
    assert.equal(snapshot.rejected[0]?.reason, "trade_execution_tool_requires_manual_review");
  });

  it("binds automated outbound links to the declared official domain", () => {
    const base: ToolGrowthCandidate = {
      ...toolGrowthCandidates[0],
      name: "Official Link Integrity Example",
      domain: "trusted.example",
      integrationRisk: "none",
    };

    const valid = materializeToolGrowthSnapshot(
      [{ ...base, site: "https://research.trusted.example/path" }],
      { generatedAt: "2026-08-21T00:00:00.000Z", publishThreshold: 0 },
    );
    assert.equal(valid.stats.publishedContent, 1);
    assert.equal(valid.rejected.length, 0);

    for (const site of [
      "https://trusted.example.evil.test/phish",
      "https://trusted.example@evil.test/phish",
      "http://trusted.example/insecure",
      "https://",
    ]) {
      const snapshot = materializeToolGrowthSnapshot([{ ...base, site }], {
        generatedAt: "2026-08-21T00:00:00.000Z",
        publishThreshold: 0,
      });

      assert.equal(snapshot.stats.publishedContent, 0, site);
      assert.equal(snapshot.rejected[0]?.reason, "official_source_domain_mismatch", site);
    }
  });
});
