import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFetchError } from "../../lib/fetch-error-classification";
import { resolveOptionalProfile } from "../../services/optional-profile";

type Profile = { id: number; name: string };

describe("optional root-layout profile lookup", () => {
  it("returns profile data from a healthy upstream", async () => {
    const result = await resolveOptionalProfile<Profile>(async () =>
      Response.json({ data: { id: 7, name: "TecPey learner" } }),
    );

    assert.deepEqual(result, {
      data: { id: 7, name: "TecPey learner" },
      failure: null,
    });
  });

  it("degrades an unreachable optional API to an anonymous navbar", async () => {
    const dnsCause = Object.assign(
      new Error("getaddrinfo ENOTFOUND api.tecpey.invalid"),
      { code: "ENOTFOUND" },
    );
    const rawFetchError = new TypeError("fetch failed", { cause: dnsCause });
    const classified = classifyFetchError(rawFetchError);

    const result = await resolveOptionalProfile<Profile>(async () => {
      throw classified;
    });

    assert.equal(classified.type, "NO_CONNECTION");
    assert.deepEqual(result, {
      data: null,
      failure: { kind: "api_error", errorType: "NO_CONNECTION" },
    });
  });

  it("degrades non-success and malformed upstream responses", async () => {
    const unavailable = await resolveOptionalProfile<Profile>(async () =>
      new Response(null, { status: 503 }),
    );
    const malformed = await resolveOptionalProfile<Profile>(async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    assert.deepEqual(unavailable, {
      data: null,
      failure: { kind: "http_error", status: 503 },
    });
    assert.deepEqual(malformed, {
      data: null,
      failure: { kind: "invalid_payload" },
    });
  });

  it("does not hide UNKNOWN API or framework-controlled exceptions", async () => {
    const unknownApiError = classifyFetchError(
      new Error("unexpected programming failure"),
    );
    const unexpected = new Error("unexpected programming failure");

    assert.equal(unknownApiError.type, "UNKNOWN");
    await assert.rejects(
      resolveOptionalProfile<Profile>(async () => {
        throw unknownApiError;
      }),
      (error: unknown) => error === unknownApiError,
    );
    await assert.rejects(
      resolveOptionalProfile<Profile>(async () => {
        throw unexpected;
      }),
      (error: unknown) => error === unexpected,
    );
  });
});
