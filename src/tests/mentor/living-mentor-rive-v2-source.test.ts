import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function read(relativePath: string) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("v2 host contract does not silently activate a Rive runtime", async () => {
  const [source, avatar] = await Promise.all([
    read("src/lib/living-mentor-rive-v2.ts"),
    read("src/components/mentor/LivingMentorAvatar.tsx"),
  ]);
  assert.doesNotMatch(source, /@rive-app\//);
  assert.doesNotMatch(avatar, /@rive-app\//);
  assert.match(avatar, /tecpey-living-mentor-v1\.webp/);
});

test("production activation remains gated by runtime, canonical asset and accepted evidence", async () => {
  const activationGate = await read("scripts/check-mentor-rive-activation-gate.mjs");
  assert.match(
    activationGate,
    /activationDetected = rivePackages\.length > 0 \|\| riveAssets\.length > 0/,
  );
  assert.match(activationGate, /@rive-app\/react-webgl2/);
  assert.match(
    activationGate,
    /Activation requires exactly one canonical \.riv asset/,
  );
  assert.match(activationGate, /production-stage acceptance evidence/);
});

test("v2 renderer schema stays closed and excludes raw sensitive data", async () => {
  const schemaText = await read(
    "docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v2.schema.json",
  );
  const schema = JSON.parse(schemaText) as {
    additionalProperties: boolean;
    properties: { state: { enum: string[] } };
  };
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.properties.state.enum.length >= 20);

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
