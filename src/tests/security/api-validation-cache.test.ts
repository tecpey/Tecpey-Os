import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_PRIVATE_RESPONSE_HEADERS,
  apiError,
  apiOk,
  apiRateLimited,
} from "@/lib/api-validation";

describe("API response cache authority", () => {
  it("defaults success and error responses to private no-store", () => {
    const success = apiOk({ value: true });
    const failure = apiError("invalid_request", 400);

    for (const response of [success, failure]) {
      assert.match(response.headers.get("cache-control") ?? "", /private/);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      assert.equal(response.headers.get("pragma"), "no-cache");
      assert.equal(response.headers.get("expires"), "0");
    }
  });

  it("keeps the safe defaults on rate-limit responses", () => {
    const response = apiRateLimited(17);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("retry-after"), "17");
  });

  it("allows an explicit reviewed cache policy override", () => {
    const response = apiOk(
      { publicValue: true },
      200,
      { "Cache-Control": "public, max-age=60" },
    );
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.equal(API_PRIVATE_RESPONSE_HEADERS["Cache-Control"].includes("no-store"), true);
  });
});
