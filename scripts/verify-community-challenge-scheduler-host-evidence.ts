import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  verifyCommunityChallengeHostEvidence,
  type HostEvidenceEnvironment,
} from "../src/lib/ops/community-challenge-host-evidence";

const MAX_EVIDENCE_FILE_BYTES = 256 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function absolutePath(name: string): string {
  const value = required(name);
  if (
    !path.isAbsolute(value) ||
    path.normalize(value) === path.parse(path.normalize(value)).root ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return path.normalize(value);
}

function flag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`${name.toLowerCase()}_invalid`);
}

function boundedDuration(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

async function safeRead(filePath: string, maximumBytes: number): Promise<string> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 2 || stat.size > maximumBytes) {
    throw new Error("host_evidence_file_unsafe");
  }
  return readFile(filePath, "utf8");
}

function verifyFileDigest(
  evidencePath: string,
  content: string,
  digestContent: string,
): void {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]{1,200})\n?$/.exec(digestContent);
  if (!match || match[2] !== path.basename(evidencePath)) {
    throw new Error("host_evidence_file_digest_invalid");
  }
  const expected = Buffer.from(match[1], "hex");
  const actual = Buffer.from(createHash("sha256").update(content).digest("hex"), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("host_evidence_file_digest_mismatch");
  }
}

async function main(): Promise<void> {
  const evidencePath = absolutePath("TECPEY_EVIDENCE_FILE");
  const digestPath = `${evidencePath}.sha256`;
  const [content, digestContent] = await Promise.all([
    safeRead(evidencePath, MAX_EVIDENCE_FILE_BYTES),
    safeRead(digestPath, 512),
  ]);
  verifyFileDigest(evidencePath, content, digestContent);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("host_evidence_json_invalid");
  }
  const environment = required("TECPEY_EVIDENCE_EXPECTED_ENVIRONMENT");
  if (environment !== "staging" && environment !== "production") {
    throw new Error("host_evidence_expected_environment_invalid");
  }
  const result = verifyCommunityChallengeHostEvidence(raw, {
    expectedEnvironment: environment as HostEvidenceEnvironment,
    expectedReleaseSha: required("TECPEY_EVIDENCE_EXPECTED_SHA"),
    maxEvidenceAgeMs: boundedDuration(
      "TECPEY_EVIDENCE_MAX_AGE_MS",
      15 * 60_000,
      24 * 60 * 60_000,
    ),
    maxRunAgeMs: boundedDuration(
      "TECPEY_EVIDENCE_MAX_RUN_AGE_MS",
      2 * 60 * 60_000,
      7 * 24 * 60 * 60_000,
    ),
    requireAlertProbe: flag("TECPEY_EVIDENCE_REQUIRE_ALERT_PROBE"),
  });
  console.log(JSON.stringify({
    ok: true,
    environment: result.environment,
    releaseSha: result.releaseSha,
    collectedAt: result.collectedAt,
    latestRunCompletedAt: result.latestRunCompletedAt,
    alertProbeDelivered: result.alertProbeDelivered,
    evidenceFile: path.basename(evidencePath),
  }));
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
    ? error.message
    : "host_evidence_verification_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
