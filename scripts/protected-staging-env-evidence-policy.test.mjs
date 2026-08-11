import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const SELECTED_SHA = "7390afa2ba8509d0f46733b98d966928cb07b231";

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

function acceptedEvidence(overrides = {}) {
  const evidence = {
    schemaVersion: 1,
    evidenceClass: "protected-staging-env-evidence-v1",
    environment: "staging",
    selectedSha: SELECTED_SHA,
    collectedAt: "2026-08-11T10:00:00.000Z",
    environmentSource: "protected_host_env_file",
    environmentSourceProofDisposition: "passed",
    envCheckDisposition: "passed",
    cspConnectionDisposition: "passed",
    failingKeyNamesOnly: [],
    sourceProof: {
      disposition: "passed",
      envFileLoaded: true,
      loadedKeyCount: 18,
      loadedKeyDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    rawOutputCaptured: false,
    privacyBoundary: {
      rawValuesUploaded: false,
      rawLogsUploaded: false,
      credentialBearingUrlsUploaded: false,
      hostIdentifiersUploaded: false,
    },
    ...overrides,
  };
  evidence.contentDigest = digestEvidence(evidence);
  return canonicalize(evidence);
}

async function writeEvidence(directory, evidence) {
  const filePath = path.join(directory, "tecpey-staging-env-evidence.json");
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(filePath, content, { mode: 0o600 });
  await writeFile(
    `${filePath}.sha256`,
    `${createHash("sha256").update(content).digest("hex")}  ${path.basename(filePath)}\n`,
    { mode: 0o600 },
  );
  return filePath;
}

function runVerifier(filePath) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["scripts/verify-protected-staging-env-evidence.mjs"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TECPEY_STAGING_ENV_EVIDENCE_FILE: filePath,
          TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA: SELECTED_SHA,
        },
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

test("protected staging env evidence verifier accepts redacted passing evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tecpey-env-evidence-"));
  try {
    await mkdir(path.join(directory, "nested"));
    const filePath = await writeEvidence(path.join(directory, "nested"), acceptedEvidence());
    const result = await runVerifier(filePath);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /"ok":true/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protected staging env evidence verifier rejects failed env checks", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tecpey-env-evidence-"));
  try {
    const filePath = await writeEvidence(directory, acceptedEvidence({
      envCheckDisposition: "failed",
      cspConnectionDisposition: "failed",
      failingKeyNamesOnly: ["DATABASE_URL"],
    }));
    const result = await runVerifier(filePath);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /protected_staging_env_evidence_not_accepted/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protected staging env evidence verifier rejects sensitive material", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tecpey-env-evidence-"));
  try {
    const filePath = await writeEvidence(directory, acceptedEvidence({
      sourceProof: {
        disposition: "passed",
        leaked: "postgres://user:pass@example.invalid/db",
      },
    }));
    const result = await runVerifier(filePath);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /protected_staging_env_evidence_sensitive_material/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protected staging env evidence authority accepts governed workflow wiring", async () => {
  const result = await new Promise((resolve) => {
    execFile(
      process.execPath,
      ["scripts/check-protected-staging-env-evidence-authority.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
});

test("collector writes only redacted failed evidence when env file is unsafe", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tecpey-env-evidence-"));
  try {
    const output = path.join(directory, "tecpey-staging-env-evidence.json");
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        ["scripts/collect-protected-staging-env-evidence.mjs"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA: SELECTED_SHA,
            TECPEY_STAGING_ENV_EVIDENCE_SOURCE: "protected_host_env_file",
            TECPEY_STAGING_ENV_EVIDENCE_OUTPUT: output,
            TECPEY_STAGING_APP_DIR: process.cwd(),
            TECPEY_STAGING_ENV_FILE: path.join(directory, "missing.env"),
          },
          encoding: "utf8",
        },
        (error, stdout, stderr) => {
          resolve({
            code: typeof error?.code === "number" ? error.code : 0,
            stdout,
            stderr,
          });
        },
      );
    });
    assert.notEqual(result.code, 0);
    const content = await readFile(output, "utf8");
    assert.match(content, /"envCheckDisposition": "failed"/);
    assert.doesNotMatch(content, /postgres:\/\//);
    assert.doesNotMatch(content, /BEGIN PRIVATE KEY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});