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

test("production evidence must match the installed Rive runtime version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mentor-rive-version-"));
  try {
    const evidencePath =
      "docs/mentor/acceptance/accepted/tecpey-mentor-rive-acceptance.v1.json";
    await mkdir(path.join(root, "public"), { recursive: true });
    await mkdir(path.join(root, "src/components/mentor"), { recursive: true });
    await mkdir(path.dirname(path.join(root, evidencePath)), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { "@rive-app/react-webgl2": "2.0.0" } }),
    );
    await writeFile(path.join(root, "public/mentor.riv"), "");
    await writeFile(
      path.join(root, "src/components/mentor/LivingMentorAvatar.tsx"),
      "export const fallback = 'tecpey-living-mentor-v1.webp';",
    );
    await writeFile(
      path.join(root, evidencePath),
      JSON.stringify({
        asset: { path: "public/mentor.riv" },
        runtimeTargets: [
          {
            platform: "web",
            package: "@rive-app/react-webgl2",
            version: "1.0.0",
          },
        ],
      }),
    );

    const result = await evaluateActivationState(root, {
      acceptanceCheck: async () => ({
        ok: true,
        stage: "production",
        evidencePath,
        errors: [],
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.mode, "blocked");
    assert.match(
      result.errors.join("\n"),
      /does not match the installed @rive-app\/react-webgl2 version/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
