import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ADMIN_AUTH_ENV_SECRET_NAMES } from "../../../scripts/admin-auth-env-test-fixture";
import { adminAuthenticationModes, customerPasskeysEnabled } from "@/lib/admin-auth-policy";
import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH, hashAdminPassword, validateAdminPassword, verifyAdminPassword } from "@/lib/security/admin-password-totp";
import {
  findBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  openAdminTotpRotationChallenge,
  sealAdminTotpRotationChallenge,
} from "@/lib/security/totp";

test("Iran-safe authentication policy disables passkeys by default", () => {
  const previousAdmin = process.env.TECPEY_ADMIN_PASSKEY_ENABLED;
  const previousCustomer = process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED;
  process.env.TECPEY_ADMIN_PASSKEY_ENABLED = "false";
  process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED = "false";
  try {
    assert.deepEqual(adminAuthenticationModes(), { passwordTotp: true, passkey: false, manualTotpEnrollment: true });
    assert.equal(customerPasskeysEnabled(), false);
  } finally {
    if (previousAdmin === undefined) delete process.env.TECPEY_ADMIN_PASSKEY_ENABLED;
    else process.env.TECPEY_ADMIN_PASSKEY_ENABLED = previousAdmin;
    if (previousCustomer === undefined) delete process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED;
    else process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED = previousCustomer;
  }
});

test("administrator password policy accepts long passphrases without composition rules", () => {
  assert.equal(ADMIN_PASSWORD_MIN_LENGTH, 15);
  assert.equal(ADMIN_PASSWORD_MAX_LENGTH, 128);
  assert.equal(validateAdminPassword("چهار واژه امن برای مدیر", "admin@example.com"), "چهار واژه امن برای مدیر");
  assert.equal(validateAdminPassword("short password"), null);
  assert.equal(validateAdminPassword("admin@example.com", "admin@example.com"), null);
  assert.equal(validateAdminPassword("x".repeat(129)), null);
});

test("password hashes and recovery codes never persist plaintext", () => {
  const password = "a long admin passphrase 2026";
  const stored = hashAdminPassword(password);
  assert.notEqual(stored, password);
  assert.equal(verifyAdminPassword(password, stored), true);
  assert.equal(verifyAdminPassword(`${password}!`, stored), false);
  const codes = generateBackupCodes();
  const hashes = codes.map(hashBackupCode);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(findBackupCode(codes[3], hashes), 3);
  assert.equal(hashes.includes(codes[3]), false);
});

test("administrator TOTP rotation challenge is encrypted, bound, tamper-evident, and expiring", () => {
  const now = 1_800_000_000_000;
  const secret = generateTotpSecret();
  const input = {
    adminId: "4db92f70-a54a-4da2-8d30-8c74519f0a20",
    sessionId: "877a55e1-df44-4f6b-9e65-63845853888c",
    secret,
    credentialVersion: "a".repeat(64),
  };
  const sealed = sealAdminTotpRotationChallenge(input, now);
  assert.equal(sealed.document.includes(secret), false);
  assert.equal(sealed.document.includes(input.adminId), false);
  assert.equal(sealed.expiresAt, new Date(now + 10 * 60_000).toISOString());
  assert.deepEqual(openAdminTotpRotationChallenge(sealed.document, now + 30_000), {
    ...input,
    issuedAt: now,
    expiresAt: now + 10 * 60_000,
  });

  const parts = sealed.document.split(".");
  const tag = parts[2] ?? "";
  assert.ok(tag.length > 1);
  parts[2] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  const tampered = parts.join(".");
  assert.equal(openAdminTotpRotationChallenge(tampered, now + 30_000), null);
  assert.equal(openAdminTotpRotationChallenge(sealed.document, now + 10 * 60_000), null);
});

test("administrator TOTP rotation is self-service without reopening bootstrap authority", () => {
  const route = readFileSync("src/app/api/command-center/auth/totp/rotate/route.ts", "utf8");
  const panel = readFileSync("src/components/admin/AdminTotpRotationPanel.tsx", "utf8");

  assert.match(route, /loadAdminPrincipal\(req\)/);
  assert.match(route, /verifyCsrfOrigin\(req\)/);
  assert.match(route, /readBoundedJsonRequest\(req/);
  assert.match(route, /FOR UPDATE OF u, c/);
  assert.match(route, /revoked_reason = 'totp_rotation'/);
  assert.match(route, /createAdminControlSession\(client/);
  assert.match(route, /openAdminTotpRotationChallenge\(document\)/);
  assert.doesNotMatch(route, /verifyAdminBootstrapToken/);
  assert.match(panel, /ورودی فعلی Authenticator را حذف نکن/);
  assert.match(panel, /کدهای بازیابی جدید/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("administrator authentication secrets stay in the production contract", () => {
  const envTemplate = readFileSync(".env.production.example", "utf8");
  const validator = readFileSync("scripts/validate-env.mjs", "utf8");
  const runbook = readFileSync("docs/security/ADMIN_PASSWORD_TOTP_RUNBOOK.md", "utf8");
  const requiredBlock = validator.match(/const required = \[([\s\S]*?)\];/)?.[1] ?? "";
  const secretNames = ADMIN_AUTH_ENV_SECRET_NAMES;

  for (const name of secretNames) {
    assert.match(envTemplate, new RegExp(`^${name}=`, "m"));
    assert.match(requiredBlock, new RegExp(`['"]${name}['"]`));
    assert.ok(runbook.includes("`" + name + "`"));
  }
});
