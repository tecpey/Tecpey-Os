const KEY = /^[A-Z_][A-Z0-9_]*$/;

const RESERVED_KEYS = Object.freeze([
  /^PATH$/,
  /^NODE_OPTIONS$/,
  /^NODE_PATH$/,
  /^LD_PRELOAD$/,
  /^LD_LIBRARY_PATH$/,
  /^BASH_ENV$/,
  /^ENV$/,
  /^SHELLOPTS$/,
  /^GITHUB_/,
  /^RUNNER_/,
  /^ACTIONS_/,
  /^NPM_CONFIG_/,
  /^TECPEY_ENV_VALIDATION_SOURCE$/,
  /^TECPEY_PREFLIGHT_/,
  /^TECPEY_BUILD_COMMIT_SHA$/,
  /^TECPEY_IMMUTABLE_BUILD_COMMIT_SHA$/,
  /^TECPEY_PROMOTION_/,
  /^TECPEY_STAGING_/,
]);

export function parseProtectedRuntimeEnvSource(source) {
  if (typeof source !== "string" || source.length < 1 || source.length > 128 * 1024) {
    throw new Error("protected_runtime_env_source_invalid");
  }
  const values = {};
  const keys = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !KEY.test(match[1]) || keys.includes(match[1])) {
      throw new Error("protected_runtime_env_format_invalid");
    }
    const key = match[1];
    if (RESERVED_KEYS.some((pattern) => pattern.test(key))) {
      throw new Error("protected_runtime_env_reserved_key");
    }
    let value = match[2].trim();
    const singleQuoted = value.startsWith("'") && value.endsWith("'");
    const doubleQuoted = value.startsWith('"') && value.endsWith('"');
    if (singleQuoted || doubleQuoted) value = value.slice(1, -1);
    if (!value || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
      throw new Error("protected_runtime_env_value_invalid");
    }
    values[key] = value;
    keys.push(key);
  }
  if (keys.length === 0) throw new Error("protected_runtime_env_empty");
  return Object.freeze({
    values: Object.freeze({ ...values }),
    keys: Object.freeze([...keys].sort()),
  });
}

export function validateProtectedRuntimeEnvFileStat(stat, {
  expectedUid,
  expectedGid,
} = {}) {
  if (
    !stat ||
    typeof stat.isFile !== "function" ||
    typeof stat.isSymbolicLink !== "function" ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    !Number.isInteger(stat.size) ||
    stat.size < 1 ||
    stat.size > 128 * 1024
  ) {
    throw new Error("protected_runtime_env_file_unsafe");
  }

  const mode = stat.mode & 0o777;
  if (
    (mode & 0o007) !== 0 ||
    (mode & 0o030) !== 0 ||
    (mode & 0o111) !== 0
  ) {
    throw new Error("protected_runtime_env_permissions_unsafe");
  }

  if (!Number.isInteger(expectedUid) || expectedUid < 0 ||
      !Number.isInteger(expectedGid) || expectedGid < 0) {
    throw new Error("protected_runtime_env_expected_identity_invalid");
  }

  if (![0, expectedUid].includes(stat.uid)) {
    throw new Error("protected_runtime_env_owner_invalid");
  }
  if ((mode & 0o040) !== 0 && stat.gid !== expectedGid) {
    throw new Error("protected_runtime_env_group_read_identity_invalid");
  }
  return true;
}

export function buildProtectedRuntimeEnvironment(baseEnv, protectedValues) {
  if (!baseEnv || typeof baseEnv !== "object" ||
      !protectedValues || typeof protectedValues !== "object") {
    throw new Error("protected_runtime_env_build_input_invalid");
  }
  for (const key of Object.keys(protectedValues)) {
    if (!KEY.test(key) || RESERVED_KEYS.some((pattern) => pattern.test(key))) {
      throw new Error("protected_runtime_env_reserved_key");
    }
  }
  return {
    ...baseEnv,
    ...protectedValues,
    NODE_ENV: "production",
    TECPEY_ENV_VALIDATION_SOURCE: "process",
  };
}
