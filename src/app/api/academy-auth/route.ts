import { NextRequest, NextResponse } from "next/server";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withDb } from "@/lib/db";
import {
  academyAccountIdFromEmail,
  clearAcademyAuthCookie,
  getAcademyAuthFromRequest,
  isAcademyAuthConfigured,
  normalizeAcademyEmail,
  normalizeAcademyUsername,
  setAcademyAuthCookie,
  signAcademyAuthSession,
} from "@/lib/academy-auth";

type AcademyAccount = {
  accountId: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type LocalAuthStore = {
  accountsByEmail: Record<string, AcademyAccount>;
  emailByUsername: Record<string, string>;
};

function cleanDisplayName(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 60);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string) {
  const [algo, roundsText, salt, digest] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !roundsText || !salt || !digest) return false;
  const rounds = Number(roundsText);
  if (!Number.isFinite(rounds) || rounds < 50_000) return false;
  const calculated = pbkdf2Sync(password, salt, rounds, 32, "sha256").toString("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function authStorePath() {
  return path.join(process.cwd(), "storage", "academy-auth.local.json");
}

function canUseLocalAuthStorage() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true"
  );
}

async function readLocalAuthStore(): Promise<LocalAuthStore> {
  try {
    const raw = await readFile(authStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalAuthStore;
    return {
      accountsByEmail: parsed.accountsByEmail || {},
      emailByUsername: parsed.emailByUsername || {},
    };
  } catch {
    return { accountsByEmail: {}, emailByUsername: {} };
  }
}

async function writeLocalAuthStore(store: LocalAuthStore) {
  await mkdir(path.dirname(authStorePath()), { recursive: true });
  await writeFile(authStorePath(), JSON.stringify(store, null, 2), "utf8");
}


type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

async function loadDbAccount(client: Queryable, email: string, username?: string) {
  const values: string[] = [email];
  let where = "email = $1";
  if (username) {
    values.push(username);
    where = "email = $1 OR username = $2";
  }
  const result = await client.query(
    `SELECT id, email, username, display_name, password_hash FROM academy_auth_accounts WHERE ${where} LIMIT 1`,
    values,
  );
  return result.rows[0] || null;
}

export async function GET(req: NextRequest) {
  const session = await getAcademyAuthFromRequest(req);
  return NextResponse.json({
    ok: true,
    authenticated: Boolean(session),
    account: session
      ? {
          email: session.email,
          displayName: session.displayName || "",
          username: session.username || "",
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const limit = await rateLimit(req, {
    namespace: "academy-auth",
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok)
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );

  if (!isAcademyAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "academy_auth_service_not_configured" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const mode = body.mode === "login" ? "login" : "signup";
    const email = normalizeAcademyEmail(body.email);
    const password = String(body.password || "");
    const displayName = cleanDisplayName(
      body.displayName || email.split("@")[0] || "دانشجوی تک‌پی",
    );
    const username = normalizeAcademyUsername(
      body.username || displayName || email.split("@")[0],
    );

    if (!/^\S+@\S+\.\S+$/.test(email))
      return NextResponse.json(
        { ok: false, error: "invalid_email" },
        { status: 400 },
      );
    if (password.length < 10)
      return NextResponse.json(
        { ok: false, error: "weak_password" },
        { status: 400 },
      );
    if (displayName.length < 2)
      return NextResponse.json(
        { ok: false, error: "invalid_display_name" },
        { status: 400 },
      );
    if (username.length < 3)
      return NextResponse.json(
        { ok: false, error: "invalid_username" },
        { status: 400 },
      );

    const accountId = academyAccountIdFromEmail(email);
    const dbResult = await withDb(async (client) => {
      const existing = await loadDbAccount(client, email, username);
      if (existing) {
        if (existing.email !== email && existing.username === username) {
          return { ok: false as const, status: 409, error: "username_taken" };
        }
        if (!verifyPassword(password, existing.password_hash)) {
          return { ok: false as const, status: 401, error: "invalid_credentials" };
        }
        await client.query(
          `UPDATE academy_auth_accounts SET display_name = COALESCE(NULLIF($2,''), display_name), updated_at = NOW() WHERE email = $1`,
          [email, displayName],
        );
        return {
          ok: true as const,
          account: {
            accountId: existing.id,
            email: existing.email,
            username: existing.username,
            displayName: displayName || existing.display_name,
          },
        };
      }
      if (mode === "login") {
        return { ok: false as const, status: 401, error: "invalid_credentials" };
      }
      await client.query(
        `INSERT INTO academy_auth_accounts (id, email, username, display_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [accountId, email, username, displayName, hashPassword(password)],
      );
      return {
        ok: true as const,
        account: { accountId, email, username, displayName },
      };
    });

    let account: AcademyAccount | { accountId: string; email: string; username: string; displayName: string } | null = null;
    if (dbResult.enabled) {
      if (!dbResult.value?.ok) {
        return NextResponse.json(
          { ok: false, error: dbResult.value?.error || "auth_failed" },
          { status: dbResult.value?.status || 400 },
        );
      }
      account = dbResult.value.account;
    } else {
      if (!canUseLocalAuthStorage()) {
        return NextResponse.json(
          { ok: false, error: "academy_auth_storage_unavailable" },
          { status: 503 },
        );
      }
      const store = await readLocalAuthStore();
      const existing = store.accountsByEmail[email];
      const ownerEmail = store.emailByUsername[username];
      if (ownerEmail && ownerEmail !== email) {
        return NextResponse.json(
          { ok: false, error: "username_taken" },
          { status: 409 },
        );
      }
      if (existing) {
        if (!verifyPassword(password, existing.passwordHash)) {
          return NextResponse.json(
            { ok: false, error: "invalid_credentials" },
            { status: 401 },
          );
        }
        existing.displayName = displayName || existing.displayName;
        existing.updatedAt = new Date().toISOString();
        store.accountsByEmail[email] = existing;
        await writeLocalAuthStore(store);
        account = existing;
      } else {
        if (mode === "login") {
          return NextResponse.json(
            { ok: false, error: "invalid_credentials" },
            { status: 401 },
          );
        }
        const created: AcademyAccount = {
          accountId,
          email,
          username,
          displayName,
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.accountsByEmail[email] = created;
        store.emailByUsername[username] = email;
        await writeLocalAuthStore(store);
        account = created;
      }
    }

    const token = await signAcademyAuthSession({
      accountId: account.accountId,
      email: account.email,
      displayName: account.displayName,
      username: account.username,
    });
    const response = NextResponse.json({
      ok: true,
      authenticated: true,
      account: {
        email: account.email,
        displayName: account.displayName,
        username: account.username,
      },
    });
    setAcademyAuthCookie(response, token);
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearAcademyAuthCookie(response);
  return response;
}
