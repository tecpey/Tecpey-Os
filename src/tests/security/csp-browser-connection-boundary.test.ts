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

test("the live price chart uses the governed Socket.IO ticker contract", () => {
  const source = readFileSync(
    "src/components/crypto/LivePriceChart.tsx",
    "utf8",
  );

  assert.match(source, /import\s+\{\s*socket\s*\}\s+from\s+"@\/lib\/socket"/u);
  assert.match(source, /socket\.on\(\s*"pair:price"/u);
  assert.match(source, /socket\.emit\(\s*"subscribe:pair:price"/u);
  assert.match(source, /socket\.emit\(\s*"unsubscribe:pair:price"/u);
  assert.doesNotMatch(source, /\bnew\s+WebSocket\s*\(/u);
});
