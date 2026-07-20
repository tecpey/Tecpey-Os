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

export type AcademyAccountAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type AcademyCredentialAccount = {
  accountId: string;
  email: string;
  username: string;
  displayName: string;
};

export type AcademyAccountAuthorityResult =
  | {
      status: "created" | "authenticated";
      account: AcademyCredentialAccount;
    }
  | {
      status: "invalid_credentials" | "username_taken" | "unavailable";
    };

type AcademyAccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  password_hash: string;
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
  input: { email: string; username: string },
): Promise<void> {
  const locks = [
    `academy-account-email:${input.email}`,
    `academy-account-username:${input.username}`,
  ].sort();
  for (const lock of locks) await lockIdentity(client, lock);
}

function accountFromRow(row: AcademyAccountRow): AcademyCredentialAccount {
  return {
    accountId: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
  };
}

export async function authenticateOrRegisterAcademyAccount(input: {
  mode: "login" | "signup";
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  audit: AcademyAccountAuditContext;
}): Promise<AcademyAccountAuthorityResult> {
  assertAuthority(input);

  const transaction = await withTx(async (client) => {
    if (input.mode === "login") {
      await lockIdentity(client, `academy-account-email:${input.email}`);
      const selected = await client.query<AcademyAccountRow>(
        `SELECT id, email, username, display_name, password_hash
           FROM academy_auth_accounts
          WHERE email = $1
          FOR UPDATE`,
        [input.email],
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

    await lockSignupIdentities(client, input);
    const selected = await client.query<AcademyAccountRow>(
      `SELECT id, email, username, display_name, password_hash
         FROM academy_auth_accounts
        WHERE email = $1 OR username = $2
        ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END
        FOR UPDATE`,
      [input.email, input.username],
    );
    const usernameOwner = selected.rows.find(
      (row) => row.username === input.username && row.email !== input.email,
    );
    if (usernameOwner) return { status: "username_taken" } as const;

    const existing = selected.rows.find((row) => row.email === input.email) ?? null;
    if (existing) {
      if (!verifyAcademyPassword(input.password, existing.password_hash)) {
        return { status: "invalid_credentials" } as const;
      }
      return {
        status: "authenticated",
        account: accountFromRow(existing),
      } as const;
    }

    const passwordHash = hashAcademyPassword(input.password);
    await client.query(
      `INSERT INTO academy_auth_accounts
         (id, email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.accountId, input.email, input.username, input.displayName, passwordHash],
    );
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
      },
    } as const;
  });

  if (!transaction.enabled) return { status: "unavailable" };
  return transaction.value;
}
