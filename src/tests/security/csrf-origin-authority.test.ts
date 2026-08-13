import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { verifyCsrfOrigin } from "../../lib/csrf";

// verifyCsrfOrigin is the only CSRF control on every state-changing route, and
// its answer depends on two ambient environment variables. Pinning both per
// case keeps this contract hermetic: it must hold on a developer laptop, in
// CI and in production alike, and must not silently pass just because the CI
// job happens to export NEXT_PUBLIC_SITE_URL.

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function request(origin?: string): NextRequest {
  return new NextRequest("https://tecpey.ir/api/auth/refresh", {
    method: "POST",
    headers: origin ? { origin } : {},
  });
}

// NODE_ENV is typed read-only, but the helper reads it at call time and the
// whole point of this suite is to pin it per case.
const env = process.env as Record<string, string | undefined>;

function configure(nodeEnv: string | undefined, siteUrl: string | undefined): void {
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  if (siteUrl === undefined) delete env.NEXT_PUBLIC_SITE_URL;
  else env.NEXT_PUBLIC_SITE_URL = siteUrl;
}

beforeEach(() => {
  // Silence the intentional fail-closed error log.
  console.error = () => {};
});

afterEach(() => {
  configure(ORIGINAL_NODE_ENV, ORIGINAL_SITE_URL);
});

describe("CSRF origin authority", () => {
  it("accepts a request with no Origin header", async () => {
    configure("production", "https://tecpey.ir");
    assert.equal(await await verifyCsrfOrigin(request()), true);
  });

  it("accepts the configured site origin", async () => {
    configure("production", "https://tecpey.ir");
    assert.equal(await verifyCsrfOrigin(request("https://tecpey.ir")), true);
  });

  it("tolerates a trailing slash in the configured site URL", async () => {
    configure("production", "https://tecpey.ir/");
    assert.equal(await verifyCsrfOrigin(request("https://tecpey.ir")), true);
  });

  it("rejects a foreign origin", async () => {
    configure("production", "https://tecpey.ir");
    assert.equal(await verifyCsrfOrigin(request("https://attacker.example")), false);
  });

  it("rejects a look-alike subdomain of the configured site", async () => {
    configure("production", "https://tecpey.ir");
    assert.equal(await verifyCsrfOrigin(request("https://tecpey.ir.attacker.example")), false);
  });

  it("allows localhost outside production so local development is not blocked", async () => {
    configure("development", "https://tecpey.ir");
    assert.equal(await verifyCsrfOrigin(request("http://localhost:3000")), true);
    assert.equal(await verifyCsrfOrigin(request("http://127.0.0.1:3000")), true);
  });

  it("does not allow localhost in production", async () => {
    configure("production", "https://tecpey.ir");
    assert.equal(await verifyCsrfOrigin(request("http://localhost:3000")), false);
  });

  it("fails closed on a foreign origin when the site URL is unset, in every environment", async () => {
    for (const nodeEnv of ["production", "development", "test", undefined]) {
      configure(nodeEnv, undefined);
      assert.equal(
        await verifyCsrfOrigin(request("https://attacker.example")),
        false,
        `a missing NEXT_PUBLIC_SITE_URL must never admit a foreign origin (NODE_ENV=${String(nodeEnv)})`,
      );
    }
  });

  it("fails closed when the configured site URL cannot be parsed", async () => {
    configure("production", "not a url");
    assert.equal(await verifyCsrfOrigin(request("https://attacker.example")), false);
  });
});
