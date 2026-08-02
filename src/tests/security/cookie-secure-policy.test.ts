import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { shouldUseSecureCookie } from "../../lib/platform-config";

// Regression guard for the auth-cookie Secure decision (audit fix 1F).
//
// An https deployment must ALWAYS emit Secure auth cookies. The previous logic
// honoured `TECPEY_COOKIE_SECURE=false` before inspecting the site URL, so a
// misconfigured (or hostile) env var could strip Secure from production auth
// cookies and let them travel in cleartext. shouldUseSecureCookie now treats an
// https NEXT_PUBLIC_SITE_URL as the production signal that the env override
// cannot downgrade.

const SITE = "NEXT_PUBLIC_SITE_URL";
const OVERRIDE = "TECPEY_COOKIE_SECURE";

function setEnv(site: string | undefined, override: string | undefined): void {
  if (site === undefined) delete process.env[SITE];
  else process.env[SITE] = site;
  if (override === undefined) delete process.env[OVERRIDE];
  else process.env[OVERRIDE] = override;
}

const originalSite = process.env[SITE];
const originalOverride = process.env[OVERRIDE];

afterEach(() => {
  setEnv(originalSite, originalOverride);
});

describe("shouldUseSecureCookie", () => {
  it("forces Secure on an https deployment even when TECPEY_COOKIE_SECURE=false", () => {
    setEnv("https://app.tecpey.com", "false");
    assert.equal(
      shouldUseSecureCookie(),
      true,
      "an https origin must never be downgraded to a non-Secure cookie by the env override",
    );
  });

  it("keeps Secure on an https deployment with no override", () => {
    setEnv("https://app.tecpey.com", undefined);
    assert.equal(shouldUseSecureCookie(), true);
  });

  it("allows non-Secure for a local http origin", () => {
    setEnv("http://localhost:3000", undefined);
    assert.equal(shouldUseSecureCookie(), false);
    setEnv("http://127.0.0.1:3000", "false");
    assert.equal(shouldUseSecureCookie(), false);
  });

  it("still lets the override force Secure on a non-https origin", () => {
    setEnv("http://localhost:3000", "true");
    assert.equal(shouldUseSecureCookie(), true);
  });

  it("defaults to non-Secure only when nothing indicates a secure origin", () => {
    setEnv(undefined, undefined);
    assert.equal(shouldUseSecureCookie(), false);
  });
});
