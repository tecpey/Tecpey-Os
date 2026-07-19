import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  importPrelude,
  methodEvidenceSource,
  routeHandlerSource,
} from "./api-security-source-evidence.mjs";

const multiMethodRoute = `
import { apiOk } from "@/lib/api-validation";
import { readBoundedJson } from "@/lib/request-body";

const shared = true;

export async function GET() {
  return apiOk({ shared });
}

export async function POST(req) {
  const body = await req.json();
  return new Response(JSON.stringify(body));
}

export async function PATCH(req) {
  const body = await readBoundedJson(req, { maxBytes: 1024 });
  return apiOk({ body });
}
`;

describe("method-scoped API source evidence", () => {
  it("extracts imports without unrelated route handlers", () => {
    const prelude = importPrelude(multiMethodRoute);
    assert.match(prelude, /apiOk/);
    assert.doesNotMatch(prelude, /export async function GET/);
  });

  it("isolates one handler from sibling methods", () => {
    const post = routeHandlerSource(multiMethodRoute, "POST");
    assert.match(post ?? "", /req\.json/);
    assert.doesNotMatch(post ?? "", /readBoundedJson/);
    assert.doesNotMatch(post ?? "", /export async function PATCH/);
  });

  it("does not lend a bounded reader call from PATCH to POST", () => {
    const post = methodEvidenceSource(multiMethodRoute, "POST");
    const patch = methodEvidenceSource(multiMethodRoute, "PATCH");
    assert.doesNotMatch(post ?? "", /await readBoundedJson/);
    assert.match(patch ?? "", /await readBoundedJson/);
  });

  it("does not lend an apiOk call from GET to a raw POST response", () => {
    const post = methodEvidenceSource(multiMethodRoute, "POST");
    assert.match(post ?? "", /import \{ apiOk \}/);
    assert.doesNotMatch(post ?? "", /return apiOk/);
    assert.match(post ?? "", /return new Response/);
  });

  it("fails closed when the requested method is absent", () => {
    assert.equal(routeHandlerSource(multiMethodRoute, "DELETE"), null);
    assert.equal(methodEvidenceSource(multiMethodRoute, "DELETE"), null);
  });
});
