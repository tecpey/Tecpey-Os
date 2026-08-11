import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const MAX_ENV_FILE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 24 * 1024;
const SOURCES = new Set([
  "protected_host_env_file",
  "service_manager_preloaded_environment",
]);
const FAILURE_KEY_PATTERN = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const PUBLIC_FAILURE_PATTERNS = [
  /^NEXT_PUBLIC_/,
  /^TECPEY_/,
  /^DATABASE_URL$/,
  /^REDIS_URL$/,
  /^UPSTASH_/,
  /^ACADEMY_LEADS_WEBHOOK_URL$/,
  /^AI_MENTOR_/,
  /^FEATURE_/,
  /^HSM_/,
  /^MPC_/,
  /^WALLET_/,
  /^CERTIFICATE_SIGNING_SECRET$/,
];

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function optionalAbsolutePath(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return "";
  return normalizeAbsolutePath(name, value);
}

function normalizeAbsolutePath(name, value) {
  const normalized = path.normalize(value);
  if (
    !path.isAbsolute(normalized) ||
    normalized === path.parse(normalized).root ||
    normalized.length > 500 ||
    normalized.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return normalized;
}

function releaseSha() {
  const value = required("TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA");
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("protected_staging_env_evidence_sha_invalid");
  }
  return value;
}

async function parseProtectedEnvFile(filePath) {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > MAX_ENV_FILE_BYTES) {
    throw new Error("protected_staging_env_file_unsafe");
  }
  const content = await readFile(filePath, "utf8");
  const values = {};
  const loadedKeys = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || loadedKeys.includes(match[1])) {
      throw new Error("protected_staging_env_file_format_invalid");
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value || value.includes("\0")) {
      throw new Error("protected_staging_env_file_value_invalid");
    }
    values[match[1]] = value;
    loadedKeys.push(match[1]);
  }
  if (loadedKeys.length === 0) {
    throw new Error("protected_staging_env_file_empty");
  }
  return {
    values,
    loadedKeyCount: loadedKeys.length,
    loadedKeyDigest: `sha256:${createHash("sha256").update(loadedKeys.sort().join("\n")).digest("hex")}`,
  };
}

function isAllowedFailureKey(name) {
  return PUBLIC_FAILURE_PATTERNS.some((pattern) => pattern.test(name));
}

function extractFailureKeys(output) {
  const matches = output.match(FAILURE_KEY_PATTERN) ?? [];
  return [...new Set(matches.filter(isAllowedFailureKey))].sort();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: "utf8",
        windowsHide: true,
        env: options.env,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: typeof error?.code === "number" ? error.code : 0,
          signal: error?.signal ?? null,
          output: `${stdout ?? ""}\n${stderr ?? ""}`.slice(0, MAX_OUTPUT_BYTES),
        });
      },
    );
  });
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function digestEvidence(evidence) {
  const clone = { ...evidence };
  delete clone.contentDigest;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(clone))).digest("hex")}`;
}

async function atomicWrite(filePath, content) {
  const parent = path.dirname(filePath);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("protected_staging_env_evidence_output_parent_unsafe");
  }
  if (await lstat(filePath).catch(() => null)) {
    throw new Error("protected_staging_env_evidence_output_exists");
  }
  const temporary = path.join(parent, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeEvidence(outputFile, evidence) {
  evidence.contentDigest = digestEvidence(evidence);
  const content = `${JSON.stringify(canonicalize(evidence), null, 2)}\n`;
  const digest = createHash("sha256").update(content).digest("hex");
  await atomicWrite(outputFile, content);
  await atomicWrite(`${outputFile}.sha256`, `${digest}  ${path.basename(outputFile)}\n`);
}

async function runProtectedHostEnvFileMode(context) {
  const envFile = normalizeAbsolutePath(
    "TECPEY_STAGING_ENV_FILE",
    required("TECPEY_STAGING_ENV_FILE"),
  );
  const parsed = await parseProtectedEnvFile(envFile);
  const result = await runCommand(context.npmBin, ["run", "env:check"], {
    cwd: context.appDir,
    timeoutMs: 180_000,
    env: {
      ...process.env,
      ...parsed.values,
      NODE_ENV: "production",
    },
  });
  return {
    commandResult: result,
    sourceProof: {
      disposition: "passed",
      envFileLoaded: true,
      loadedKeyCount: parsed.loadedKeyCount,
      loadedKeyDigest: parsed.loadedKeyDigest,
    },
  };
}

async function runServiceManagerMode() {
  const unit = required("TECPEY_STAGING_ENV_CHECK_UNIT");
  if (!/^[A-Za-z0-9_.@:-]{3,160}\.service$/.test(unit)) {
    throw new Error("protected_staging_env_check_unit_invalid");
  }
  const start = await runCommand("sudo", ["systemctl", "start", unit], { timeoutMs: 180_000 });
  const show = await runCommand(
    "sudo",
    [
      "systemctl",
      "show",
      unit,
      "--property=Result",
      "--property=ExecMainStatus",
      "--property=ExecMainCode",
      "--value",
    ],
    { timeoutMs: 30_000 },
  );
  const passed = start.ok && show.ok && /success|0/.test(show.output);
  return {
    commandResult: {
      ok: passed,
      code: passed ? 0 : 1,
      signal: null,
      output: show.output,
    },
    sourceProof: {
      disposition: passed ? "passed" : "failed",
      unitClass: "governed_env_check_unit",
      unitNameDigest: `sha256:${createHash("sha256").update(unit).digest("hex")}`,
    },
  };
}

async function main() {
  const outputFile = normalizeAbsolutePath(
    "TECPEY_STAGING_ENV_EVIDENCE_OUTPUT",
    required("TECPEY_STAGING_ENV_EVIDENCE_OUTPUT"),
  );
  const environmentSource = required("TECPEY_STAGING_ENV_EVIDENCE_SOURCE");
  if (!SOURCES.has(environmentSource)) {
    throw new Error("protected_staging_env_evidence_source_invalid");
  }
  const context = {
    selectedSha: releaseSha(),
    appDir: normalizeAbsolutePath("TECPEY_STAGING_APP_DIR", required("TECPEY_STAGING_APP_DIR")),
    npmBin: optionalAbsolutePath("TECPEY_STAGING_NPM_BIN") || "npm",
  };

  let result;
  try {
    result = environmentSource === "protected_host_env_file"
      ? await runProtectedHostEnvFileMode(context)
      : await runServiceManagerMode(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "protected_staging_env_evidence_failed";
    result = {
      commandResult: {
        ok: false,
        code: 1,
        signal: null,
        output: message,
      },
      sourceProof: {
        disposition: "failed",
      },
    };
  }

  const failedKeys = extractFailureKeys(result.commandResult.output);
  const evidence = {
    schemaVersion: 1,
    evidenceClass: "protected-staging-env-evidence-v1",
    environment: "staging",
    selectedSha: context.selectedSha,
    collectedAt: new Date().toISOString(),
    environmentSource,
    environmentSourceProofDisposition: result.sourceProof.disposition,
    envCheckDisposition: result.commandResult.ok ? "passed" : "failed",
    cspConnectionDisposition: result.commandResult.ok ? "passed" : "failed",
    failingKeyNamesOnly: failedKeys,
    sourceProof: result.sourceProof,
    rawOutputCaptured: false,
    privacyBoundary: {
      rawValuesUploaded: false,
      rawLogsUploaded: false,
      credentialBearingUrlsUploaded: false,
      hostIdentifiersUploaded: false,
    },
  };
  await writeEvidence(outputFile, evidence);
  if (!result.commandResult.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error && /^[a-z0-9._:-]{3,180}$/.test(error.message)
    ? error.message
    : "protected_staging_env_evidence_failed";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});