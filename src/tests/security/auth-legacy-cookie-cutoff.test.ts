import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const academySecret = "legacy-academy-secret-with-at-least-32-characters";
const hardSunset = "2026-08-18T00:00:00.000Z";
const hardSunsetMs = Date.parse(hardSunset);

function runLegacySession(cutoff?: string): {
  status: number | null;
  stderr: string;
  result: { role: string; academyAccountId: string | null } | null;
} {
  const script = `
    const joseModule = await import("jose");
    const nextModule = await import("next/server");
    const authModule = await import("./src/lib/auth-session.ts");
    const SignJWT = joseModule.SignJWT ?? joseModule.default?.SignJWT;
    const NextRequest = nextModule.NextRequest ?? nextModule.default?.NextRequest;
    const getCanonicalSession = authModule.getCanonicalSession ?? authModule.default?.getCanonicalSession;
    if (!SignJWT || !NextRequest || typeof getCanonicalSession !== "function") {
      throw new TypeError("legacy auth test imports unavailable");
    }
    const token = await new SignJWT({
      role: "academy_user",
      email: "legacy-user@tecpey.invalid",
      displayName: "Legacy User",
      username: "legacy-user",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("legacy-account")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.TECPEY_ACADEMY_AUTH_SECRET));
    const request = new NextRequest("https://tecpey.ir/api/legacy-auth-test", {
      headers: { cookie: "tecpey_academy_auth=" + token },
    });
    const session = await getCanonicalSession(request);
    console.log("LEGACY_RESULT=" + JSON.stringify({
      role: session.role,
      academyAccountId: session.academyAccountId,
    }));
  `;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
    TECPEY_SESSION_SECRET: "legacy-session-secret-with-at-least-32-characters",
    TECPEY_ACADEMY_AUTH_SECRET: academySecret,
  };
  delete env.TECPEY_LEGACY_AUTH_UNTIL;
  if (cutoff) env.TECPEY_LEGACY_AUTH_UNTIL = cutoff;

  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const resultLine = child.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("LEGACY_RESULT="));
  return {
    status: child.status,
    stderr: child.stderr,
    result: resultLine
      ? JSON.parse(resultLine.slice("LEGACY_RESULT=".length))
      : null,
  };
}

function productionValidation(cutoff: string) {
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
      NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
      NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
      NEXT_PUBLIC_API_SOCKET_URL: "wss://api.tecpey.ir/spot",
      TECPEY_SESSION_SECRET: "legacy-session-secret-with-at-least-32-characters",
      TECPEY_REFRESH_SECRET: "legacy-refresh-secret-with-at-least-32-characters",
      TECPEY_ACADEMY_AUTH_SECRET: academySecret,
      CERTIFICATE_SIGNING_SECRET:
        "legacy-certificate-secret-with-at-least-32-characters",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
      TECPEY_LEGACY_AUTH_UNTIL: cutoff,
    },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("Legacy cookie retirement authority", () => {
  it("disables legacy cookie authentication by default in production", () => {
    const child = runLegacySession();
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(child.result, {
      role: "guest",
      academyAccountId: null,
    });
  });

  it(
    "allows a legacy cookie only inside an explicit window before the immutable sunset",
    { skip: Date.now() + 60_000 >= hardSunsetMs },
    () => {
      const cutoff = new Date(
        Math.min(Date.now() + 24 * 60 * 60 * 1_000, hardSunsetMs - 1_000),
      ).toISOString();
      const child = runLegacySession(cutoff);
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(child.result, {
        role: "academy_user",
        academyAccountId: "legacy-account",
      });
    },
  );

  it("rejects configuration that attempts to slide beyond the immutable sunset", () => {
    const cutoff = new Date(hardSunsetMs + 1_000).toISOString();
    const runtime = runLegacySession(cutoff);
    assert.equal(runtime.status, 0, runtime.stderr);
    assert.deepEqual(runtime.result, {
      role: "guest",
      academyAccountId: null,
    });

    const validation = productionValidation(cutoff);
    assert.notEqual(validation.status, 0);
    assert.match(
      validation.stderr,
      /may not exceed the immutable 2026-08-18 legacy auth sunset|has passed its immutable 2026-08-18 sunset/,
    );
  });
});
