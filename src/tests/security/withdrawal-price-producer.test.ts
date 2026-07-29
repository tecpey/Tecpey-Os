import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWithdrawalPriceConsensus,
  type WithdrawalProviderQuote,
} from "../../lib/security/withdrawal-price-producer";

const now = Date.now();

function quote(
  provider: WithdrawalProviderQuote["provider"],
  priceUsd: string,
  ageMs = 0,
): WithdrawalProviderQuote {
  return { provider, priceUsd, observedAt: new Date(now - ageMs) };
}

describe("Withdrawal price producer consensus", () => {
  it("requires at least two distinct fresh providers", () => {
    assert.equal(buildWithdrawalPriceConsensus([quote("coinbase", "100")], now), null);
    assert.equal(
      buildWithdrawalPriceConsensus(
        [quote("coinbase", "100"), quote("coinbase", "100.1")],
        now,
      ),
      null,
    );
    assert.equal(
      buildWithdrawalPriceConsensus(
        [quote("coinbase", "100", 61_000), quote("kraken", "100")],
        now,
      ),
      null,
    );
  });

  it("rejects provider disagreement beyond the governed spread", () => {
    assert.equal(
      buildWithdrawalPriceConsensus(
        [quote("coinbase", "100"), quote("kraken", "104")],
        now,
      ),
      null,
    );
  });

  it("produces the median direct-USD price and oldest observation time", () => {
    assert.deepEqual(
      buildWithdrawalPriceConsensus(
        [
          quote("coinbase", "100", 1_000),
          quote("kraken", "100.5", 2_000),
          quote("coingecko", "101", 3_000),
        ],
        now,
      ),
      {
        priceUsd: "100.500000000000000000",
        observedAt: new Date(now - 3_000),
        sources: ["coinbase", "coingecko", "kraken"],
      },
    );
  });
});
