import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  assertBrowserCannotDefineOfficialEvidence,
  checkBrowserOfficialEvidencePayload,
} from "../../lib/social-arena-evidence-boundary";
import {
  legacyImportViolations,
  previewChallengeViolations,
} from "../../../scripts/social-arena-evidence-policy.mjs";

describe("Social/Arena official evidence boundary", () => {
  it("accepts descriptive intent while rejecting browser-defined official outcomes", () => {
    assert.deepEqual(
      checkBrowserOfficialEvidencePayload({
        symbol: "BTC",
        side: "buy",
        entryReason: "Structured training decision",
        emotion: "calm",
        plan: "Risk no more than two percent",
      }),
      { ok: true },
    );

    for (const forged of [
      { score: 100 },
      { pnl: 999999 },
      { result: { pnlPct: 88 } },
      { tradeId: "client-trade" },
      { createdAt: "2099-01-01T00:00:00.000Z" },
      { challenge: { completed: true, completedAt: Date.now() } },
      { evidence: [{ id: "browser-id", timestamp: Date.now() }] },
    ]) {
      assert.throws(
        () => assertBrowserCannotDefineOfficialEvidence(forged),
        /browser_official_evidence_forbidden/,
      );
    }
  });

  it("detects seeded legacy imports in protected authority surfaces", () => {
    assert.deepEqual(
      legacyImportViolations(
        "src/lib/mentor-example.ts",
        'import { loadArenaState } from "@/lib/trading-arena";\nexport const x = loadArenaState();',
      ),
      ["src/lib/mentor-example.ts: protected authority imports @/lib/trading-arena"],
    );
    assert.deepEqual(
      legacyImportViolations(
        "src/lib/mentor-example.ts",
        'import { fetchBehavioralSnapshot } from "@/lib/behavioral-client";',
      ),
      [],
    );
  });

  it("detects seeded browser completion logic in the challenge surface", () => {
    const violations = previewChallengeViolations(
      "const arena = loadArenaState(); markChallengeComplete('x', entry.score);",
    );
    assert.ok(violations.some((entry) => entry.includes("loadArenaState")));
    assert.ok(violations.some((entry) => entry.includes("markChallengeComplete")));
    assert.ok(violations.some((entry) => entry.includes("entry.score")));
  });

  it("passes the permanent repository source guard", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/check-social-arena-evidence-boundary.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    );
    assert.match(output, /Social\/Arena evidence boundary passed/);
  });
});
