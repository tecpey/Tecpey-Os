import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSitemapPublication,
  getIndexableSitemapEntries,
  isTraderToolLocaleVisible,
} from "../../services/sitemap-publication-authority";

const base = {
  family: "test",
  path: "/learn/example",
  state: "published" as const,
  canonicalPath: "/learn/example",
  visibleContent: true,
};

test("publication authority excludes non-published states", () => {
  for (const state of ["draft", "needs_review", "archived"] as const) {
    assert.equal(
      decideSitemapPublication({ ...base, state }),
      false,
    );
  }
  assert.equal(decideSitemapPublication(base), true);
});

test("publication authority fails closed on canonical or visible-content gaps", () => {
  assert.equal(
    decideSitemapPublication({ ...base, canonicalPath: "/learn/other" }),
    false,
  );
  assert.equal(
    decideSitemapPublication({ ...base, visibleContent: false }),
    false,
  );
  assert.equal(
    decideSitemapPublication({ ...base, path: "learn/example" }),
    false,
  );
  assert.equal(
    decideSitemapPublication({ ...base, path: "/learn/example?draft=1" }),
    false,
  );
  assert.equal(
    decideSitemapPublication({ ...base, path: "/learn/example#section" }),
    false,
  );
});

test("sitemap entries contain only authoritative records", () => {
  const entries = getIndexableSitemapEntries([
    base,
    { ...base, path: "/learn/draft", canonicalPath: "/learn/draft", state: "draft" },
    { ...base, path: "/learn/hidden", canonicalPath: "/learn/hidden", visibleContent: false },
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.url),
    ["https://tecpey.ir/learn/example"],
  );
});


test("sitemap authority rejects duplicate indexable paths", () => {
  assert.throws(
    () => getIndexableSitemapEntries([base, { ...base }]),
    /Duplicate indexable sitemap path: \/learn\/example/,
  );
});


test("trader-tool sitemap publication requires localized content for each locale", () => {
  const tool = {
    slug: "example-tool",
    name: "Example Tool",
    summaryFa: "توضیح فارسی",
    categoryFa: "دسته",
    summaryEn: "English description",
    categoryEn: "Research",
  };

  assert.equal(isTraderToolLocaleVisible(tool, "fa"), true);
  assert.equal(isTraderToolLocaleVisible(tool, "en"), true);
  assert.equal(
    isTraderToolLocaleVisible({ ...tool, summaryEn: "" }, "en"),
    false,
  );
  assert.equal(
    isTraderToolLocaleVisible({ ...tool, categoryEn: "" }, "en"),
    false,
  );
  assert.equal(
    isTraderToolLocaleVisible({ ...tool, summaryFa: "" }, "fa"),
    false,
  );
});
