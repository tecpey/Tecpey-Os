import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import {
  consumeVerifiedPhoneChallengeTx,
  lockVerifiedPhoneChallengeTx,
} from "@/lib/security/phone-otp-authority";

export type AcademyAccountAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type AcademyCredentialAccount = {
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  phoneE164?: string;
};

export type AcademyAccountAuthorityResult =
  | {
      status: "created" | "authenticated";
      account: AcademyCredentialAccount;
    }
  | {
      status: "invalid_credentials" | "username_taken" | "phone_taken" | "phone_mismatch" | "phone_verification_required" | "unavailable";
    };

type AcademyAccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  password_hash: string;
  phone_e164: string | null;
};

export function hashAcademyPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

export function verifyAcademyPassword(password: string, stored: string): boolean {
  const [algorithm, roundsText, salt, digest] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || !roundsText || !salt || !digest) return false;
  const rounds = Number(roundsText);
  if (!Number.isFinite(rounds) || rounds < 50_000) return false;
  const calculated = pbkdf2Sync(password, salt, rounds, 32, "sha256").toString("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(calculated, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function fingerprintAcademyAccount(accountId: string): string {
  return createHash("sha256")
    .update("tecpey-academy-account-v1\0")
    .update(accountId)
    .digest("hex");
}

export function fingerprintAcademyUsername(username: string): string {
  return createHash("sha256")
    .update("tecpey-academy-username-v1\0")
    .update(username)
    .digest("hex");
}

function assertAuthority(input: {
  accountId: string;
  audit: AcademyAccountAuditContext;
}): void {
  if (!input.accountId || input.audit.actorId !== input.accountId) {
    throw new Error("academy_account_audit_actor_mismatch");
  }
  if (input.audit.actorType !== "user") {
    throw new Error("academy_account_audit_actor_type_invalid");
  }
}

async function lockIdentity(client: PoolClient, identity: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [identity]);
}

async function lockSignupIdentities(
  client: PoolClient,
  input: { email: string; username: string; phoneE164?: string },
): Promise<void> {
  const locks = [
    `academy-account-email:${input.email}`,
    `academy-account-username:${input.username}`,
    ...(input.phoneE164
      ? [`academy-account-phone:${input.phoneE164}`]
      : []),
  ].sort();
  for (const lock of locks) await lockIdentity(client, lock);
}

function accountFromRow(row: AcademyAccountRow): AcademyCredentialAccount {
  return {
    accountId: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    phoneE164: row.phone_e164 ?? undefined,
  };
}

export async function authenticateOrRegisterAcademyAccount(input: {
  mode: "login" | "signup";
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  loginIdentity?: string;
  phoneVerification?: {
    phoneE164: string;
    challengeId: string;
    required: boolean;
  };
  audit: AcademyAccountAuditContext;
}): Promise<AcademyAccountAuthorityResult> {
  if (input.mode === "signup") assertAuthority(input);

  const transaction = await withTx(async (client) => {
    if (input.mode === "login") {
      await lockIdentity(client, `academy-account-email:${input.email}`);
      const selected = await client.query<AcademyAccountRow>(
        `SELECT id, email, username, display_name, password_hash, phone_e164
           FROM academy_auth_accounts
          WHERE email = $1 OR phone_e164 = $2
          ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END
          LIMIT 1
          FOR UPDATE`,
        [input.email, input.loginIdentity ?? input.phoneVerification?.phoneE164 ?? ""],
      );
      const existing = selected.rows[0];
      if (!existing || !verifyAcademyPassword(input.password, existing.password_hash)) {
        return { status: "invalid_credentials" } as const;
      }
      return {
        status: "authenticated",
        account: accountFromRow(existing),
      } as const;
    }

    await lockSignupIdentities(client, {
      email: input.email,
      username: input.username,
      phoneE164: input.phoneVerification?.phoneE164,
    });
    const selected = await client.query<AcademyAccountRow>(
      `SELECT id, email, username, display_name, password_hash, phone_e164
         FROM academy_auth_accounts
        WHERE email = $1 OR username = $2 OR phone_e164 = $3
        ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END
        FOR UPDATE`,
      [input.email, input.username, input.phoneVerification?.phoneE164 ?? ""],
    );
    const usernameOwner = selected.rows.find(
      (row) => row.username === input.username && row.email !== input.email,
    );
    if (usernameOwner) return { status: "username_taken" } as const;

    const phoneOwner = input.phoneVerification?.phoneE164
      ? selected.rows.find(
          (row) => row.phone_e164 === input.phoneVerification?.phoneE164 && row.email !== input.email,
        )
      : null;
    if (phoneOwner) return { status: "phone_taken" } as const;

    const existing = selected.rows.find((row) => row.email === input.email) ?? null;
    if (existing) {
      if (!verifyAcademyPassword(input.password, existing.password_hash)) {
        return { status: "invalid_credentials" } as const;
      }
      if (input.phoneVerification?.required) {
        const verified = await lockVerifiedPhoneChallengeTx(client, {
          challengeId: input.phoneVerification.challengeId,
          phoneE164: input.phoneVerification.phoneE164,
          purpose: "signup",
        });
        if (!verified) return { status: "phone_verification_required" } as const;
        if (existing.phone_e164 !== input.phoneVerification.phoneE164) {
          return { status: "phone_mismatch" } as const;
        }
        const consumed = await consumeVerifiedPhoneChallengeTx(client, {
          challengeId: input.phoneVerification.challengeId,
          phoneE164: input.phoneVerification.phoneE164,
          purpose: "signup",
          accountId: existing.id,
        });
        if (!consumed) throw new Error("phone_otp_consumption_invariant_failed");
      }
      return {
        status: "authenticated",
        account: accountFromRow(existing),
      } as const;
    }

    if (input.phoneVerification?.required) {
      const verified = await lockVerifiedPhoneChallengeTx(client, {
        challengeId: input.phoneVerification.challengeId,
        phoneE164: input.phoneVerification.phoneE164,
        purpose: "signup",
      });
      if (!verified) return { status: "phone_verification_required" } as const;
    }

    const passwordHash = hashAcademyPassword(input.password);
    await client.query(
      `INSERT INTO academy_auth_accounts
         (id, email, username, display_name, password_hash, phone_e164, phone_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE NOW() END)`,
      [
        input.accountId,
        input.email,
        input.username,
        input.displayName,
        passwordHash,
        input.phoneVerification?.phoneE164 ?? null,
      ],
    );
    if (input.phoneVerification?.required) {
      const consumed = await consumeVerifiedPhoneChallengeTx(client, {
        challengeId: input.phoneVerification.challengeId,
        phoneE164: input.phoneVerification.phoneE164,
        purpose: "signup",
        accountId: input.accountId,
      });
      if (!consumed) throw new Error("phone_otp_consumption_invariant_failed");
    }
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.account.create",
      resourceType: "credential_account",
      resourceId: input.accountId,
      outcome: "success",
      metadata: {
        policyVersion: "academy-account-credential-v1",
        accountFingerprint: fingerprintAcademyAccount(input.accountId),
        usernameFingerprint: fingerprintAcademyUsername(input.username),
      },
    });

    return {
      status: "created",
      account: {
        accountId: input.accountId,
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        phoneE164: input.phoneVerification?.phoneE164,
      },
    } as const;
  });

  if (!transaction.enabled) return { status: "unavailable" };
  return transaction.value;
}
