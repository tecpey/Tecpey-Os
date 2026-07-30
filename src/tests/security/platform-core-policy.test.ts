import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPlatformCore,
  platformCoreFindings,
} from "../../../scripts/platform-core-policy.mjs";
import {
  getAllFlags,
  isFeatureEnabled,
} from "../../lib/feature-flags";
import { shouldUseSecureCookie } from "../../lib/platform-config";
import { PRODUCTS } from "../../lib/product-registry";

async function productionSources() {
  const [
    featureFlags,
    platformConfig,
    platformTypes,
    productRegistry,
    unifiedSession,
    authSessionAuthority,
  ] = await Promise.all([
      readFile("src/lib/feature-flags.ts", "utf8"),
      readFile("src/lib/platform-config.ts", "utf8"),
      readFile("src/lib/platform-types.ts", "utf8"),
      readFile("src/lib/product-registry.ts", "utf8"),
      readFile("src/lib/unified-session.ts", "utf8"),
      readFile("scripts/check-auth-session-authority.mjs", "utf8"),
    ]);
  return {
    featureFlags,
    platformConfig,
    platformTypes,
    productRegistry,
    unifiedSession,
    authSessionAuthority,
  };
}

function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("platform core authority", () => {
  it("accepts the governed platform sources", async () => {
    const sources = await productionSources();
    assert.doesNotThrow(() => assertPlatformCore(sources));
  });

  it("fails malformed configured feature flags closed", () => {
    withEnvironment({ FEATURE_ACADEMY_ENABLED: undefined }, () => {
      assert.equal(isFeatureEnabled("academy.enabled"), true);
    });
    withEnvironment({ FEATURE_ACADEMY_ENABLED: "true" }, () => {
      assert.equal(isFeatureEnabled("academy.enabled"), true);
    });
    withEnvironment({ FEATURE_ACADEMY_ENABLED: "false" }, () => {
      assert.equal(isFeatureEnabled("academy.enabled"), false);
    });
    for (const malformed of ["TRUE", "1", "", " false"]) {
      withEnvironment({ FEATURE_ACADEMY_ENABLED: malformed }, () => {
        assert.equal(isFeatureEnabled("academy.enabled"), false);
      });
    }
  });

  it("keeps production cookies secure regardless of an insecure override", () => {
    withEnvironment(
      {
        NODE_ENV: "production",
        TECPEY_COOKIE_SECURE: "false",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      },
      () => assert.equal(shouldUseSecureCookie(), true),
    );
    withEnvironment(
      {
        NODE_ENV: "development",
        TECPEY_COOKIE_SECURE: "false",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      },
      () => assert.equal(shouldUseSecureCookie(), false),
    );
  });

  it("derives every product state from its declared feature flag", () => {
    withEnvironment(
      {
        FEATURE_ACADEMY_ENABLED: "false",
        FEATURE_EXCHANGE_ENABLED: "false",
        FEATURE_SOCIAL_ENABLED: "false",
        FEATURE_MENTOR_ENABLED: "false",
        FEATURE_MARKETPLACE_ENABLED: "false",
      },
      () => {
        const enabled = new Set(
          Object.values(PRODUCTS)
            .filter((product) => product.isEnabled())
            .map((product) => product.id),
        );
        assert.deepEqual(enabled, new Set(["knowledge"]));
        assert.deepEqual(
          getAllFlags(),
          {
            "academy.enabled": false,
            "exchange.enabled": false,
            "social.enabled": false,
            "mentor.enabled": false,
            "future.marketplace.enabled": false,
          },
        );
      },
    );
  });

  it("issues access JWTs with one exact timestamp across a forced clock boundary", () => {
    const script = `
      const NativeDate = Date;
      let wallClock = 2_000_000_000_000;
      class AdvancingDate extends NativeDate {
        constructor(...args) {
          if (args.length > 0) super(...args);
          else {
            super(wallClock);
            wallClock += 1_000;
          }
        }
        static now() {
          const current = wallClock;
          wallClock += 1_000;
          return current;
        }
      }
      globalThis.Date = AdvancingDate;
      const joseModule = await import("jose");
      const sessionModule = await import("./src/lib/unified-session.ts");
      const decodeJwt = joseModule.decodeJwt ?? joseModule.default?.decodeJwt;
      const signUnifiedSession =
        sessionModule.signUnifiedSession ?? sessionModule.default?.signUnifiedSession;
      if (!decodeJwt || typeof signUnifiedSession !== "function") {
        throw new TypeError("platform core JWT test imports unavailable");
      }
      const token = await signUnifiedSession({
        accountId: "platform-core-account",
        studentId: null,
        email: "platform-core@tecpey.invalid",
        displayName: "Platform Core",
        username: "platform-core",
      });
      const payload = decodeJwt(token);
      console.log("TTL_RESULT=" + (Number(payload.exp) - Number(payload.iat)));
    `;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "test",
          TECPEY_SESSION_SECRET:
            "platform-core-session-secret-with-at-least-32-characters",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /TTL_RESULT=14400(?:\r?\n|$)/u);
  });

  it("rejects weakened platform boundaries", async () => {
    const sources = await productionSources();
    for (const [mutated, expected] of [
      [
        {
          ...sources,
          featureFlags: sources.featureFlags.replace(
            "return false;\n}",
            "return config.defaultEnabled;\n}",
          ),
        },
        /Malformed configured feature flags/u,
      ],
      [
        {
          ...sources,
          platformConfig: sources.platformConfig.replace(
            'if (process.env.NODE_ENV === "production") return true;',
            "",
          ),
        },
        /Production cookie security/u,
      ],
      [
        {
          ...sources,
          unifiedSession: sources.unifiedSession.replace(
            ".setExpirationTime(issuedAt + sessionMaxAgeSeconds())",
            ".setExpirationTime(sessionMaxAge())",
          ),
        },
        /Unified-session timestamp authority[\s\S]*second implicit wall-clock/u,
      ],
      [
        {
          ...sources,
          platformConfig: `${sources.platformConfig}
export function sessionMaxAge(): string {
  return \`\${sessionMaxAgeSeconds()}s\`;
}
`,
        },
        /relative JWT duration/u,
      ],
      [
        {
          ...sources,
          authSessionAuthority: sources.authSessionAuthority.replace(
            ".setExpirationTime(issuedAt + sessionMaxAgeSeconds())",
            ".setExpirationTime(sessionMaxAge())",
          ),
        },
        /Authentication session checker[\s\S]*issuedAt \+ sessionMaxAgeSeconds/u,
      ],
      [
        {
          ...sources,
          productRegistry: sources.productRegistry.replace(
            "academy: defineProduct({",
            "academy: {",
          ),
        },
        /Product registry identity/u,
      ],
    ] as const) {
      assert.match(platformCoreFindings(mutated).join("\n"), expected);
    }
  });
});
