import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("production build materializes fresh organic-growth snapshots before Next build", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };

  assert.equal(
    packageJson.scripts?.prebuild,
    "npm run coins:growth:materialize && npm run tools:growth:materialize",
  );
  assert.match(packageJson.scripts?.build ?? "", /^next build && npm run build:server$/);
});
