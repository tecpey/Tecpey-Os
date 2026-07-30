import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const MAX_HEALTH_RESPONSE_BYTES = 64 * 1024;
const exactCommitPattern = /^[0-9a-f]{40}$/;

function healthUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("health_url_must_use_https_or_loopback_http");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("health_url_must_not_contain_credentials_query_or_fragment");
  }
  if (parsed.pathname.replace(/\/$/, "") !== "/api/health") {
    throw new Error("health_url_must_target_readiness_endpoint");
  }
  return parsed;
}

async function readBoundedBody(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_HEALTH_RESPONSE_BYTES
  ) {
    throw new Error("health_response_too_large");
  }
  if (!response.body) throw new Error("health_response_body_missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HEALTH_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("health_response_too_large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function assertReadiness(payload, expectedCommit) {
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.ok !== true ||
    payload.health !== "ok" ||
    payload.checks?.database !== "ok" ||
    payload.checks?.schema !== "current" ||
    payload.checks?.redis !== "ok" ||
    payload.checks?.runtime !== "ready" ||
    !["ready", "disabled"].includes(payload.checks?.requiredWorkers)
  ) {
    throw new Error("health_readiness_contract_failed");
  }
  if (expectedCommit) {
    if (!exactCommitPattern.test(expectedCommit)) {
      throw new Error("expected_build_commit_must_be_exact_sha");
    }
    if (payload.build?.commit !== expectedCommit) {
      throw new Error("health_build_identity_mismatch");
    }
  }
}

export async function checkHealthReadiness({
  url = process.env.TECPEY_HEALTH_URL ?? "http://127.0.0.1:3000/api/health",
  expectedCommit = process.env.TECPEY_EXPECTED_BUILD_COMMIT_SHA?.trim(),
} = {}) {
  const response = await fetch(healthUrl(url), {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`health_http_status_${response.status}`);

  let payload;
  try {
    payload = JSON.parse(await readBoundedBody(response));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("health_response_invalid_json");
    throw error;
  }
  assertReadiness(payload, expectedCommit);
  return payload;
}

async function main() {
  try {
    console.log(JSON.stringify(await checkHealthReadiness(), null, 2));
  } catch (error) {
    console.error(
      `Health readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main();
}
