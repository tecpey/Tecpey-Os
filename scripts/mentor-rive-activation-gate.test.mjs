import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateActivationState } from "./check-mentor-rive-activation-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the repository keeps the honest static fallback until accepted activation", async () => {
  const result = await evaluateActivationState(ROOT);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.activationDetected, false);
  assert.equal(result.mode, "static_fallback");
});

test("a passing spike packet cannot activate the global Rive renderer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mentor-rive-activation-"));
  try {
    await mkdir(path.join(root, "public"), { recursive: true });
    await mkdir(path.join(root, "src/components/mentor"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { "@rive-app/react-webgl2": "1.0.0" } }),
    );
    await writeFile(path.join(root, "public/mentor.riv"), "");
    await writeFile(
      path.join(root, "src/components/mentor/LivingMentorAvatar.tsx"),
      "export const fallback = 'tecpey-living-mentor-v1.webp';",
    );

    const result = await evaluateActivationState(root, {
      acceptanceCheck: async () => ({
        ok: true,
        stage: "spike",
        evidencePath: "docs/mentor/acceptance/spike.json",
        errors: [],
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.mode, "blocked");
    assert.match(result.errors.join("\n"), /production-stage acceptance evidence/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
