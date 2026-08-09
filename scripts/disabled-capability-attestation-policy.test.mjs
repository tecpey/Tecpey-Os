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
  "src/app/layout.tsx",
  "src/app/en/page.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/components/seo/StructuredData.tsx",
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

const files = [
  ...new Set([
    ...requiredFiles,
    ...collectPublicSourceFiles("src/app"),
    ...collectPublicSourceFiles("src/components"),
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
