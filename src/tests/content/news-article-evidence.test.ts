import test from "node:test";
import assert from "node:assert/strict";
import { extractNewsArticleEvidence } from "../../lib/news-article-evidence";

const longText = (label: string, length = 900) =>
  `${label} ` + "Bitcoin market evidence remains factual and attributable. ".repeat(Math.ceil(length / 55));

test("extracts JSON-LD articleBody as highest-priority evidence", () => {
  const articleBody = longText("JSONLD", 1200);
  const html = `
    <html>
      <body>
        <article>
          <p>${longText("ARTICLE", 1000)}</p>
        </article>
        <script type="application/ld+json">
          ${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            articleBody,
          })}
        </script>
      </body>
    </html>
  `;

  const result = extractNewsArticleEvidence(html);

  assert.ok(result);
  assert.equal(result.extractionMethod, "json_ld_article_body");
  assert.match(result.body, /^JSONLD/);
  assert.equal(result.characterCount, result.body.length);
});

test("falls back to paragraphs inside article", () => {
  const html = `
    <html>
      <body>
        <nav>${longText("NAV", 1000)}</nav>
        <article>
          <p>${longText("FIRST", 400)}</p>
          <p>${longText("SECOND", 400)}</p>
        </article>
      </body>
    </html>
  `;

  const result = extractNewsArticleEvidence(html);

  assert.ok(result);
  assert.equal(result.extractionMethod, "article_paragraphs");
  assert.match(result.body, /FIRST/);
  assert.match(result.body, /SECOND/);
  assert.doesNotMatch(result.body, /NAV/);
});

test("rejects insufficient article evidence", () => {
  const html = `
    <html>
      <body>
        <article><p>Short publisher summary only.</p></article>
      </body>
    </html>
  `;

  assert.equal(extractNewsArticleEvidence(html), null);
});

test("removes scripts and styles from extracted body", () => {
  const html = `
    <article>
      <script>${longText("SCRIPT_SECRET", 900)}</script>
      <style>${longText("STYLE_SECRET", 900)}</style>
      <p>${longText("VISIBLE", 900)}</p>
    </article>
  `;

  const result = extractNewsArticleEvidence(html);

  assert.ok(result);
  assert.match(result.body, /VISIBLE/);
  assert.doesNotMatch(result.body, /SCRIPT_SECRET/);
  assert.doesNotMatch(result.body, /STYLE_SECRET/);
});

test("caps extracted evidence at 20,000 characters", () => {
  const html = `
    <article>
      <p>${"A factual publisher sentence with evidence. ".repeat(1000)}</p>
    </article>
  `;

  const result = extractNewsArticleEvidence(html);

  assert.ok(result);
  assert.ok(result.body.length <= 20_000);
  assert.equal(result.characterCount, result.body.length);
});

test("falls back to paragraphs inside main when article container is unavailable", () => {
  const html = `
    <html>
      <body>
        <header>${longText("HEADER", 900)}</header>
        <main>
          <p>${longText("MAIN_FIRST", 450)}</p>
          <p>${longText("MAIN_SECOND", 450)}</p>
        </main>
        <footer>${longText("FOOTER", 900)}</footer>
      </body>
    </html>
  `;

  const result = extractNewsArticleEvidence(html);

  assert.ok(result);
  assert.equal(result.extractionMethod, "main_paragraphs");
  assert.match(result.body, /MAIN_FIRST/);
  assert.match(result.body, /MAIN_SECOND/);
  assert.doesNotMatch(result.body, /HEADER/);
  assert.doesNotMatch(result.body, /FOOTER/);
});
