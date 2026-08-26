import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("phone OTP source contract", () => {
  it("keeps local digest verification separate from one-time DB consumption", async () => {
    const authority = await readFile("src/lib/security/phone-otp-authority.ts", "utf8");
    const account = await readFile("src/lib/security/academy-account-authority.ts", "utf8");
    const verifier = await readFile("src/lib/security/phone-otp-code.ts", "utf8");
    const verifyRoute = await readFile("src/app/api/auth/phone-otp/verify/route.ts", "utf8");
    assert.match(authority, /status = 'verifying'/);
    assert.match(authority, /attempt_count = attempt_count \+ 1/);
    assert.match(authority, /otp_code_digest/);
    assert.match(authority, /otp_code_digest = NULL/);
    assert.match(authority, /verifyClaimedPhoneOtpCode/);
    assert.match(verifier, /createHmac/);
    assert.match(verifier, /timingSafeEqual/);
    assert.doesNotMatch(verifyRoute, /checkLimooVerificationCode|checkcode/);
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
    assert.match(verifyRoute, /\^\\d\{6\}\$/);
    const responseContract = requestRoute.slice(requestRoute.lastIndexOf("return apiOk({"));
    assert.doesNotMatch(responseContract, /\bcode\b/);
  });

  it("adds a governed digest column and expires legacy unverifiable challenges", async () => {
    const migration = await readFile("src/lib/db-migrate-phone-otp-local-verifier.ts", "utf8");
    assert.match(migration, /ADD COLUMN IF NOT EXISTS otp_code_digest TEXT/);
    assert.match(migration, /otp_code_digest ~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(migration, /status IN \('prepared', 'sent', 'verifying', 'verified'\)/);
    assert.match(migration, /SET status = 'expired'/);
  });
});
