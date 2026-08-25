import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("Academy auth client two-factor gate", () => {
  it("does not redirect a password login that still requires TOTP", async () => {
    const source = await readFile(new URL("../../components/academy/AcademyAuthClient.tsx", import.meta.url), "utf8");
    const gate = source.indexOf("if (authData?.requires2fa)");
    const profileProbe = source.indexOf("profileResponse", gate);
    assert.ok(gate > 0, "success response must branch on requires2fa");
    assert.ok(source.indexOf("setTwoFactorToken(authData.preAuthToken)", gate) > gate);
    assert.ok(profileProbe > gate, "profile redirect path must occur after the 2FA branch");
    assert.match(source, /fetch\("\/api\/auth\/2fa\/verify"/);
    assert.match(source, /autocomplete="one-time-code"/i);
  });
});
