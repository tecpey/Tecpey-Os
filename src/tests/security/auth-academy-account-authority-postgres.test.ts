import { randomInt, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  authenticateOrRegisterAcademyAccount,
  fingerprintAcademyAccount,
  fingerprintAcademyUsername,
  type AcademyAccountAuditContext,
} from "../../lib/security/academy-account-authority";
import {
  hashSensitiveAuditRequest,
  writeSensitiveMutationAuditTx,
} from "../../lib/security/sensitive-mutation-audit";
import {
  finalizePhoneOtpSend,
  preparePhoneOtpChallenge,
  verifyPhoneOtpChallenge,
} from "../../lib/security/phone-otp-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
const accountIds = new Set<string>();

function identity(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function username(): string {
  return `academy${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function iranianMobile(): string {
  return `+989${String(randomInt(100_000_000, 1_000_000_000)).padStart(9, "0")}`;
}

async function verifiedSignupChallenge(phoneE164: string): Promise<string> {
  const prepared = await preparePhoneOtpChallenge({ phoneE164, purpose: "signup" });
  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") {
    throw new Error("academy_account_test_otp_unavailable");
  }
  assert.equal(
    await finalizePhoneOtpSend({ challengeId: prepared.challengeId, sent: true }),
    true,
  );
  assert.deepEqual(
    await verifyPhoneOtpChallenge({
      challengeId: prepared.challengeId,
      code: prepared.code,
    }),
    { status: "verified", purpose: "signup" },
  );
  return prepared.challengeId;
}

async function loadChallengeLifecycle(challengeId: string) {
  const result = await withDb(async (client) => {
    const challenge = await client.query<{
      status: string;
      consumed_by_account_id: string | null;
    }>(
      `SELECT status, consumed_by_account_id
         FROM identity_phone_otp_challenges
        WHERE id = $1`,
      [challengeId],
    );
    const events = await client.query<{ event_type: string }>(
      `SELECT event_type
         FROM identity_phone_otp_events
        WHERE challenge_id = $1
        ORDER BY created_at`,
      [challengeId],
    );
    return {
      challenge: challenge.rows[0] ?? null,
      events: events.rows.map((row) => row.event_type),
    };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("academy_account_test_database_unavailable");
  return result.value;
}

async function cloneVerifiedSignupChallenge(challengeId: string): Promise<string> {
  const clonedId = randomUUID();
  const result = await withDb(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO identity_phone_otp_challenges
         (id, phone_fingerprint, encrypted_phone, purpose, provider, status,
          otp_code_digest, expires_at, verified_at)
       SELECT $2::uuid, phone_fingerprint, encrypted_phone, purpose, provider,
              'verified', NULL, expires_at, NOW()
         FROM identity_phone_otp_challenges
        WHERE id = $1
          AND purpose = 'signup'
          AND status = 'verified'
          AND expires_at > NOW()
       RETURNING id::text`,
      [challengeId, clonedId],
    );
    return inserted.rows[0]?.id ?? null;
  });
  assert.equal(result.enabled, true);
  if (!result.enabled || result.value !== clonedId) {
    throw new Error("academy_account_test_otp_clone_failed");
  }
  return clonedId;
}

function audit(input: {
  tenantId: string;
  accountId: string;
  username: string;
  correlationId?: string;
}): AcademyAccountAuditContext {
  const accountFingerprint = fingerprintAcademyAccount(input.accountId);
  const usernameFingerprint = fingerprintAcademyUsername(input.username);
  return {
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.accountId,
    correlationId:
      input.correlationId ?? `academy-account-create-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      action: "credential.account.create",
      mode: "signup",
      accountFingerprint,
      usernameFingerprint,
    }),
  };
}

async function loadAccount(accountId: string) {
  const result = await withDb(async (client) => {
    const account = await client.query<{
      id: string;
      email: string;
      username: string;
      display_name: string;
      password_hash: string;
    }>(
      `SELECT id, email, username, display_name, password_hash
         FROM academy_auth_accounts
        WHERE id = $1`,
      [accountId],
    );
    const evidence = await client.query<{
      action: string;
      outcome: string;
      document: string;
    }>(
      `SELECT action, outcome, row_to_json(event)::text AS document
         FROM sensitive_mutation_audit_events event
        WHERE action = 'credential.account.create'
          AND actor_id = $1
        ORDER BY created_at`,
      [accountId],
    );
    return { account: account.rows[0] ?? null, evidence: evidence.rows };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("academy_account_test_database_unavailable");
  return result.value;
}

after(async () => {
  if (accountIds.size === 0) return;
  await withDb(async (client) => {
    await client.query("DELETE FROM academy_auth_accounts WHERE id = ANY($1::text[])", [
      [...accountIds],
    ]);
    return true;
  });
});

describe("Academy account credential authority", () => {
  it(
    "commits account creation with one secret-free mandatory event",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      const displayName = `Display ${randomUUID()}`;
      const password = `A!${randomUUID()}-secure`;
      accountIds.add(accountId);

      const result = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: userName,
        displayName,
        password,
        audit: audit({ tenantId, accountId, username: userName }),
      });
      assert.equal(result.status, "created");

      const state = await loadAccount(accountId);
      assert.equal(state.account?.email, email);
      assert.equal(state.account?.username, userName);
      assert.equal(state.account?.display_name, displayName);
      assert.notEqual(state.account?.password_hash, password);
      assert.equal(state.evidence.length, 1);
      assert.equal(state.evidence[0]?.outcome, "success");
      const document = state.evidence[0]?.document ?? "";
      for (const forbidden of [email, password, displayName, userName]) {
        assert.equal(document.includes(forbidden), false);
      }
      assert.match(document, /accountFingerprint/);
      assert.match(document, /usernameFingerprint/);
    },
  );

  it(
    "rolls back account insertion when mandatory evidence conflicts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-conflict");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      const correlationId = `academy-account-conflict-${randomUUID()}`;
      accountIds.add(accountId);

      const seeded = await withDb(async (client) => {
        await writeSensitiveMutationAuditTx(client, {
          tenantId,
          actorType: "user",
          actorId: accountId,
          action: "credential.account.create",
          resourceType: "credential_account",
          resourceId: accountId,
          outcome: "success",
          correlationId,
          requestHash: "f".repeat(64),
          metadata: { policyVersion: "forced-conflict" },
        });
        return true;
      });
      assert.equal(seeded.enabled, true);

      await assert.rejects(
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId,
          email,
          username: userName,
          displayName: "Rollback Account",
          password: `A!${randomUUID()}-secure`,
          audit: audit({
            tenantId,
            accountId,
            username: userName,
            correlationId,
          }),
        }),
        /sensitive_audit_correlation_conflict/,
      );
      const state = await loadAccount(accountId);
      assert.equal(state.account, null);
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "authenticates an existing account without mutating stored profile or evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-login");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const storedUsername = username();
      const storedDisplayName = "Stored Academy Name";
      const password = `A!${randomUUID()}-secure`;
      accountIds.add(accountId);

      const created = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: storedDisplayName,
        password,
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(created.status, "created");

      const authenticated = await authenticateOrRegisterAcademyAccount({
        mode: "login",
        accountId,
        email,
        username: username(),
        displayName: "Request Must Not Mutate",
        password,
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(authenticated.status, "authenticated");
      if (authenticated.status !== "authenticated") {
        throw new Error("academy_account_login_failed");
      }
      assert.equal(authenticated.account.username, storedUsername);
      assert.equal(authenticated.account.displayName, storedDisplayName);

      const state = await loadAccount(accountId);
      assert.equal(state.account?.username, storedUsername);
      assert.equal(state.account?.display_name, storedDisplayName);
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "consumes a same-phone signup challenge for an existing account exactly once and rejects phone mismatch",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      // Consumed OTP evidence is immutable and intentionally retains its account
      // reference, so this isolated integration identity is not added to accountIds.
      const accountId = identity("academy-account-existing-phone");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const storedUsername = username();
      const password = `A!${randomUUID()}-secure`;
      const phoneE164 = iranianMobile();
      const initialChallengeId = await verifiedSignupChallenge(phoneE164);

      const created = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Existing Phone Account",
        password,
        phoneVerification: {
          phoneE164,
          challengeId: initialChallengeId,
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(created.status, "created");

      const existingChallengeId = await verifiedSignupChallenge(phoneE164);
      const authenticated = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Request Must Not Mutate",
        password,
        phoneVerification: {
          phoneE164,
          challengeId: existingChallengeId,
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(authenticated.status, "authenticated");

      const consumed = await loadChallengeLifecycle(existingChallengeId);
      assert.deepEqual(consumed.challenge, {
        status: "consumed",
        consumed_by_account_id: accountId,
      });
      assert.equal(
        consumed.events.filter((event) => event === "consumed").length,
        1,
      );

      const replayed = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Replay Must Fail",
        password,
        phoneVerification: {
          phoneE164,
          challengeId: existingChallengeId,
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.deepEqual(replayed, { status: "phone_verification_required" });

      const otherPhoneE164 = iranianMobile();
      const mismatchChallengeId = await verifiedSignupChallenge(otherPhoneE164);
      const wrongPasswordMismatch = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Wrong Password Must Stay Generic",
        password: "definitely-wrong-password",
        phoneVerification: {
          phoneE164: otherPhoneE164,
          challengeId: mismatchChallengeId,
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.deepEqual(wrongPasswordMismatch, { status: "invalid_credentials" });

      const unverifiedMismatch = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Unverified Mismatch Must Stay Generic",
        password,
        phoneVerification: {
          phoneE164: otherPhoneE164,
          challengeId: randomUUID(),
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.deepEqual(unverifiedMismatch, {
        status: "phone_verification_required",
      });

      const mismatched = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: "Mismatch Must Fail",
        password,
        phoneVerification: {
          phoneE164: otherPhoneE164,
          challengeId: mismatchChallengeId,
          required: true,
        },
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.deepEqual(mismatched, { status: "phone_mismatch" });

      const mismatch = await loadChallengeLifecycle(mismatchChallengeId);
      assert.deepEqual(mismatch.challenge, {
        status: "verified",
        consumed_by_account_id: null,
      });
      assert.equal(
        mismatch.events.filter((event) => event === "consumed").length,
        0,
      );
    },
  );

  it(
    "serializes concurrent ownership claims for one verified phone",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      // The winning account is intentionally retained because consumed OTP
      // evidence has a RESTRICT reference to it and is append-only.
      const phoneE164 = iranianMobile();
      const firstChallengeId = await verifiedSignupChallenge(phoneE164);
      const secondChallengeId = await cloneVerifiedSignupChallenge(firstChallengeId);
      const tenantId = identity("academy-account-phone-race-tenant");
      const first = {
        accountId: identity("academy-account-phone-race-a"),
        email: `${randomUUID()}@example.com`,
        username: username(),
        challengeId: firstChallengeId,
      };
      const second = {
        accountId: identity("academy-account-phone-race-b"),
        email: `${randomUUID()}@example.com`,
        username: username(),
        challengeId: secondChallengeId,
      };

      const results = await Promise.all(
        [first, second].map((candidate) =>
          authenticateOrRegisterAcademyAccount({
            mode: "signup",
            accountId: candidate.accountId,
            email: candidate.email,
            username: candidate.username,
            displayName: "Phone Ownership Race",
            password: `A!${randomUUID()}-secure`,
            phoneVerification: {
              phoneE164,
              challengeId: candidate.challengeId,
              required: true,
            },
            audit: audit({
              tenantId,
              accountId: candidate.accountId,
              username: candidate.username,
            }),
          }),
        ),
      );

      assert.equal(
        results.filter((result) => result.status === "created").length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === "phone_taken").length,
        1,
      );
      const winnerIndex = results.findIndex((result) => result.status === "created");
      const loserIndex = winnerIndex === 0 ? 1 : 0;
      const candidates = [first, second];
      const winningLifecycle = await loadChallengeLifecycle(
        candidates[winnerIndex]!.challengeId,
      );
      assert.deepEqual(winningLifecycle.challenge, {
        status: "consumed",
        consumed_by_account_id: candidates[winnerIndex]!.accountId,
      });
      const losingLifecycle = await loadChallengeLifecycle(
        candidates[loserIndex]!.challengeId,
      );
      assert.deepEqual(losingLifecycle.challenge, {
        status: "verified",
        consumed_by_account_id: null,
      });
    },
  );

  it(
    "rejects an invalid password without mutation or new evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-password");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      accountIds.add(accountId);

      await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: userName,
        displayName: "Password Account",
        password: `A!${randomUUID()}-secure`,
        audit: audit({ tenantId, accountId, username: userName }),
      });
      const rejected = await authenticateOrRegisterAcademyAccount({
        mode: "login",
        accountId,
        email,
        username: username(),
        displayName: "Ignored",
        password: "definitely-wrong-password",
        audit: audit({ tenantId, accountId, username: userName }),
      });
      assert.deepEqual(rejected, { status: "invalid_credentials" });
      const state = await loadAccount(accountId);
      assert.equal(state.account?.display_name, "Password Account");
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "serializes concurrent signup ownership for one username",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const sharedUsername = username();
      const tenantId = identity("academy-account-tenant");
      const firstId = identity("academy-account-race-a");
      const secondId = identity("academy-account-race-b");
      accountIds.add(firstId);
      accountIds.add(secondId);

      const [first, second] = await Promise.all([
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId: firstId,
          email: `${randomUUID()}@example.com`,
          username: sharedUsername,
          displayName: "Race A",
          password: `A!${randomUUID()}-secure`,
          audit: audit({ tenantId, accountId: firstId, username: sharedUsername }),
        }),
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId: secondId,
          email: `${randomUUID()}@example.com`,
          username: sharedUsername,
          displayName: "Race B",
          password: `A!${randomUUID()}-secure`,
          audit: audit({ tenantId, accountId: secondId, username: sharedUsername }),
        }),
      ]);
      assert.equal(
        [first.status, second.status].filter((status) => status === "created").length,
        1,
      );
      assert.equal(
        [first.status, second.status].filter((status) => status === "username_taken").length,
        1,
      );
    },
  );
});
