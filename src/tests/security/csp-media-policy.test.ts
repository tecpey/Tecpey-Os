import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

test("CSP permits same-origin media without widening the external media boundary", async () => {
  const response = await proxy(new NextRequest("https://tecpey.ir/"));
  const csp = response.headers.get("Content-Security-Policy");

  assert.ok(csp, "root response must include CSP");
  const mediaDirective = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("media-src "));

  assert.equal(mediaDirective, "media-src 'self'");
  assert.doesNotMatch(mediaDirective, /(?:https?:|data:|blob:|\*)/);
});
