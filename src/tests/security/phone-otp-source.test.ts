import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("phone OTP source contract", () => {
  it("keeps provider verification separate from one-time DB consumption", async () => {
    const authority = await readFile("src/lib/security/phone-otp-authority.ts", "utf8");
    const account = await readFile("src/lib/security/academy-account-authority.ts", "utf8");
    assert.match(authority, /status = 'verifying'/);
    assert.match(authority, /attempt_count = attempt_count \+ 1/);
    assert.match(authority, /status = 'consumed'/);
    assert.match(authority, /FOR UPDATE/);
    assert.match(account, /lockVerifiedPhoneChallengeTx/);
    assert.match(account, /consumeVerifiedPhoneChallengeTx/);
    assert.ok(account.indexOf("lockVerifiedPhoneChallengeTx") < account.indexOf("INSERT INTO academy_auth_accounts"));
    assert.ok(account.indexOf("INSERT INTO academy_auth_accounts") < account.lastIndexOf("consumeVerifiedPhoneChallengeTx"));
  });

  it("requires CSRF, bounded bodies and dual rate limits on OTP issuance", async () => {
    const requestRoute = await readFile("src/app/api/auth/phone-otp/request/route.ts", "utf8");
    const verifyRoute = await readFile("src/app/api/auth/phone-otp/verify/route.ts", "utf8");
    for (const source of [requestRoute, verifyRoute]) {
      assert.match(source, /verifyCsrfOrigin/);
      assert.match(source, /readBoundedJsonRequest/);
      assert.match(source, /rateLimit/);
    }
    assert.match(requestRoute, /phone-otp-request-ip/);
    assert.match(requestRoute, /phone-otp-request-phone/);
  });
});
