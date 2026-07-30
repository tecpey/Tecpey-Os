import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkHealthReadiness, MAX_HEALTH_RESPONSE_BYTES } from "../../../scripts/check-health.mjs";
import {
  checkProductionUiVerificationRepository,
  productionUiVerificationFindings,
} from "../../../scripts/production-ui-verification-policy.mjs";
import { collectProductionStaticReport } from "../../../scripts/qa-production-static.mjs";
import { collectRouteQa } from "../../../scripts/qa-route-check.mjs";

const healthyPayload = {
  ok: true,
  health: "ok",
  checks: {
    database: "ok",
    schema: "current",
    redis: "ok",
    runtime: "ready",
    requiredWorkers: "ready",
  },
};

async function withServer(
  handler: http.RequestListener,
  run: (origin: string) => Promise<void>,
) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function jsonResponse(
  response: http.ServerResponse,
  payload: unknown,
  status = 200,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

test("health probe accepts only the complete readiness contract", async () => {
  await withServer(
    (_request, response) => jsonResponse(response, healthyPayload),
    async (origin) => {
      const payload = await checkHealthReadiness({
        url: `${origin}/api/health`,
      });
      assert.equal(payload.ok, true);
    },
  );

  await withServer(
    (_request, response) =>
      jsonResponse(response, {
        ...healthyPayload,
        checks: { ...healthyPayload.checks, database: "failed" },
      }),
    async (origin) => {
      await assert.rejects(
        checkHealthReadiness({ url: `${origin}/api/health` }),
        /health_readiness_contract_failed/,
      );
    },
  );
});

test("health probe rejects redirects and oversized responses", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(302, { location: "/api/health" });
      response.end();
    },
    async (origin) => {
      await assert.rejects(
        checkHealthReadiness({ url: `${origin}/api/health` }),
      );
    },
  );

  await withServer(
    (_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": String(MAX_HEALTH_RESPONSE_BYTES + 1),
      });
      response.end("{}");
    },
    async (origin) => {
      await assert.rejects(
        checkHealthReadiness({ url: `${origin}/api/health` }),
        /health_response_too_large/,
      );
    },
  );
});

test("health URL input is an exact readiness endpoint", async () => {
  for (const url of [
    "http://example.com/api/health",
    "http://127.0.0.1:3000/api/health?verbose=1",
    "http://127.0.0.1:3000/api/live",
  ]) {
    await assert.rejects(checkHealthReadiness({ url }));
  }
});

test("route QA models route groups and dynamic route shapes through one collector", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-route-qa-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relativePath of [
    "src/app/(public)/about/page.tsx",
    "src/app/posts/[slug]/page.tsx",
    "src/app/docs/[...path]/page.tsx",
    "src/app/search/[[...terms]]/page.tsx",
  ]) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export default function Page() { return null; }\n");
  }
  fs.writeFileSync(
    path.join(root, "src/links.ts"),
    [
      'const about = { href: "/about" };',
      'const post = { href: "/posts/one" };',
      'const docs = { href: "/docs/one/two" };',
      'const search = { href: "/search" };',
      'const missing = { href: "/missing" };',
    ].join("\n"),
  );

  assert.deepEqual(collectRouteQa(root).missing, [
    { file: "src/links.ts", href: "/missing" },
  ]);
});

test("current static and route QA report no findings without writing tracked evidence", () => {
  assert.deepEqual(collectRouteQa().missing, []);
  const report = collectProductionStaticReport(process.cwd(), "2026-07-30T00:00:00.000Z");
  assert.equal(report.status, "passed");
  assert.deepEqual(report.issues, []);
});

test("production UI policy rejects weakened verification boundaries", () => {
  assert.deepEqual(checkProductionUiVerificationRepository(), []);
  const sources = Object.fromEntries(
    [
      ["healthCheck", "scripts/check-health.mjs"],
      ["runtimeSmoke", "scripts/check-ui-runtime.mjs"],
      ["routeQa", "scripts/qa-route-check.mjs"],
      ["staticQa", "scripts/qa-production-static.mjs"],
      ["communityHub", "src/components/academy/community/CommunityHub.tsx"],
    ].map(([name, sourcePath]) => [name, fs.readFileSync(sourcePath, "utf8")]),
  );

  const mutations = [
    {
      ...sources,
      healthCheck: sources.healthCheck.replace('redirect: "error"', 'redirect: "follow"'),
    },
    {
      ...sources,
      runtimeSmoke: sources.runtimeSmoke.replace("url.origin !== baseUrl", "false"),
    },
    {
      ...sources,
      staticQa: sources.staticQa.replace(
        "artifacts/qa/production-static-report.json",
        "docs/internal-qa/QA_STATIC_PRODUCTION_REPORT.json",
      ),
    },
    {
      ...sources,
      communityHub: sources.communityHub.replace(
        "/academy/community/leaderboards",
        "/academy/community/leaderboard",
      ),
    },
  ];
  for (const mutation of mutations) {
    assert.notDeepEqual(productionUiVerificationFindings(mutation), []);
  }
});
