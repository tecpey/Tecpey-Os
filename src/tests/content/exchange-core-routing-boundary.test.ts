import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(path, "utf8");

const faLogin = read("src/app/login/page.tsx");
const faSignin = read("src/app/signin/page.tsx");
const faSignup = read("src/app/signup/page.tsx");
const enSignin = read("src/app/en/signin/page.tsx");
const enSignup = read("src/app/en/signup/page.tsx");
const marketsTable = read("src/components/markets/MarketsTable.tsx");
const marketsRow = read("src/components/markets/MarketsTableRow.tsx");

test("generic Core auth routes resolve to the Academy identity, never exchange execution", () => {
  for (const source of [faLogin, faSignin]) {
    assert.match(source, /redirect\("\/academy\/login"\)/);
  }
  assert.match(faSignup, /redirect\("\/academy\/signup"\)/);
  assert.match(enSignin, /redirect\("\/en\/academy\/login"\)/);
  assert.match(enSignup, /redirect\("\/en\/academy\/signup"\)/);

  for (const source of [faLogin, faSignin, faSignup, enSignin, enSignup]) {
    assert.doesNotMatch(source, /my\.tecpey\.ir/);
    assert.doesNotMatch(source, /https?:\/\//);
  }
});

test("public market rows keep users inside Core research instead of opening exchange execution", () => {
  assert.doesNotMatch(marketsRow, /my\.tecpey\.ir/);
  assert.doesNotMatch(marketsRow, /https:\/\//);
  assert.match(marketsRow, /href=\{href\}/);
  assert.match(marketsTable, /detailsLabel=\{t\("chart"\)\}/);
  assert.doesNotMatch(marketsTable, /tradeLabel=\{t\("trade"\)\}/);
});
