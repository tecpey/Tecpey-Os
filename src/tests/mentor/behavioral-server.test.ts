import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBehavioralSnapshot,
  createEmptyBehavioralInputs,
} from "@/lib/behavioral-engine";
import {
  buildBehavioralPrompt,
  deriveTradingDNASignals,
} from "@/lib/behavioral-context-server";

describe("server-fed behavioral intelligence", () => {
  it("computes a deterministic sparse snapshot from explicit inputs", () => {
    const snapshot = computeBehavioralSnapshot(createEmptyBehavioralInputs());

    assert.equal(snapshot.dataQuality, "sparse");
    assert.equal(snapshot.dimensions.length, 12);
    assert.ok(snapshot.overallScore >= 0 && snapshot.overallScore <= 100);
  });

  it("derives Arena discipline signals without browser state", () => {
    const signals = deriveTradingDNASignals([
      {
        risk_percent: "2",
        risk_flag: false,
        entry_reason: "ورود پس از تأیید روند و بررسی کامل ساختار بازار",
        emotion: "آرام",
        risk_plan: "حد ضرر زیر حمایت و خروج در صورت نقض سناریو",
      },
      {
        risk_percent: "8",
        risk_flag: true,
        entry_reason: "از ترس جا ماندن سریع وارد شدم",
        emotion: "FOMO و هیجان",
        risk_plan: "بدون برنامه",
      },
    ]);

    assert.equal(signals.hasData, true);
    assert.equal(signals.totalTrades, 2);
    assert.equal(signals.stopLossRate, 0.5);
    assert.equal(signals.overRiskRate, 0.5);
    assert.equal(signals.impulseRate, 0.5);
  });

  it("builds a compact server prompt without raw private content", () => {
    const inputs = createEmptyBehavioralInputs();
    inputs.completedLessonCount = 3;
    inputs.flashcardReviewed = 4;
    inputs.reflectionCount = 2;
    const prompt = buildBehavioralPrompt(computeBehavioralSnapshot(inputs));

    assert.match(prompt, /behavioral_overall=/);
    assert.match(prompt, /data_quality=rich/);
    assert.ok(prompt.length < 500);
    assert.doesNotMatch(prompt, /بازتاب معتبر|سؤال کاربر|entry_reason/);
  });
});
