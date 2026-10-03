import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_STAGING_SMOKE_PATHS,
  assertSafeStagingPublicBaseUrl,
  validateSmokeResult,
} from "./staging-promotion-policy.mjs";

const [, , rawBaseUrl, rawOutputPath] = process.argv;
const baseUrl = assertSafeStagingPublicBaseUrl(rawBaseUrl ?? "");
if (!rawOutputPath || !path.isAbsolute(rawOutputPath)) {
  throw new Error("staging_smoke_output_path_must_be_absolute");
}

const results = [];
for (const smokePath of DEFAULT_STAGING_SMOKE_PATHS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("staging_smoke_timeout")), 12_000);
  try {
    const response = await fetch(new URL(smokePath, baseUrl), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "TecPey-Staging-Promotion-Smoke/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const result = {
      path: smokePath,
      finalStatus: response.status,
      finalUrl: response.url,
    };
    validateSmokeResult(result, baseUrl);
    results.push(result);
    await response.body?.cancel().catch(() => {});
  } finally {
    clearTimeout(timeout);
  }
}

await mkdir(path.dirname(rawOutputPath), { recursive: true, mode: 0o700 });
await writeFile(
  rawOutputPath,
  `${JSON.stringify({
    schemaVersion: 1,
    evidenceClass: "tecpey-staging-smoke-v1",
    publicOrigin: baseUrl,
    checkedAt: new Date().toISOString(),
    results,
  }, null, 2)}\n`,
  { mode: 0o600 },
);

process.stdout.write(
  `${JSON.stringify({ ok: true, origin: baseUrl, routeCount: results.length })}\n`,
);
