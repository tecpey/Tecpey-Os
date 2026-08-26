import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const route = readFileSync(resolve(root, "src/app/api/command-center/communications/route.ts"), "utf8");
const store = readFileSync(resolve(root, "src/lib/communication-provider-store.ts"), "utf8");
const migration = readFileSync(resolve(root, "src/lib/db-migrate-communication-provider-config.ts"), "utf8");
const client = readFileSync(resolve(root, "src/components/admin/CommunicationProviderControlPanel.tsx"), "utf8");
const operations = readFileSync(resolve(root, "src/components/admin/LimooOperationsPanel.tsx"), "utf8");
const page = readFileSync(resolve(root, "src/app/command-center/communications/page.tsx"), "utf8");
const email = readFileSync(resolve(root, "src/lib/email.ts"), "utf8");
const sms = readFileSync(resolve(root, "src/lib/security/limoo-sms.ts"), "utf8");
const health = readFileSync(resolve(root, "src/app/api/health/route.ts"), "utf8");

describe("communication provider admin boundary", () => {
  it("requires admin authorization, recent step-up, CSRF and bounded bodies", () => {
    assert.match(route, /verifyCsrfOrigin\(request\)/);
    assert.match(route, /authorizeAdminRequest\(request, "admin\.roles\.manage", \{\s*stepUpWithinSeconds: 300/);
    assert.match(route, /readBoundedJsonRequest/);
    assert.match(route, /command-center-communications-write/);
    assert.match(route, /command-center-communications-test/);
    assert.match(route, /command-center-communications-limoo-read/);
    assert.match(route, /command-center-communications-limoo-send/);
  });

  it("returns masked snapshots while decryption stays in the server runtime path", () => {
    assert.match(store, /secretConfigured: Boolean\(row\.encrypted_api_key\)/);
    assert.match(store, /keyFingerprint: row\.api_key_fingerprint/);
    assert.match(store, /decryptCommunicationProviderSecret/);
    assert.doesNotMatch(route, /encrypted_api_key/);
    assert.doesNotMatch(client, /encrypted_api_key/);
    assert.match(client, /type="password"/);
    assert.match(client, /autoComplete="new-password"/);
  });

  it("keeps secret-free append-only configuration and operation evidence", () => {
    assert.match(migration, /communication provider config events are append-only/);
    assert.match(migration, /BEFORE UPDATE ON communication_provider_config_events/);
    assert.match(migration, /BEFORE DELETE ON communication_provider_config_events/);
    assert.match(migration, /NOT \(settings \?\| ARRAY\['apiKey', 'api_key', 'secret', 'token', 'password', 'credential'\]\)/);
    assert.match(route, /recordCommunicationProviderOperation/);
    assert.match(store, /action: `communication_provider\.\$\{input\.operation\}`/);
    assert.match(store, /resourceType: "communication_provider"/);
    assert.doesNotMatch(operations, /LIMOO_SMS_API_KEY|process\.env|encrypted_api_key/);
  });

  it("supports the complete documented Limoo operations from the admin UI", () => {
    for (const action of [
      "limoo_credit",
      "limoo_send_sms",
      "limoo_send_peer",
      "limoo_send_pattern",
      "limoo_status",
      "limoo_received",
    ]) {
      assert.match(route, new RegExp(action));
      assert.match(operations, new RegExp(action));
    }
    assert.match(page, /<LimooOperationsPanel/);
    assert.match(operations, /aria-busy/);
    assert.match(operations, /disabled=\{busy/);
  });

  it("guards Limoo sends with durable idempotency receipts", () => {
    assert.match(route, /claimApiCommandTx<LimooCommandReceipt>/);
    assert.match(route, /completeApiCommandTx/);
    assert.match(route, /parseApiIdempotencyKey/);
    assert.match(route, /communications\.\$\{action\}/);
    assert.match(operations, /Idempotency-Key/);
    assert.match(operations, /crypto\.randomUUID\(\)/);
  });

  it("rejects oversized list items and audits environment-backed providers", () => {
    assert.match(route, /raw\.length < 1 \|\| raw\.length > maxLength/);
    assert.match(store, /configurationSource: row \? "managed" : "environment"/);
    assert.match(store, /revision: row \? Number\(row\.revision\) : 0/);
  });

  it("applies the admin-managed SMS Pattern ID and email template at delivery time", () => {
    assert.match(sms, /managed\.config\.settings\.otpPatternId/);
    assert.match(sms, /sendpatternmessage/);
    assert.match(sms, /ReplaceToken: \[code\]/);
    assert.doesNotMatch(sms, /sendcode|checkcode|otpFooter/);
    assert.match(client, /Pattern ID لیمو/);
    assert.match(route, /generatePhoneOtpCode/);
    assert.match(route, /normalizeLimooPatternId/);
    assert.match(route, /enabled === false\) return \{\}/);
    assert.match(email, /managed\?\.settings\.defaultTemplateId/);
    assert.match(email, /dynamic_template_data: message\.templateVariables/);
    assert.match(email, /template: \{ id: templateId, variables: message\.templateVariables/);
  });

  it("serializes rotations and makes an admin disable override environment fallback", () => {
    assert.match(store, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
    assert.match(store, /last_test_status = NULL,\s+last_tested_at = NULL/);
    assert.match(client, /communication_provider_test_failed"\) await load\(\)/);
    assert.match(client, /provider\.lastTestStatus === "passed"/);
    assert.match(email, /managedFallback\.status === "disabled"/);
    assert.match(health, /isEmailRuntimeConfigured\(\)/);
  });
});
