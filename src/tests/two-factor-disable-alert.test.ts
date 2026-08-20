import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// notifyTwoFactorDisabled ("Two-Factor Authentication Disabled — secure your
// account") existed in the security-notification module but nothing ever raised
// it: turning 2FA off — whether by the account holder or an administrator
// override — produced no alert, exactly the event a hijacker would trigger to
// weaken an account silently. disableTwoFactor is the single authority that
// flips 2FA off, so it must emit the alert. This guards that wiring so it cannot
// silently regress.
test("disabling 2FA raises the security alert", () => {
  const src = readFileSync("src/lib/security/two-factor-authority.ts", "utf8");

  assert.match(src, /import \{ notifyTwoFactorDisabled \} from "@\/lib\/security\/security-notifications"/);
  // Gated on a durable disable outcome, keyed to the acting user, carrying
  // whether an administrator override was used (fire-and-forget so it can never
  // block or fail the security mutation).
  assert.match(
    src,
    /if \(result\.value\.ok && result\.value\.status === "disabled"\) \{\s*notifyTwoFactorDisabled\(input\.userId, \{ adminOverride: input\.adminOverride \}\);\s*\}/,
  );
  // The emit sits after the commit is durable, not inside the transaction: the
  // db_unavailable guard that unwraps the committed result must precede it.
  const emitIdx = src.indexOf('if (result.value.ok && result.value.status === "disabled") {');
  const commitIdx = src.lastIndexOf('if (!result.enabled) throw new Error("db_unavailable");', emitIdx);
  assert.ok(emitIdx > 0 && commitIdx > 0 && emitIdx > commitIdx, "the alert must be emitted after the commit");
});
