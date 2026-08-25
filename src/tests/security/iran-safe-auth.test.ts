import assert from "node:assert/strict";
import test from "node:test";
import { adminAuthenticationModes, customerPasskeysEnabled } from "@/lib/admin-auth-policy";
import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH, hashAdminPassword, validateAdminPassword, verifyAdminPassword } from "@/lib/security/admin-password-totp";
import { findBackupCode, generateBackupCodes, hashBackupCode } from "@/lib/security/totp";

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
