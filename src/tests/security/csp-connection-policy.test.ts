import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCspConnectionEnvironment,
  buildCspConnectSrc,
  getCspConnectionSources,
  type CspConnectionEnvironment,
} from "@/lib/security/csp-connection-policy";

function productionEnv(
  overrides: CspConnectionEnvironment = {},
): CspConnectionEnvironment {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.tecpey.ir/spot",
    ...overrides,
  };
}

test("production policy emits explicit normalized origins in deterministic order", () => {
  const env = productionEnv({
    NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir:443",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.tecpey.ir:443/spot",
    NEXT_PUBLIC_EXTRA_CONNECT_SRC:
      "wss://events.tecpey.ir https://analytics.tecpey.ir https://api.tecpey.ir",
  });

  assert.deepEqual(getCspConnectionSources(env), [
    "'self'",
    "https://api.tecpey.ir",
    "wss://stream.tecpey.ir",
    "https://analytics.tecpey.ir",
    "wss://events.tecpey.ir",
  ]);
  assert.equal(
    buildCspConnectSrc(env),
    "connect-src 'self' https://api.tecpey.ir wss://stream.tecpey.ir https://analytics.tecpey.ir wss://events.tecpey.ir",
  );
});

test("production policy requires both backend and socket origins", () => {
  assert.throws(
    () =>
      assertCspConnectionEnvironment(
        productionEnv({ NEXT_PUBLIC_API_BACKEND_URL: "" }),
      ),
    /NEXT_PUBLIC_API_BACKEND_URL:missing/,
  );
  assert.throws(
    () =>
      assertCspConnectionEnvironment(
        productionEnv({ NEXT_PUBLIC_API_SOCKET_URL: undefined }),
      ),
    /NEXT_PUBLIC_API_SOCKET_URL:missing/,
  );
});

test("production policy rejects malformed, placeholder and downgraded origins", () => {
  for (const backend of [
    "not-a-url",
    "https://CHANGE_ME.invalid",
    "https://api-placeholder.tecpey.ir",
    "http://api.tecpey.ir",
  ]) {
    assert.throws(() =>
      getCspConnectionSources(
        productionEnv({ NEXT_PUBLIC_API_BACKEND_URL: backend }),
      ),
    );
  }

  for (const socket of [
    "not-a-url",
    "wss://REPLACE_WITH_SOCKET.invalid/ws",
    "wss://socket-placeholder.tecpey.ir/ws",
    "ws://stream.tecpey.ir/spot",
  ]) {
    assert.throws(() =>
      getCspConnectionSources(
        productionEnv({ NEXT_PUBLIC_API_SOCKET_URL: socket }),
      ),
    );
  }
});

test("production policy rejects credentials and URL components outside the origin contract", () => {
  assert.throws(
    () =>
      getCspConnectionSources(
        productionEnv({
          NEXT_PUBLIC_API_BACKEND_URL: "https://user:secret@api.tecpey.ir",
        }),
      ),
    /credentials_forbidden/,
  );
  assert.throws(
    () =>
      getCspConnectionSources(
        productionEnv({
          NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir/v1",
        }),
      ),
    /path_forbidden/,
  );
  assert.throws(
    () =>
      getCspConnectionSources(
        productionEnv({
          NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.tecpey.ir/spot?token=secret",
        }),
      ),
    /query_forbidden/,
  );
  assert.throws(
    () =>
      getCspConnectionSources(
        productionEnv({
          NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.tecpey.ir/spot#fragment",
        }),
      ),
    /fragment_forbidden/,
  );
});

test("extra sources accept only exact origins and reject CSP token injection", () => {
  for (const extra of [
    "*",
    "https:",
    "data:",
    "'unsafe-inline'",
    "https://extra.tecpey.ir/path",
    "https://extra.tecpey.ir?query=secret",
    "https://user:secret@extra.tecpey.ir",
    "http://extra.tecpey.ir",
    "ws://extra.tecpey.ir",
  ]) {
    assert.throws(() =>
      getCspConnectionSources(
        productionEnv({ NEXT_PUBLIC_EXTRA_CONNECT_SRC: extra }),
      ),
    );
  }
});

test("ambiguous whitespace and Unicode edge cases fail closed", () => {
  for (const backend of [
    " https://api.tecpey.ir",
    "https://api.tecpey.ir ",
    "https://api.tecpey.ir\u200b",
    "https://api\u00a0.tecpey.ir",
    "https://api.tecpey.ir\\@blocked.example",
  ]) {
    assert.throws(() =>
      getCspConnectionSources(
        productionEnv({ NEXT_PUBLIC_API_BACKEND_URL: backend }),
      ),
    );
  }

  assert.throws(
    () =>
      getCspConnectionSources(
        productionEnv({
          NEXT_PUBLIC_EXTRA_CONNECT_SRC:
            "https://one.tecpey.ir\u200b https://two.tecpey.ir",
        }),
      ),
    /ambiguous_whitespace/,
  );
  for (const extra of [
    "https://one.tecpey.ir\thttps://two.tecpey.ir",
    "https://one.tecpey.ir\u00a0https://two.tecpey.ir",
  ]) {
    assert.throws(
      () =>
        getCspConnectionSources(
          productionEnv({ NEXT_PUBLIC_EXTRA_CONNECT_SRC: extra }),
        ),
      /ambiguous_whitespace/,
    );
  }
});

test("development has an explicit loopback policy without broad scheme sources", () => {
  const sources = getCspConnectionSources({
    NODE_ENV: "development",
    NEXT_PUBLIC_API_BACKEND_URL: "",
    NEXT_PUBLIC_API_SOCKET_URL: "",
  });

  assert.deepEqual(sources, [
    "'self'",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "ws://localhost:*",
    "ws://127.0.0.1:*",
  ]);
  assert.equal(sources.includes("https:"), false);
  assert.equal(sources.includes("http:"), false);
  assert.equal(sources.includes("wss:"), false);
  assert.equal(sources.includes("ws:"), false);
});

test("development permits explicitly configured local plaintext origins", () => {
  assert.deepEqual(
    getCspConnectionSources({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BACKEND_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_API_SOCKET_URL: "ws://localhost:3000/ws",
    }),
    ["'self'", "http://127.0.0.1:3000", "ws://localhost:3000"],
  );
});
