import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const runtimeNodePath = path.join(root, "scripts", "runtime-stubs");

const serverOnlyCommands = {
  "community:challenge:finalize":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/finalize-community-journal-challenges.ts",
  "community:challenge:finalize:scheduled":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/run-community-challenge-finalization-scheduled.ts",
  "ops:alerts:deliver:dev":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/deliver-operational-alerts.ts",
  "ops:staging:evidence:collect":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/collect-community-challenge-scheduler-host-evidence.ts",
  "ops:incident-readiness:evidence:collect":
    "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/collect-protected-incident-readiness-evidence.ts",
};

test("server-only CLI entrypoints pin the isolated Node server runtime", async () => {
  const stub = await readFile(path.join(runtimeNodePath, "server-only", "index.js"), "utf8");
  assert.match(stub, /module\.exports = \{\};/);
  for (const [name, command] of Object.entries(serverOnlyCommands)) {
    assert.equal(packageJson.scripts?.[name], command, `${name} must keep the server-only runtime`);
  }
});

test("operational alert delivery production command is release-bundled while dev keeps the server-only shim", () => {
  assert.equal(
    packageJson.scripts?.["ops:alerts:deliver"],
    "node dist/deliver-operational-alerts.cjs",
  );
  assert.equal(
    packageJson.scripts?.["ops:alerts:env-check"],
    "node dist/check-operational-alert-delivery-env.cjs",
  );
  assert.match(
    packageJson.scripts?.["build:server"] ?? "",
    /scripts\/deliver-operational-alerts\.ts/,
  );
  assert.match(
    packageJson.scripts?.["build:server"] ?? "",
    /scripts\/check-operational-alert-delivery-env\.ts/,
  );
});

test("news materialization scheduler pins the isolated server-only runtime to its release", async () => {
  const template = await readFile(
    path.join(root, "deploy", "systemd", "tecpey-news-materialization.service.in"),
    "utf8",
  );
  assert.match(template, /^Environment=NODE_PATH=@@APP_DIR@@\/scripts\/runtime-stubs$/m);
});

test("news history payload identity follows locale+slug content rather than transient row ids", () => {
  const env = { ...process.env, NODE_PATH: runtimeNodePath };
  delete env.NODE_OPTIONS;
  const source = String.raw`
    const assert = require("node:assert/strict");
    const { hashNewsMaterializationHistoryPayload } = require("./src/lib/news-materialization-persistence.ts");
    const base = {
      id: "capture-history-id",
      locale: "en",
      newsUrl: "/en/crypto-news/canonical-event",
      title: "Canonical event title",
      summary: "A sufficiently long news summary for canonical history identity testing.",
      sourceName: "CoinDesk",
      sourceUrl: "https://example.com/canonical-event",
      publishedAt: "2026-09-16T10:00:00.000Z",
      recordedAt: "2026-09-16T10:05:00.000Z",
      priority: 80,
      impactScore: 8,
      tone: "neutral",
      reasonFa: "این خبر برای آزمون هویت پایدار استفاده می‌شود.",
      reasonEn: "This news is used to verify stable canonical identity.",
      relatedToolSlugs: [],
      relatedCoinSymbols: ["BTC"],
      relatedLessonHref: "/en/academy/market-intelligence",
    };
    assert.equal(
      hashNewsMaterializationHistoryPayload(base),
      hashNewsMaterializationHistoryPayload({ ...base, id: "publication-history-id" }),
    );
    assert.notEqual(
      hashNewsMaterializationHistoryPayload(base),
      hashNewsMaterializationHistoryPayload({ ...base, title: "Materially different canonical event title" }),
    );
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", source], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
});

test("staging collector resolves every server-only import before validating input", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("TECPEY_")),
  );
  delete env.NODE_OPTIONS;
  env.NODE_PATH = runtimeNodePath;

  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/collect-community-challenge-scheduler-host-evidence.ts",
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 1);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module/);
  assert.match(output, /"error":"tecpey_evidence_environment_required"/);
});

test("incident collector resolves every server-only import before validating input", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("TECPEY_")),
  );
  delete env.NODE_OPTIONS;
  env.NODE_PATH = runtimeNodePath;

  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/collect-protected-incident-readiness-evidence.ts",
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert.equal(result.status, 1);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module/);
  assert.match(output, /"error":"tecpey_incident_acknowledgements_confirmed_required"/);
});
