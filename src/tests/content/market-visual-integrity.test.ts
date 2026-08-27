import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";
import { formatMarketPrice } from "@/lib/market-price-format";

describe("public market visual integrity", () => {
  it("preserves Tether when normalizing direct symbols and trading pairs", () => {
    const direct = getCoinVisualAsset({ symbol: "USDT" });
    const pair = getCoinVisualAsset({ symbol: "USDTUSDT" });
    const bitcoinPair = getCoinVisualAsset({ symbol: "BTCUSDT" });

    assert.equal(direct.symbol, "USDT");
    assert.match(direct.src ?? "", /\/tether\.png$/);
    assert.equal(pair.symbol, "USDT");
    assert.match(pair.src ?? "", /\/tether\.png$/);
    assert.equal(bitcoinPair.symbol, "BTC");
  });

  it("keeps meaningful precision for localized fractional market prices", () => {
    assert.equal(formatMarketPrice(80_417.1299, "fa-IR"), "۸۰٬۴۱۷٫۱۳");
    assert.equal(formatMarketPrice(1.47, "fa-IR"), "۱٫۴۷");
    assert.equal(formatMarketPrice(0.337766, "fa-IR"), "۰٫۳۳۷۷۶۶");
    assert.equal(formatMarketPrice(0.0000123456, "en-US"), "0.0000123456");
  });

  it("does not present invalid or non-positive input as a market price", () => {
    assert.equal(formatMarketPrice(null, "fa-IR"), null);
    assert.equal(formatMarketPrice(Number.NaN, "en-US"), null);
    assert.equal(formatMarketPrice(-1, "fa-IR"), null);
  });
});
