import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeChartPayload } from "@/services/swap.services";

describe("market chart transport normalization", () => {
  it("preserves label-price pairs when an intermediate price is invalid", () => {
    assert.deepEqual(
      normalizeChartPayload({
        data: {
          labels: ["10:00", "10:01", "10:02"],
          prices: [1, "-", 3],
        },
      }),
      {
        labels: ["10:00", "10:02"],
        prices: [1, 3],
      },
    );
  });

  it("drops incomplete or malformed pairs instead of shifting timestamps", () => {
    assert.deepEqual(
      normalizeChartPayload({
        data: {
          labels: ["10:00", { unsafe: true }, "10:02"],
          prices: ["1.5", 2],
        },
      }),
      {
        labels: ["10:00"],
        prices: [1.5],
      },
    );
    assert.deepEqual(normalizeChartPayload({ data: { labels: [] } }), {
      labels: [],
      prices: [],
    });
  });
});
