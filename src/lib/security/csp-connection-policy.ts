export type CspConnectionEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type CspRuntimeMode = "development" | "test" | "production";

const API_BACKEND_ENV = "NEXT_PUBLIC_API_BACKEND_URL";
const API_SOCKET_ENV = "NEXT_PUBLIC_API_SOCKET_URL";
const EXTRA_CONNECT_ENV = "NEXT_PUBLIC_EXTRA_CONNECT_SRC";

const PLACEHOLDER_PATTERNS = [
  /change[_-]?me/iu,
  /placeholder/iu,
  /replace[_-]?with/iu,
  /your[-_ ]?real/iu,
];

const DEVELOPMENT_FALLBACK_SOURCES = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "ws://localhost:*",
  "ws://127.0.0.1:*",
] as const;

function policyError(name: string, reason: string): Error {
  return new Error(`csp_connection_policy_invalid:${name}:${reason}`);
}

function runtimeMode(env: CspConnectionEnvironment): CspRuntimeMode {
  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "test") return "test";
  return "development";
}

function assertUnambiguousAscii(name: string, value: string): void {
  if (value !== value.trim()) throw policyError(name, "surrounding_whitespace");
  if (!/^[\x21-\x7e]+$/u.test(value)) {
    throw policyError(name, "non_ascii_or_whitespace");
  }
  if (value.includes("\\")) throw policyError(name, "backslash_forbidden");
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
    throw policyError(name, "placeholder");
  }
}

type ParseOriginOptions = {
  allowedProtocols: ReadonlySet<string>;
  allowPath: boolean;
};

function parseOrigin(
  name: string,
  rawValue: string,
  options: ParseOriginOptions,
): string {
  assertUnambiguousAscii(name, rawValue);

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw policyError(name, "malformed_url");
  }

  if (!options.allowedProtocols.has(url.protocol)) {
    throw policyError(name, `scheme_${url.protocol.replace(":", "") || "missing"}`);
  }
  if (!url.hostname) throw policyError(name, "hostname_missing");
  if (url.username || url.password) throw policyError(name, "credentials_forbidden");
  if (url.search) throw policyError(name, "query_forbidden");
  if (url.hash) throw policyError(name, "fragment_forbidden");
  if (!options.allowPath && url.pathname !== "/") {
    throw policyError(name, "path_forbidden");
  }

  return url.origin;
}

function requiredValue(
  env: CspConnectionEnvironment,
  name: string,
  mode: CspRuntimeMode,
): string | null {
  const value = env[name];
  if (value && value.trim()) return value;
  if (mode === "production") throw policyError(name, "missing");
  return null;
}

function configuredSource(
  env: CspConnectionEnvironment,
  name: string,
  mode: CspRuntimeMode,
  kind: "backend" | "socket",
): string | null {
  const value = requiredValue(env, name, mode);
  if (!value) return null;

  const production = mode === "production";
  const allowedProtocols =
    kind === "backend"
      ? new Set(production ? ["https:"] : ["http:", "https:"])
      : new Set(production ? ["wss:"] : ["ws:", "wss:"]);

  return parseOrigin(name, value, {
    allowedProtocols,
    allowPath: kind === "socket",
  });
}

function extraSources(
  env: CspConnectionEnvironment,
  mode: CspRuntimeMode,
): string[] {
  const raw = env[EXTRA_CONNECT_ENV];
  if (!raw || !raw.trim()) return [];
  if (
    raw !== raw.trim() ||
    !/^[\x21-\x7e]+(?: +[\x21-\x7e]+)*$/u.test(raw)
  ) {
    throw policyError(EXTRA_CONNECT_ENV, "ambiguous_whitespace");
  }

  const allowedProtocols = new Set(
    mode === "production"
      ? ["https:", "wss:"]
      : ["http:", "https:", "ws:", "wss:"],
  );

  return raw
    .split(/ +/u)
    .map((value, index) =>
      parseOrigin(`${EXTRA_CONNECT_ENV}[${index}]`, value, {
        allowedProtocols,
        allowPath: false,
      }),
    )
    .sort();
}

export function getCspConnectionSources(
  env: CspConnectionEnvironment = process.env,
): string[] {
  const mode = runtimeMode(env);
  const sources = new Set<string>(["'self'"]);
  const backend = configuredSource(env, API_BACKEND_ENV, mode, "backend");
  const socket = configuredSource(env, API_SOCKET_ENV, mode, "socket");

  if (backend) sources.add(backend);
  if (socket) sources.add(socket);
  if (!backend && !socket && mode !== "production") {
    for (const source of DEVELOPMENT_FALLBACK_SOURCES) sources.add(source);
  }
  for (const source of extraSources(env, mode)) sources.add(source);

  return [...sources];
}

export function buildCspConnectSrc(
  env: CspConnectionEnvironment = process.env,
): string {
  return `connect-src ${getCspConnectionSources(env).join(" ")}`;
}

export function assertCspConnectionEnvironment(
  env: CspConnectionEnvironment = process.env,
): void {
  getCspConnectionSources(env);
}
