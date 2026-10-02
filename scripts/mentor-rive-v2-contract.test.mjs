import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const schemaPath = path.join(
  ROOT,
  "docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v2.schema.json",
);
const sourcePath = path.join(ROOT, "src/lib/living-mentor-rive-v2.ts");
const avatarPath = path.join(
  ROOT,
  "src/components/mentor/LivingMentorAvatar.tsx",
);
const activationGatePath = path.join(
  ROOT,
  "scripts/check-mentor-rive-activation-gate.mjs",
);

async function fixture() {
  const [schemaText, source, avatar, activationGate] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(sourcePath, "utf8"),
    readFile(avatarPath, "utf8"),
    readFile(activationGatePath, "utf8"),
  ]);
  return {
    schema: JSON.parse(schemaText),
    schemaText,
    source,
    avatar,
    activationGate,
  };
}

test("v2 contract is data-only and does not silently activate a Rive runtime", async () => {
  const { source, avatar } = await fixture();
  assert.doesNotMatch(source, /@rive-app\//);
  assert.doesNotMatch(avatar, /@rive-app\//);
  assert.match(avatar, /tecpey-living-mentor-v1\.webp/);
});

test("v2 schema has a closed renderer surface and at least twenty semantic states", async () => {
  const { schema } = await fixture();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contractVersion.const, "2.0.0");
  assert.ok(schema.properties.state.enum.length >= 20);
  assert.equal(
    new Set(schema.properties.state.enum).size,
    schema.properties.state.enum.length,
  );
});

test("required v2 product fields are present without sensitive raw-data bindings", async () => {
  const { schema, schemaText } = await fixture();
  for (const required of [
    "state",
    "userName",
    "streakDays",
    "mood",
    "riskLevel",
    "roomLevel",
    "locale",
    "reducedMotion",
  ]) {
    assert.ok(schema.required.includes(required), required);
  }
  const lowered = schemaText.toLowerCase();
  for (const forbidden of [
    "seedphrase",
    "privatekey",
    "password",
    "totp",
    "balance",
    "email",
    "phone",
    "documentid",
    "rawprofile",
    "prompt",
  ]) {
    assert.equal(lowered.includes(forbidden), false, forbidden);
  }
});

test("schema preserves privacy, unknown-value and reduced-motion invariants", async () => {
  const { schema } = await fixture();
  const encoded = JSON.stringify(schema.allOf);
  assert.match(encoded, /"userNameVisible":\{"const":false\}/);
  assert.match(encoded, /"userName":\{"const":""\}/);
  assert.match(encoded, /"userNameVisible":\{"const":true\}/);
  assert.match(encoded, /"userName":\{"minLength":1\}/);
  assert.match(encoded, /"streakKnown":\{"const":false\}/);
  assert.match(encoded, /"streakDays":\{"const":0\}/);
  assert.match(encoded, /"roomKnown":\{"const":false\}/);
  assert.match(encoded, /"roomLevel":\{"const":0\}/);
  assert.match(encoded, /"reducedMotion":\{"const":true\}/);
  assert.match(encoded, /"motionIntensity":\{"const":0\}/);
});

test("host source contains fail-closed runtime and reduced-motion guards", async () => {
  const { source } = await fixture();
  assert.match(source, /normalizeState[\s\S]*runtime_error/);
  assert.match(source, /normalizeSafetyOverride[\s\S]*runtime_error/);
  assert.match(source, /input\.allowsUserName === true/);
  assert.match(source, /normalizeReducedMotion\(input\.reducedMotion\)/);
  assert.match(source, /reducedMotion[\s\S]*motionIntensity[\s\S]*\? 0/);
  assert.match(source, /streakKnown/);
  assert.match(source, /roomKnown/);
});

test("existing activation gate remains fail-closed around real runtime and asset evidence", async () => {
  const { activationGate } = await fixture();
  assert.match(activationGate, /activationDetected = rivePackages\.length > 0 \|\| riveAssets\.length > 0/);
  assert.match(activationGate, /@rive-app\/react-webgl2/);
  assert.match(activationGate, /Activation requires exactly one canonical \.riv asset/);
  assert.match(activationGate, /production-stage acceptance evidence/);
});
