import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// TecPey ships dark-mode-first: next-themes runs with attribute="class" and
// defaultTheme="dark", and Tailwind's dark: variant is wired to that class
// (@custom-variant dark (&:is(.dark *))). So a card that styles only its light
// surface (bg-white, text-slate-950) with no dark: counterpart renders as a
// stark light block in the default dark theme. The Farsi and English editions of
// a content page must therefore carry the SAME dark: treatment, or one locale
// looks broken in the default theme while the other adapts. This suite pins that
// parity for the bilingual page pairs so the two editions cannot drift apart.

const BILINGUAL_PAIRS: Array<{ fa: string; en: string }> = [
  { fa: "src/app/academy/free/page.tsx", en: "src/app/en/academy/free/page.tsx" },
];

function darkVariants(file: string): string[] {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  return [...new Set([...text.matchAll(/dark:[^\s"'`]+/g)].map((m) => m[0]))].sort();
}

describe("bilingual content pages keep matching dark-mode treatment", () => {
  for (const pair of BILINGUAL_PAIRS) {
    it(`${pair.en} uses the same dark: variants as ${pair.fa}`, () => {
      const fa = darkVariants(pair.fa);
      const en = darkVariants(pair.en);
      // Guard against a vacuous pass if both pages ever drop dark: entirely.
      assert.ok(fa.length > 0, `${pair.fa} has no dark: variants — expected dark-mode-aware cards`);
      assert.deepEqual(
        en,
        fa,
        `dark-mode treatment drifted between locales:\n  only in fa: ${fa.filter((v) => !en.includes(v)).join(", ") || "—"}\n  only in en: ${en.filter((v) => !fa.includes(v)).join(", ") || "—"}`,
      );
    });
  }
});
