import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateMentorVectorSourcePack,
  verifyMentorVectorSourceFiles,
} from "./mentor-vector-source-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(
    path.join(
      root,
      "design/mentor/vector-source/v1-adobe/mentor-vector-source-pack.v1.json",
    ),
    "utf8",
  ),
);

test("the committed vector authoring sources match their exact hashes", async () => {
  const result = await verifyMentorVectorSourceFiles(manifest, root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("flat traces can never be promoted to runtime assets", () => {
  const document = structuredClone(manifest);
  document.sources[0].productionImport = true;
  document.authoringDecision.flatTraceMayShipToRuntime = true;
  const result = evaluateMentorVectorSourcePack(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("flat traces")));
  assert.ok(result.errors.some((error) => error.includes("productionImport")));
});

test("identity expressions cannot reshape the approved nose", () => {
  const document = structuredClone(manifest);
  document.identityLock.nose.dorsalHump = true;
  document.identityLock.nose.tip = "drooping";
  document.identityLock.nose.speechDeformation = true;
  const result = evaluateMentorVectorSourcePack(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("dorsalHump")));
  assert.ok(result.errors.some((error) => error.includes("tip")));
  assert.ok(result.errors.some((error) => error.includes("speechDeformation")));
});

test("motion must stay interruptible, bounded, and reduced-motion aware", () => {
  const document = structuredClone(manifest);
  const greet = document.initialActs.find((act) => act.id === "greet");
  greet.entryMs = 420;
  greet.easing = "ease_in";
  greet.interruptible = false;
  greet.reducedMotion = "";
  const result = evaluateMentorVectorSourcePack(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("entryMs")));
  assert.ok(result.errors.some((error) => error.includes("easing")));
  assert.ok(result.errors.some((error) => error.includes("interruptible")));
  assert.ok(result.errors.some((error) => error.includes("reducedMotion")));
});

test("mirroring cannot pretend to close missing identity angles", () => {
  const document = structuredClone(manifest);
  document.coverage.mirroringDoesNotCloseCoverage = false;
  document.coverage.acceptanceAnglesStillRequired = [];
  const result = evaluateMentorVectorSourcePack(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("mirroring")));
  assert.ok(result.errors.some((error) => error.includes("three_quarter_L")));
  assert.ok(result.errors.some((error) => error.includes("profile_L")));
});
