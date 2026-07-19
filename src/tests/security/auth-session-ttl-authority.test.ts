import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const minimumSeconds = 5 * 60;
const maximumSeconds = 4 * 60 * 60;

type RuntimeResult = {
  configuredSeconds: number;
  cookieSeconds: number;
  jwtSeconds: number;
};

type TtlOverrides = {
  TECPEY_SESSION_MAX_AGE_SECONDS?: string;
  TECPEY_SESSION_MAX_AGE?: string;
};

function runtimeAuthority(overrides: TtlOverrides = {}): RuntimeResult {
  const script = `
    const platformModule = await import("./src/lib/platform-config.ts");
    const unifiedModule = await import("./src/lib/unified-session.ts");
    const refreshModule = await import("./src/lib/security/refresh-tokens.ts");
    const joseModule = await import("jose");
    const platform = platformModule.default ?? platformModule;
    const unified = unifiedModule.default ?? unifiedModule;
    const refresh = refreshModule.default ?? refreshModule;
    const jose = joseModule.default ?? joseModule;
    const sessionMaxAgeSeconds = platformModule.sessionMaxAgeSeconds ?? platform.sessionMaxAgeSeconds;
    const signUnifiedSession = unifiedModule.signUnifiedSession ?? unified.signUnifiedSession;
    const ACCESS_COOKIE_TTL_S = refreshModule.ACCESS_COOKIE_TTL_S ?? refresh.ACCESS_COOKIE_TTL_S;
    const decodeJwt = joseModule.decodeJwt ?? jose.decodeJwt;
    if (
      typeof sessionMaxAgeSeconds !== "function" ||
      typeof signUnifiedSession !== "function" ||
      typeof decodeJwt !== "function" ||
      typeof ACCESS_COOKIE_TTL_S !== "number"
    ) {
      throw new TypeError("session TTL authority exports unavailable");
    }
    const token = await signUnifiedSession({
      accountId: "ttl-test-account",
      studentId: null,
      email: "ttl-test@tecpey.invalid",
      displayName: "TTL Test",
      username: "ttl-test",
    });
    const payload = decodeJwt(token);
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      throw new TypeError("session token timestamps unavailable");
    }
    console.log("TTL_RESULT=" + JSON.stringify({
      configuredSeconds: sessionMaxAgeSeconds(),
      cookieSeconds: ACCESS_COOKIE_TTL_S,
      jwtSeconds: payload.exp - payload.iat,
    }));
  `;

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
    TECPEY_SESSION_SECRET:
      "ttl-session-secret-with-at-least-32-characters",
    TECPEY_SESSION_MAX_AGE_SECONDS: "",
    TECPEY_SESSION_MAX_AGE: "",
    ...overrides,
  };
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
  assert.equal(child.status, 0, child.stderr);
  const resultLine = child.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("TTL_RESULT="));
  assert.ok(resultLine, child.stdout);
  return JSON.parse(resultLine.slice("TTL_RESULT=".length)) as RuntimeResult;
}

function validateProduction(
  overrides: TtlOverrides,
): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
    NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
    NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://api.tecpey.ir/spot",
    TECPEY_SESSION_SECRET:
      "ttl-session-secret-with-at-least-32-characters",
    TECPEY_REFRESH_SECRET:
      "ttl-refresh-secret-with-at-least-32-characters",
    TECPEY_ACADEMY_AUTH_SECRET:
      "ttl-academy-secret-with-at-least-32-characters",
    CERTIFICATE_SIGNING_SECRET:
      "ttl-certificate-secret-with-at-least-32-characters",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
    TECPEY_LEGACY_AUTH_UNTIL: "",
    TECPEY_SESSION_MAX_AGE_SECONDS: "",
    TECPEY_SESSION_MAX_AGE: "",
    ...overrides,
  };
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("Access-session TTL authority", () => {
  it("keeps JWT expiry and browser-cookie TTL on one canonical four-hour default", () => {
    assert.deepEqual(runtimeAuthority(), {
      configuredSeconds: maximumSeconds,
      cookieSeconds: maximumSeconds,
      jwtSeconds: maximumSeconds,
    });
  });

  it("supports one shorter deployment-controlled lifetime without JWT-cookie drift", () => {
    assert.deepEqual(
      runtimeAuthority({ TECPEY_SESSION_MAX_AGE_SECONDS: "300" }),
      {
        configuredSeconds: minimumSeconds,
        cookieSeconds: minimumSeconds,
        jwtSeconds: minimumSeconds,
      },
    );
    assert.deepEqual(runtimeAuthority({ TECPEY_SESSION_MAX_AGE: "2h" }), {
      configuredSeconds: 2 * 60 * 60,
      cookieSeconds: 2 * 60 * 60,
      jwtSeconds: 2 * 60 * 60,
    });
  });

  it("clamps unsafe runtime values while production validation rejects them", () => {
    assert.deepEqual(
      runtimeAuthority({ TECPEY_SESSION_MAX_AGE_SECONDS: "10" }),
      {
        configuredSeconds: minimumSeconds,
        cookieSeconds: minimumSeconds,
        jwtSeconds: minimumSeconds,
      },
    );
    assert.deepEqual(runtimeAuthority({ TECPEY_SESSION_MAX_AGE: "5h" }), {
      configuredSeconds: maximumSeconds,
      cookieSeconds: maximumSeconds,
      jwtSeconds: maximumSeconds,
    });

    const invalidConfigurations: TtlOverrides[] = [
      { TECPEY_SESSION_MAX_AGE_SECONDS: "299" },
      { TECPEY_SESSION_MAX_AGE_SECONDS: "14401" },
      { TECPEY_SESSION_MAX_AGE_SECONDS: "300.5" },
      { TECPEY_SESSION_MAX_AGE: "5h" },
      { TECPEY_SESSION_MAX_AGE: "invalid" },
      {
        TECPEY_SESSION_MAX_AGE_SECONDS: "300",
        TECPEY_SESSION_MAX_AGE: "5m",
      },
    ];
    for (const overrides of invalidConfigurations) {
      const child = validateProduction(overrides);
      assert.notEqual(child.status, 0, JSON.stringify(overrides));
    }
  });

  it("accepts only one valid 5-minute to 4-hour production configuration", () => {
    const validConfigurations: TtlOverrides[] = [
      { TECPEY_SESSION_MAX_AGE_SECONDS: "300" },
      { TECPEY_SESSION_MAX_AGE_SECONDS: "14400" },
      { TECPEY_SESSION_MAX_AGE: "5m" },
      { TECPEY_SESSION_MAX_AGE: "4h" },
    ];
    for (const overrides of validConfigurations) {
      const child = validateProduction(overrides);
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /TecPey environment validation passed/);
    }
  });
});
