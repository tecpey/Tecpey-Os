import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSitemapPublication,
  getIndexableSitemapEntries,
} from "../../lib/sitemap-publication-authority";

const base = {
  family: "test",
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
