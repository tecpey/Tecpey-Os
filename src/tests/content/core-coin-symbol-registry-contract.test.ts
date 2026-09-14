import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CORE_COIN_SYMBOLS } from "@/data/coreCoinSymbols";
import { coreCoinPages } from "@/data/coins";

describe("core coin symbol registry contract", () => {
  it("stays exactly aligned with core coin pages", () => {
    const registry = [...CORE_COIN_SYMBOLS].sort();
    const pages = coreCoinPages.map((coin) => coin.symbol).sort();

    assert.deepEqual(registry, pages);
  });
});
