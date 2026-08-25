import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("Academy auth client two-factor gate", () => {
  it("does not redirect a password login that still requires TOTP", async () => {
    const source = await readFile(new URL("../../components/academy/AcademyAuthClient.tsx", import.meta.url), "utf8");
    const gate = source.indexOf("if (authData?.requires2fa)");
    const setToken = source.indexOf("setTwoFactorToken(authData.preAuthToken)", gate);
    const gateReturn = source.indexOf("return;", setToken);
    const postPasswordNavigation = source.indexOf(
      "await completeAuthenticatedNavigation();",
      gate,
    );
    assert.ok(gate > 0, "success response must branch on requires2fa");
    assert.ok(setToken > gate);
    assert.ok(gateReturn > setToken);
    assert.ok(
      postPasswordNavigation > gateReturn,
      "post-password navigation must occur only after the 2FA branch returns",
    );
    assert.match(source, /async function completeAuthenticatedNavigation\(\)/);
    assert.match(source, /fetch\("\/api\/academy-student-profile"/);
    assert.match(source, /fetch\("\/api\/auth\/2fa\/verify"/);
    assert.match(source, /autocomplete="one-time-code"/i);
  });
});
