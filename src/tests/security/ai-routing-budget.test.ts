import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountedAiProviderRouteCost } from "../../lib/ai/control-plane-store";

describe("AI routing accounted-cost compatibility", () => {
  it("uses cumulative failover cost and fails closed during a rolling deployment", () => {
    assert.equal(
      accountedAiProviderRouteCost({
        result: { attempts: 3 },
        accountedCostUsdMicros: 135_000,
      }),
      135_000,
    );
    assert.equal(
      accountedAiProviderRouteCost({ result: { attempts: 2 } }),
      null,
    );
    assert.equal(
      accountedAiProviderRouteCost({ result: { attempts: 0 } }),
      0,
    );
    assert.equal(
      accountedAiProviderRouteCost({
        result: { attempts: 1 },
        accountedCostUsdMicros: Number.NaN,
      }),
      null,
    );
  });
});
