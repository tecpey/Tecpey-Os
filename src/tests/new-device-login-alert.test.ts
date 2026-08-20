import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// notifyNewDevice ("New Device Login Detected — secure your account") existed in
// the security-notification module but nothing ever raised it: a login from a
// brand-new or reactivated device produced no alert. admitSessionAuthority is the
// single session-issuance authority and already computes isNewDevice, so it must
// emit the alert. This guards that wiring so it cannot silently regress.
test("session issuance raises the new-device security alert", () => {
  const src = readFileSync("src/lib/security/session-authority.ts", "utf8");

  assert.match(src, /import \{ notifyNewDevice \} from "@\/lib\/security\/security-notifications"/);
  // Gated on the new-device signal, keyed to the acting user, after the session
  // commit (fire-and-forget so it can never block or fail issuance).
  assert.match(
    src,
    /if \(result\.value\.isNewDevice\) \{\s*notifyNewDevice\(input\.userId, \{ ip: input\.ip, userAgent: input\.deviceInfo \}\);\s*\}/,
  );
  // The emit sits after issuance is durable, not inside the transaction.
  const commitIdx = src.indexOf('if (!result.enabled) throw new Error("database_unavailable");');
  const emitIdx = src.indexOf("if (result.value.isNewDevice) {");
  assert.ok(commitIdx > 0 && emitIdx > commitIdx, "the alert must be emitted after the session commit");
});
