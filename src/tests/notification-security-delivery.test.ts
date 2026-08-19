import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SECURITY_NOTIFICATION_SOURCE_TYPE,
  securityNotificationCorrelationKey,
} from "../lib/notifications/repository";

test("security notifications get a stable, idempotent inbox correlation identity", () => {
  assert.equal(SECURITY_NOTIFICATION_SOURCE_TYPE, "legacy_security_notification");
  assert.equal(
    securityNotificationCorrelationKey("abc-123"),
    "legacy:security_notifications:abc-123",
  );
  // Deterministic per id — the drain relies on it for its NOT EXISTS / ON CONFLICT
  // idempotency, so the same row can never be delivered twice.
  assert.equal(
    securityNotificationCorrelationKey("abc-123"),
    securityNotificationCorrelationKey("abc-123"),
  );
});

// security_notifications was written by emitSecurityNotification but had no
// reader — security-critical alerts were stranded. The governed inbox drain must
// now also deliver them and mark the source row delivered. This guards that
// wiring so it cannot silently regress.
test("the inbox drain delivers security notifications into the governed inbox", () => {
  const repo = readFileSync("src/lib/notifications/repository.ts", "utf8");

  // The public drain the notifications route calls must fan out to the security drain.
  assert.match(
    repo,
    /inserted \+= await drainSecurityNotificationsForPrincipal\(client, principal\);/,
  );
  // Delivered into the mandatory security class, scoped to the acting account.
  assert.match(repo, /if \(!principal\.accountId\) return 0;/);
  assert.match(repo, /FROM security_notifications AS s/);
  assert.match(repo, /'security_critical'/);
  // The idempotency key and the delivered-flag write both present.
  assert.match(repo, /'legacy:security_notifications:' \|\| s\.id/);
  assert.match(repo, /UPDATE security_notifications SET delivered = TRUE WHERE id = \$1/);
});
