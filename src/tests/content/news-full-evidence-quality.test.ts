import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FULL_EVIDENCE_HARD_MIN_RATIO,
  isFullEvidencePersianBodyComplete,
  minimumFullEvidencePersianBodyChars,
} from "../../lib/ai/news-full-evidence-quality";

describe("full publisher evidence completeness authority", () => {
  it("does not constrain genuinely short summary-like evidence", () => {
    assert.equal(minimumFullEvidencePersianBodyChars("A".repeat(900)), 0);
  });

  it("uses a conservative hard floor below the editorial target", () => {
    assert.equal(FULL_EVIDENCE_HARD_MIN_RATIO, 0.45);
    assert.equal(minimumFullEvidencePersianBodyChars("A".repeat(2_000)), 900);
  });

  it("rejects collapsing a full publisher article into a lead-sized digest", () => {
    assert.equal(
      isFullEvidencePersianBodyComplete({
        sourceBody: "A".repeat(4_000),
        translatedBody: "ب".repeat(900),
      }),
      false,
    );
  });

  it("accepts a materially complete Persian rendering without demanding equal character counts", () => {
    assert.equal(
      isFullEvidencePersianBodyComplete({
        sourceBody: "A".repeat(4_000),
        translatedBody: "ب".repeat(2_100),
      }),
      true,
    );
  });
});
