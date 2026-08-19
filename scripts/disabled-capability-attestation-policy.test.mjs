import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const requiredFiles = [
  "README.md",
  "README.fa.md",
  "package.json",
  "server.ts",
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/validate-env.mjs",
  "src/data/exchangeCompare.json",
  "src/app/layout.tsx",
  "src/app/en/page.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/components/seo/StructuredData.tsx",
  "src/i18n/messages/en.json",
  "src/i18n/messages/fa.json",
  "src/lib/feature-flags.ts",
  "src/lib/wallet/custody-launch-policy.ts",
];

function collectPublicSourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (file === "src/app/api") continue;
      files.push(...collectPublicSourceFiles(file));
    } else if (/\.(?:ts|tsx|mdx)$/.test(file)) {
      files.push(file);
    }
  }
  return files;
}

function collectI18nMessageFiles(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json$/.test(entry.name))
    .map((entry) => `${root}/${entry.name}`);
}

const files = [
  ...new Set([
    ...requiredFiles,
    ...collectPublicSourceFiles("src/app"),
    ...collectPublicSourceFiles("src/components"),
    ...collectI18nMessageFiles("src/i18n/messages"),
  ]),
].sort();

function loadSources() {
  return Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));
}

test("disabled capability attestation accepts current controlled-launch boundary", () => {
  assert.deepEqual(evaluateDisabledCapabilityAttestation(loadSources()), []);
});

test("disabled capability attestation rejects public real-money overclaims", () => {
  const sources = loadSources();
  sources["README.md"] += "\nThe real-money exchange is live for all users.\n";

  assert.match(evaluateDisabledCapabilityAttestation(sources).join("\n"), /forbidden launch-readiness claim/);
});

test("disabled capability attestation rejects public SEO exchange overclaims", () => {
  const sources = loadSources();
  sources["src/app/en/page.tsx"] = sources["src/app/en/page.tsx"].replace(
    "Crypto Education and Launch-Gated Market Practice",
    "Secure Persian Crypto Exchange",
  );
  sources["src/components/seo/StructuredData.tsx"] = sources["src/components/seo/StructuredData.tsx"].replace(
    '"@type": ["Organization", "EducationalOrganization"]',
    '"@type": ["Organization", "FinancialService", "LocalBusiness"]',
  );

  const failures = evaluateDisabledCapabilityAttestation(sources).join("\n");
  assert.match(failures, /src\/app\/en\/page\.tsx: forbidden launch-readiness claim/);
  assert.match(failures, /src\/components\/seo\/StructuredData\.tsx: forbidden launch-readiness claim/);
});

test("disabled capability attestation scans discovered public copy surfaces", () => {
  const sources = loadSources();
  sources["src/app/en/business/page.tsx"] += "\nconst unsafeCopy = 'The real-money exchange is live for business users.';\n";

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /src\/app\/en\/business\/page\.tsx: forbidden launch-readiness claim/,
  );
});

test("disabled capability attestation rejects ungated disabled capability routes", () => {
  const sources = loadSources();
  sources["src/app/en/enterprise/page.tsx"] =
    "export default function EnterprisePage() { return <main>Contact us for enterprise readiness.</main>; }";
  sources["src/app/rewards/page.tsx"] =
    "export default function RewardsPage() { return <main>Community awards center.</main>; }";

  const failures = evaluateDisabledCapabilityAttestation(sources).join("\n");
  assert.match(failures, /src\/app\/en\/enterprise\/page\.tsx: disabled capability route must remain absent/);
  assert.match(failures, /src\/app\/rewards\/page\.tsx: disabled capability route must remain absent/);
});

test("disabled capability attestation rejects swap copy drifting into live trading", () => {
  const sources = loadSources();
  sources["src/app/swap/page.tsx"] = sources["src/app/swap/page.tsx"].replace(
    "بازارها را بررسی کنید و قبل از هر تصمیم، مسیر تبدیل را در فضای آموزشی بفهمید.",
    "بازارها را بررسی کنید و با مسیر ساده وارد معامله شوید.",
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /src\/app\/swap\/page\.tsx: forbidden launch-readiness claim/,
  );
});

test("disabled capability attestation scans i18n message product-truth surfaces", () => {
  const sources = loadSources();
  const enMessages = JSON.parse(sources["src/i18n/messages/en.json"]);
  enMessages.Fees.cryptoDesc =
    "TecPey offers a wide range of cryptocurrencies for deposit and withdrawal.";
  enMessages.Fees.irtDesc =
    "TecPey provides convenient options for depositing and withdrawing IRT.";
  sources["src/i18n/messages/en.json"] = JSON.stringify(enMessages, null, 2);

  const faMessages = JSON.parse(sources["src/i18n/messages/fa.json"]);
  faMessages.Fees.cryptoDesc =
    "TecPey طیف گسترده‌ای از ارزهای دیجیتال را برای واریز و برداشت ارائه می‌دهد.";
  sources["src/i18n/messages/fa.json"] = JSON.stringify(faMessages, null, 2);

  const failures = evaluateDisabledCapabilityAttestation(sources).join("\n");
  assert.match(failures, /src\/i18n\/messages\/en\.json: forbidden launch-readiness claim/);
  assert.match(failures, /src\/i18n\/messages\/fa\.json: forbidden launch-readiness claim/);
});

test("disabled capability attestation rejects rendered exchange comparison capability drift", () => {
  const sources = loadSources();
  const rows = JSON.parse(sources["src/data/exchangeCompare.json"]);
  rows.find((row) => row.name === "TecPey").spot = "بله";
  sources["src/data/exchangeCompare.json"] = JSON.stringify(rows, null, 2);

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /src\/data\/exchangeCompare\.json: TecPey spot-trading status must remain launch-gated/,
  );
});

test("disabled capability attestation rejects missing custody runtime gate", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replaceAll("custodyStatus.workerEnabled", "true");

  assert.match(evaluateDisabledCapabilityAttestation(sources).join("\n"), /server\.ts/);
});

test("disabled capability attestation rejects token-preserving custody runtime bypasses", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replace(
    "if (redisUrl && custodyStatus.workerEnabled) {",
    "if (redisUrl) {\n    console.info(custodyStatus.workerEnabled);",
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /withdrawal workers must start only inside the redisUrl plus custodyStatus\.workerEnabled guard/,
  );
});

test("disabled capability attestation rejects worker startup moved outside the custody guard", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replace(
    `if (redisUrl && custodyStatus.workerEnabled) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {`,
    `if (redisUrl && custodyStatus.workerEnabled) {
    console.info("custody gate remains visible");
  }
  if (redisUrl) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {`,
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /withdrawal workers must start only inside the redisUrl plus custodyStatus\.workerEnabled guard/,
  );
});

test("disabled capability attestation rejects dead worker tokens inside the custody guard", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replace(
    `if (redisUrl && custodyStatus.workerEnabled) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {`,
    `if (redisUrl && custodyStatus.workerEnabled) {
    if (false) {
      withdrawalWorkers = await import("./src/workers/withdrawal-worker");
      withdrawalWorkers.startWithdrawalWorkers();
    }
  }
  if (redisUrl) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {`,
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /withdrawal workers must start only inside the redisUrl plus custodyStatus\.workerEnabled guard/,
  );
});

test("disabled capability attestation rejects duplicate worker startup outside the custody guard", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replace(
    `  assertBootstrapActive();

  // ── HTTP and WebSocket traffic`,
    `  if (redisUrl) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  }

  assertBootstrapActive();

  // ── HTTP and WebSocket traffic`,
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /withdrawal workers must start only inside the redisUrl plus custodyStatus\.workerEnabled guard/,
  );
});

test("disabled capability attestation rejects incomplete release-packet boundary", () => {
  const sources = loadSources();
  sources["scripts/generate-controlled-launch-release-packet.mjs"] = sources[
    "scripts/generate-controlled-launch-release-packet.mjs"
  ].replace(
    '"enterprise and white-label activation remain NO-GO unless separately certified",',
    '"enterprise and white-label activation is approved",',
  );

  assert.match(evaluateDisabledCapabilityAttestation(sources).join("\n"), /enterprise and white-label/);
});

test("disabled capability attestation rejects launch-disabled feature flag drift", () => {
  const sources = loadSources();
  sources["src/lib/feature-flags.ts"] = sources["src/lib/feature-flags.ts"].replace(
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: false }',
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: true }',
  );
  sources["scripts/validate-env.mjs"] = sources["scripts/validate-env.mjs"].replace(
    "FEATURE_EXCHANGE_ENABLED=true is forbidden in production",
    "FEATURE_EXCHANGE_ENABLED is reviewed in production",
  );

  const failures = evaluateDisabledCapabilityAttestation(sources).join("\n");
  assert.match(failures, /src\/lib\/feature-flags\.ts: missing disabled-capability boundary/);
  assert.match(failures, /scripts\/validate-env\.mjs: missing disabled-capability boundary/);
});

test("disabled capability attestation rejects a new financial flag defaulting on", () => {
  const sources = loadSources();
  // A financial-surface flag added later, defaulting ON, is not pinned by any
  // exact token and its env var is not yet in validate-env's forbidden list —
  // the structural default-off check is what catches it.
  sources["src/lib/feature-flags.ts"] = sources["src/lib/feature-flags.ts"].replace(
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: false },',
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: false },\n  "custody.enabled": { envVar: "FEATURE_CUSTODY_ENABLED", defaultEnabled: true },',
  );

  assert.match(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /financial-surface feature flag custody\.enabled \(FEATURE_CUSTODY_ENABLED\) must default to false/,
  );
});

test("disabled capability attestation allows a non-financial flag defaulting on", () => {
  const sources = loadSources();
  // A non-financial flag may default ON; the structural check must not fire for
  // it, so the invariant stays targeted at real-money/enterprise surfaces.
  sources["src/lib/feature-flags.ts"] = sources["src/lib/feature-flags.ts"].replace(
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: false },',
    '"exchange.enabled": { envVar: "FEATURE_EXCHANGE_ENABLED", defaultEnabled: false },\n  "community.leaderboard.enabled": { envVar: "FEATURE_COMMUNITY_LEADERBOARD_ENABLED", defaultEnabled: true },',
  );

  assert.doesNotMatch(
    evaluateDisabledCapabilityAttestation(sources).join("\n"),
    /financial-surface feature flag/,
  );
});
