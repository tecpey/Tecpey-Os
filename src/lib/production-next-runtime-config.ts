import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const exactCommitPattern = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readBakedNextRuntimeConfig(
  projectDirectory = process.cwd(),
): Record<string, unknown> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      readFileSync(
        resolve(projectDirectory, ".next", "required-server-files.json"),
        "utf8",
      ),
    );
  } catch {
    throw new Error("next_runtime_config_manifest_unavailable");
  }

  if (!isRecord(manifest) || !isRecord(manifest.config)) {
    throw new Error("next_runtime_config_manifest_invalid");
  }

  const environment = manifest.config.env;
  const commit = isRecord(environment)
    ? environment.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA
    : undefined;
  if (typeof commit !== "string" || !exactCommitPattern.test(commit)) {
    throw new Error("next_runtime_config_commit_invalid");
  }

  return manifest.config;
}

export function installBakedNextRuntimeConfig(
  projectDirectory = process.cwd(),
): void {
  const config = readBakedNextRuntimeConfig(projectDirectory);

  // Next.js production startup normally evaluates next.config.ts again. A
  // governed source-archive release intentionally has no Git metadata, so use
  // the complete config serialized by the exact build instead. Overwrite any
  // inherited private value so the runtime cannot select another build config.
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
}
