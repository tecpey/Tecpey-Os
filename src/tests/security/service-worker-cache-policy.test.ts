import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import vm from "node:vm";

type WorkerRequest = {
  cache?: string;
  method?: string;
  mode?: string;
  redirect?: string;
  url: string;
};

async function serviceWorkerHarness(options?: {
  fetch?: (request: WorkerRequest) => Promise<unknown>;
  keys?: string[];
  match?: (request: string | WorkerRequest) => Promise<unknown>;
}) {
  const source = await readFile("public/sw.js", "utf8");
  const listeners = new Map<string, (event: unknown) => void>();
  const cached: Array<{ request: WorkerRequest; response: unknown }> = [];
  const deleted: string[] = [];

  class RelativeRequest implements WorkerRequest {
    cache?: string;
    method: string;
    mode?: string;
    redirect?: string;
    url: string;

    constructor(path: string, init: Record<string, string> = {}) {
      this.url = new URL(path, "https://tecp.ir/sw.js").href;
      this.method = init.method || "GET";
      this.cache = init.cache;
      this.redirect = init.redirect;
    }
  }

  const cache = {
    put: async (request: WorkerRequest, response: unknown) => {
      cached.push({ request, response });
    },
  };
  const caches = {
    delete: async (key: string) => {
      deleted.push(key);
      return true;
    },
    keys: async () => options?.keys || [],
    match: async (request: string | WorkerRequest) => options?.match?.(request),
    open: async () => cache,
  };
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    },
    clients: { claim: () => undefined },
    location: { origin: "https://tecp.ir" },
    skipWaiting: () => undefined,
  };

  vm.runInNewContext(source, {
    Error,
    Promise,
    Request: RelativeRequest,
    Response,
    URL,
    caches,
    fetch: options?.fetch || (async () => new Response("ok")),
    self,
  });

  return { cached, deleted, listeners };
}

async function dispatchExtendable(
  listener: ((event: unknown) => void) | undefined,
): Promise<void> {
  assert.ok(listener, "service-worker listener must exist");
  let work: Promise<unknown> | undefined;
  listener({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
  assert.ok(work, "listener must register extendable work");
  await work;
}

async function dispatchNavigation(
  listener: ((event: unknown) => void) | undefined,
  path: string,
): Promise<unknown> {
  assert.ok(listener, "fetch listener must exist");
  let response: Promise<unknown> | undefined;
  listener({
    request: {
      method: "GET",
      mode: "navigate",
      url: `https://tecp.ir${path}`,
    },
    respondWith: (promise: Promise<unknown>) => { response = promise; },
  });
  assert.ok(response, "Academy navigation must be intercepted");
  return response;
}

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

    assert.match(worker, /CACHE_NAME = `\$\{CACHE_PREFIX\}v3`/);
    assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
    assert.match(
      client,
      /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/,
    );
    assert.match(client, /registration\) => registration\.update\(\)/);
  });

  it("pre-caches standalone FA and EN fallbacks with redirects forbidden", async () => {
    const requests: WorkerRequest[] = [];
    const harness = await serviceWorkerHarness({
      fetch: async (request) => {
        requests.push(request);
        return new Response("safe", { status: 200 });
      },
    });

    await dispatchExtendable(harness.listeners.get("install"));

    assert.deepEqual(
      requests.map((request) => new URL(request.url).pathname),
      [
        "/academy-offline-fa.html",
        "/academy-offline-en.html",
        "/site.webmanifest",
        "/favicon.ico",
      ],
    );
    assert.ok(requests.every((request) => request.redirect === "error"));
    assert.ok(requests.every((request) => request.cache === "reload"));
    assert.equal(harness.cached.length, 4);
  });

  it("fails installation and discards v3 if an app-shell response redirected", async () => {
    const harness = await serviceWorkerHarness({
      fetch: async () => ({ ok: true, redirected: true, type: "basic" }),
    });

    await assert.rejects(
      dispatchExtendable(harness.listeners.get("install")),
      /Unsafe app-shell response/,
    );
    assert.deepEqual(harness.deleted, ["tecpey-academy-offline-v3"]);
    assert.equal(harness.cached.length, 0);
  });

  it("deletes the defective v2 cache without touching unrelated caches", async () => {
    const harness = await serviceWorkerHarness({
      keys: [
        "tecpey-academy-offline-v1",
        "tecpey-academy-offline-v2",
        "tecpey-academy-offline-v3",
        "another-product-cache",
      ],
    });

    await dispatchExtendable(harness.listeners.get("activate"));
    assert.deepEqual(
      harness.deleted.sort(),
      ["tecpey-academy-offline-v1", "tecpey-academy-offline-v2"],
    );
  });

  it("serves the locale-matched standalone fallback after a network failure", async () => {
    const matches: string[] = [];
    const fallback = new Response("offline", { status: 200 });
    const harness = await serviceWorkerHarness({
      fetch: async () => { throw new Error("offline"); },
      match: async (request) => {
        matches.push(typeof request === "string" ? request : request.url);
        return fallback;
      },
    });

    assert.equal(
      await dispatchNavigation(harness.listeners.get("fetch"), "/academy/signup"),
      fallback,
    );
    assert.equal(
      await dispatchNavigation(harness.listeners.get("fetch"), "/en/academy/login"),
      fallback,
    );
    assert.deepEqual(matches, [
      "/academy-offline-fa.html",
      "/academy-offline-en.html",
    ]);
  });

  it("keeps standalone fallback documents redirect-free and locale-complete", async () => {
    const [fa, en] = await Promise.all([
      readFile("public/academy-offline-fa.html", "utf8"),
      readFile("public/academy-offline-en.html", "utf8"),
    ]);

    assert.match(fa, /<html lang="fa" dir="rtl">/);
    assert.match(en, /<html lang="en" dir="ltr">/);
    for (const document of [fa, en]) {
      assert.doesNotMatch(document, /http-equiv=["']refresh/i);
      assert.doesNotMatch(document, /<script/i);
      assert.doesNotMatch(document, /window\.location|location\.replace/i);
    }
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
