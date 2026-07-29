import { execFileSync } from "node:child_process";

const exactCommitPattern = /^[0-9a-f]{40}$/;
const localSourceArchiveBuild = "unverified-local-source-archive";

export function resolveImmutableBuildCommit(): string {
  const configured = process.env.TECPEY_BUILD_COMMIT_SHA?.trim();
  if (configured) {
    if (!exactCommitPattern.test(configured)) {
      throw new Error("TECPEY_BUILD_COMMIT_SHA must be an exact lowercase 40-character Git SHA");
    }
    return configured;
  }

  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!exactCommitPattern.test(commit)) {
      throw new Error("Git HEAD is not an exact lowercase 40-character SHA");
    }
    return commit;
  } catch {
    if (process.env.TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD?.trim() === "1") {
      return localSourceArchiveBuild;
    }
    throw new Error(
      "Build identity is unavailable: set TECPEY_BUILD_COMMIT_SHA to the exact release SHA, " +
        "or set TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 only for an unverified local source-archive build",
    );
  }
}
