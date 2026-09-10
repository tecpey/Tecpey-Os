import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function read(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("crypto page prefetch and navigation authority", () => {
  it("binds server-prefetched data to the exact normalized route symbol", async () => {
    const page = await read("src/app/crypto/[symbol]/page.tsx");
    assert.match(page, /normalizeMarketSymbol\(rawSymbol\)/);
    assert.match(page, /result\?\.data\?\.find/);
    assert.match(page, /normalizeMarketSymbol\(coin\.symbol\) === symbol/);
    assert.doesNotMatch(page, /return result\?\.data\?\.\[0\]/);
  });

  it("clears the server timeout when the upstream request wins the race", async () => {
    const page = await read("src/app/crypto/[symbol]/page.tsx");
    assert.match(page, /timeoutId = setTimeout/);
    assert.match(page, /finally/);
    assert.match(page, /clearTimeout\(timeoutId\)/);
  });

  it("uses stable locale-independent section identifiers", async () => {
    const client = await read("src/app/crypto/[symbol]/CryptoPageClient.tsx");
    const tabs = await read("src/components/crypto/MarketTabs.tsx");
    assert.match(client, /useState<MarketTabId>\("market-chart"\)/);
    assert.match(client, /"about-coin": historyRef/);
    assert.match(client, /\{ id: "other-coins", label: t\("otherCoins"\) \}/);
    assert.doesNotMatch(client, /const \[active, setActive\] = useState\("Market Chart"\)/);
    assert.doesNotMatch(tabs, /document\.getElementById/);
    assert.match(tabs, /onClick=\{\(\) => onSelect\(tab\.id\)\}/);
  });
});
