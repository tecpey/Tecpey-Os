import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function inspectLifetime(config: {
  duration?: string;
  seconds?: string;
}): {
  status: number | null;
  stderr: string;
  result: { jwtTtl: number; cookieTtl: number; configuredTtl: number } | null;
} {
  const script = `
    const joseModule = await import("jose");
    const sessionModule = await import("./src/lib/unified-session.ts");
    const refreshModule = await import("./src/lib/security/refresh-tokens.ts");
    const configModule = await import("./src/lib/platform-config.ts");
    const decodeJwt = joseModule.decodeJwt ?? joseModule.default?.decodeJwt;
    const signUnifiedSession = sessionModule.signUnifiedSession ?? sessionModule.default?.signUnifiedSession;
    const ACCESS_COOKIE_TTL_S = refreshModule.ACCESS_COOKIE_TTL_S ?? refreshModule.default?.ACCESS_COOKIE_TTL_S;
    const sessionMaxAgeSeconds = configModule.sessionMaxAgeSeconds ?? configModule.default?.sessionMaxAgeSeconds;
    if (!decodeJwt || typeof signUnifiedSession !== "function" || typeof sessionMaxAgeSeconds !== "function") {
      throw new TypeError("access TTL test imports unavailable");
    }
    const token = await signUnifiedSession({
      accountId: "ttl-account",
      studentId: null,
      email: "ttl@tecpey.invalid",
      displayName: "TTL Test",
      username: "ttl-test",
    });
    const payload = decodeJwt(token);
    console.log("TTL_RESULT=" + JSON.stringify({
      jwtTtl: Number(payload.exp) - Number(payload.iat),
      cookieTtl: ACCESS_COOKIE_TTL_S,
      configuredTtl: sessionMaxAgeSeconds(),
    }));
  `;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    TECPEY_SESSION_SECRET: "access-session-secret-with-at-least-32-characters",
  };
  delete env.TECPEY_SESSION_MAX_AGE;
  delete env.TECPEY_SESSION_MAX_AGE_SECONDS;
  if (config.duration) env.TECPEY_SESSION_MAX_AGE = config.duration;
  if (config.seconds) env.TECPEY_SESSION_MAX_AGE_SECONDS = config.seconds;

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
    .find((line) => line.startsWith("TTL_RESULT="));
  return {
    status: child.status,
    stderr: child.stderr,
    result: resultLine ? JSON.parse(resultLine.slice("TTL_RESULT=".length)) : null,
  };
}

function validateLifetime(duration: string) {
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
      NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
      NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
      NEXT_PUBLIC_API_SOCKET_URL: "wss://api.tecpey.ir/spot",
      TECPEY_SESSION_SECRET: "access-session-secret-with-at-least-32-characters",
      TECPEY_REFRESH_SECRET: "access-refresh-secret-with-at-least-32-characters",
      TECPEY_ACADEMY_AUTH_SECRET:
        "access-academy-secret-with-at-least-32-characters",
      CERTIFICATE_SIGNING_SECRET:
        "access-certificate-secret-with-at-least-32-characters",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
      TECPEY_SESSION_MAX_AGE: duration,
      TECPEY_SESSION_MAX_AGE_SECONDS: "",
      TECPEY_LEGACY_AUTH_UNTIL: "",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("Access-session lifetime authority", () => {
  it("uses one four-hour default for JWT, durable expiry and cookie max-age", () => {
    const child = inspectLifetime({});
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(child.result, {
      jwtTtl: 4 * 60 * 60,
      cookieTtl: 4 * 60 * 60,
      configuredTtl: 4 * 60 * 60,
    });
  });

  it("keeps an explicitly shorter lifetime aligned across JWT and cookie", () => {
    const child = inspectLifetime({ duration: "30m" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(child.result, {
      jwtTtl: 30 * 60,
      cookieTtl: 30 * 60,
      configuredTtl: 30 * 60,
    });
  });

  it("caps unsafe runtime configuration and rejects it in production validation", () => {
    const runtime = inspectLifetime({ duration: "30d" });
    assert.equal(runtime.status, 0, runtime.stderr);
    assert.deepEqual(runtime.result, {
      jwtTtl: 4 * 60 * 60,
      cookieTtl: 4 * 60 * 60,
      configuredTtl: 4 * 60 * 60,
    });

    const validation = validateLifetime("30d");
    assert.notEqual(validation.status, 0);
    assert.match(validation.stderr, /may not exceed the 4-hour security ceiling/);
  });
});
