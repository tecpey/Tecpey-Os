import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

test("client components contain no direct WebSocket provider origins", () => {
  for (const path of sourceFiles("src")) {
    const source = readFileSync(path, "utf8");
    const trimmed = source.trimStart();
    if (
      !trimmed.startsWith('"use client"') &&
      !trimmed.startsWith("'use client'")
    ) {
      continue;
    }

    assert.doesNotMatch(
      source,
      /\bwss?:\/\//iu,
      `${path} must use the owned NEXT_PUBLIC_API_SOCKET_URL boundary`,
    );
  }
});
