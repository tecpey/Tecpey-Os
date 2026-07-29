import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectBodyParser,
  evaluateBodyBoundaryStages,
} from "./api-security-body-boundary.mjs";

function stage(role, source) {
  return {
    role,
    sourcePath: `src/app/api/${role}/route.ts`,
    method: "POST",
    source,
  };
}

describe("delegated request-body boundaries", () => {
  it("detects parsers only from runtime body-consumption calls", () => {
    assert.equal(detectBodyParser(`import { readBoundedJson } from "x";`), null);
    assert.equal(detectBodyParser(`// await req.json();\nreturn new Response();`), null);
    assert.equal(detectBodyParser(`const body = await req.json();`), "json");
    assert.equal(
      detectBodyParser(`const key = parseApiIdempotencyKey(req.headers.get("Idempotency-Key"));`),
      null,
    );
    assert.equal(
      detectBodyParser(`const body = parseRequestBody(raw);`),
      "parseRequestBody",
    );
  });

  it("fails when a local alias parses unbounded before a bounded canonical handler", () => {
    const result = evaluateBodyBoundaryStages([
      stage("local", `const body = await req.json();`),
      stage("delegated", `const body = await readBoundedJson(req, { maxBytes: 4096 });`),
    ]);
    assert.equal(result.expectsBody, true);
    assert.equal(result.bodySizeLimit, false);
    assert.equal(result.bodySizeLimitAuthority, null);
    assert.equal(result.inputParser, "local:json -> delegated:bounded-json-helper");
  });

  it("passes only when every parsing stage is byte bounded", () => {
    const result = evaluateBodyBoundaryStages([
      stage("local", `const body = await readBoundedJson(req, { maxBytes: 4096 });`),
      stage("delegated", `const body = await readBoundedJson(req, { maxBytes: 4096 });`),
    ]);
    assert.equal(result.bodySizeLimit, true);
    assert.equal(
      result.bodySizeLimitAuthority,
      "local:readBoundedJson -> delegated:readBoundedJson",
    );
  });

  it("ignores a pass-through alias that does not consume the body", () => {
    const result = evaluateBodyBoundaryStages([
      stage("local", `return canonicalPost(req);`),
      stage("delegated", `const body = await readBoundedJson(req, { maxBytes: 4096 });`),
    ]);
    assert.equal(result.bodySizeLimit, true);
    assert.equal(result.inputParser, "delegated:bounded-json-helper");
  });

  it("returns no body requirement when no stage consumes the body", () => {
    const result = evaluateBodyBoundaryStages([
      stage("local", `return apiError("read_only", 405);`),
    ]);
    assert.equal(result.expectsBody, false);
    assert.equal(result.inputParser, null);
    assert.deepEqual(result.stages, []);
  });
});
