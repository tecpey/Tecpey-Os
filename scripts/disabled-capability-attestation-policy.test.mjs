import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const files = [
  "README.md",
  "README.fa.md",
  "package.json",
  "server.ts",
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/validate-env.mjs",
  "src/app/layout.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/lib/wallet/custody-launch-policy.ts",
];

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

test("disabled capability attestation rejects missing custody runtime gate", () => {
  const sources = loadSources();
  sources["server.ts"] = sources["server.ts"].replaceAll("custodyStatus.workerEnabled", "true");

  assert.match(evaluateDisabledCapabilityAttestation(sources).join("\n"), /server\.ts/);
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
