import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

function functionBody(source: string, name: string, nextName: string): string {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must precede ${nextName}`);
  return source.slice(start, end);
}

describe("Academy service-worker cache policy", () => {
  it("never precaches authentication documents", async () => {
    const source = await readFile("public/sw.js", "utf8");
    const shellStart = source.indexOf("const APP_SHELL = [");
    const shellEnd = source.indexOf("];", shellStart);
    const shell = source.slice(shellStart, shellEnd);

    assert.ok(shellStart >= 0 && shellEnd > shellStart);
    assert.match(shell, /OFFLINE_FALLBACK/);
    assert.doesNotMatch(shell, /academy\/(?:login|signup)/);
  });

  it("uses network-first without caching Academy navigation responses", async () => {
    const source = await readFile("public/sw.js", "utf8");
    const navigation = functionBody(
      source,
      "handleAcademyNavigation",
      "handleStaticAsset",
    );

    assert.match(source, /request\.mode === 'navigate'/);
    assert.match(source, /\^\\\/\(\?:en\\\/\)\?academy/);
    assert.ok(navigation.indexOf("fetch(request)") >= 0);
    assert.ok(
      navigation.indexOf("fetch(request)") < navigation.indexOf("caches.match"),
      "the offline fallback must only run after the network attempt",
    );
    assert.doesNotMatch(navigation, /cache\.put|caches\.open/);
  });

  it("rotates only TecPey-owned caches and forces worker update checks", async () => {
    const [worker, client] = await Promise.all([
      readFile("public/sw.js", "utf8"),
      readFile("src/components/offline/OfflineSyncManager.tsx", "utf8"),
    ]);

    assert.match(worker, /CACHE_NAME = `\$\{CACHE_PREFIX\}v2`/);
    assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
    assert.match(
      client,
      /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/,
    );
    assert.match(client, /registration\) => registration\.update\(\)/);
  });

  it("serves the worker and auth documents with explicit no-store headers", async () => {
    const config = await readFile("next.config.ts", "utf8");

    assert.match(config, /source: "\/sw\.js"/);
    assert.match(config, /value: "no-cache, no-store, must-revalidate"/);
    for (const path of [
      "/academy/login",
      "/academy/signup",
      "/en/academy/login",
      "/en/academy/signup",
    ]) {
      assert.ok(config.includes(`"${path}"`), `${path} must be no-store`);
    }
    assert.match(
      config,
      /private, no-cache, no-store, max-age=0, must-revalidate/,
    );
  });
});
