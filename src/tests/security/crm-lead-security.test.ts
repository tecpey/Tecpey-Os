import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { parseAcademyLeadCommand } from "../../lib/crm/academy-lead-input";
import {
  decryptLeadPii,
  encryptLeadPii,
  leadContactHash,
  normalizeLeadPhone,
} from "../../lib/crm/lead-pii";
import { getTrustedClientIp } from "../../lib/security/trusted-client-ip";

const original = {
  piiKey: process.env.TECPEY_CRM_PII_KEY_B64,
  hashSecret: process.env.TECPEY_CRM_CONTACT_HASH_SECRET,
  proxyHeader: process.env.TECPEY_TRUSTED_PROXY_HEADER,
  proxyHops: process.env.TECPEY_TRUSTED_PROXY_HOPS,
};

before(() => {
  process.env.TECPEY_CRM_PII_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
  process.env.TECPEY_CRM_CONTACT_HASH_SECRET = "test-crm-contact-hash-secret-at-least-32-chars";
});

after(() => {
  if (original.piiKey === undefined) delete process.env.TECPEY_CRM_PII_KEY_B64;
  else process.env.TECPEY_CRM_PII_KEY_B64 = original.piiKey;
  if (original.hashSecret === undefined) delete process.env.TECPEY_CRM_CONTACT_HASH_SECRET;
  else process.env.TECPEY_CRM_CONTACT_HASH_SECRET = original.hashSecret;
  if (original.proxyHeader === undefined) delete process.env.TECPEY_TRUSTED_PROXY_HEADER;
  else process.env.TECPEY_TRUSTED_PROXY_HEADER = original.proxyHeader;
  if (original.proxyHops === undefined) delete process.env.TECPEY_TRUSTED_PROXY_HOPS;
  else process.env.TECPEY_TRUSTED_PROXY_HOPS = original.proxyHops;
});

describe("CRM lead security primitives", () => {
  it("encrypts PII with tenant/lead-bound authenticated encryption", () => {
    const pii = {
      name: "مریم رضایی",
      phone: "+989121234567",
      email: "maryam@example.com",
      city: "Babol",
    };
    const encrypted = encryptLeadPii(pii, { tenantId: "tecpey", leadId: "lead-1" });
    assert.equal(encrypted.ciphertext.includes("مریم"), false);
    assert.deepEqual(
      decryptLeadPii(encrypted, { tenantId: "tecpey", leadId: "lead-1" }),
      pii,
    );
    assert.throws(() =>
      decryptLeadPii(encrypted, { tenantId: "other", leadId: "lead-1" }),
    );
    assert.throws(() =>
      decryptLeadPii(
        { ...encrypted, tag: Buffer.alloc(16, 1).toString("base64") },
        { tenantId: "tecpey", leadId: "lead-1" },
      ),
    );
  });

  it("normalizes Iranian phone formats and keeps contact identity stable", () => {
    assert.equal(normalizeLeadPhone("0912 123 4567"), "+989121234567");
    assert.equal(normalizeLeadPhone("0098-912-123-4567"), "+989121234567");
    assert.equal(
      leadContactHash("09121234567"),
      leadContactHash("+98 912 123 4567"),
    );
  });

  it("requires explicit consent, stable idempotency and allowlisted program choices", () => {
    const valid = parseAcademyLeadCommand({
      tenantId: "tecpey",
      leadKind: "academy_specialized",
      defaultSource: "academy-specialized-program",
      idempotencyHeader: "academy-specialized-1234567890",
      body: {
        name: "Maryam Rezaei",
        phone: "+989121234567",
        email: "MARYAM@example.com",
        locale: "en",
        mode: "online",
        track: "risk-first-trading",
        consent: true,
        privacyNoticeVersion: "academy-leads-2026-07",
      },
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.command.pii.email, "MARYAM@example.com");
      assert.deepEqual(valid.command.attributes, {
        mode: "online",
        track: "risk-first-trading",
      });
    }

    const withoutConsent = parseAcademyLeadCommand({
      tenantId: "tecpey",
      leadKind: "academy_interest",
      defaultSource: "academy",
      idempotencyHeader: "academy-interest-1234567890",
      body: { name: "Maryam", phone: "09121234567", termNumber: 1 },
    });
    assert.deepEqual(withoutConsent, { ok: false, error: "privacy_consent_required" });

    const invalidTrack = parseAcademyLeadCommand({
      tenantId: "tecpey",
      leadKind: "academy_specialized",
      defaultSource: "academy",
      idempotencyHeader: "academy-specialized-0987654321",
      body: {
        name: "Maryam",
        phone: "09121234567",
        mode: "online",
        track: "attacker-controlled-track",
        consent: true,
        privacyNoticeVersion: "v1",
      },
    });
    assert.deepEqual(invalidTrack, { ok: false, error: "invalid_program_track" });
  });

  it("ignores forwarding headers until an explicit trusted-proxy contract exists", () => {
    delete process.env.TECPEY_TRUSTED_PROXY_HEADER;
    delete process.env.TECPEY_TRUSTED_PROXY_HOPS;
    const request = new NextRequest("https://tecpey.ir/api/academy-lead", {
      headers: { "x-forwarded-for": "198.51.100.10, 10.0.0.2" },
    });
    assert.equal(getTrustedClientIp(request), null);

    process.env.TECPEY_TRUSTED_PROXY_HEADER = "x-forwarded-for";
    process.env.TECPEY_TRUSTED_PROXY_HOPS = "1";
    assert.equal(getTrustedClientIp(request), "198.51.100.10");
  });
});
