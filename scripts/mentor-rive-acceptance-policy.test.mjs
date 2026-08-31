import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACCESSIBILITY_TESTS,
  acceptanceRequirements,
  evaluateMentorRiveAcceptance,
  GLOBALIZATION_TESTS,
  REQUIRED_CONTRACT_ARTIFACTS,
  SECURITY_PRIVACY_TESTS,
  verifyMentorRiveArtifacts,
} from "./mentor-rive-acceptance-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      "docs/mentor/acceptance/tecpey-mentor-rive-acceptance.v1.template.json",
    ),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    path.join(ROOT, "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json"),
    "utf8",
  ),
);

function acceptedEntries(ids, prefix) {
  return ids.map((id) => ({
    id,
    status: "accepted",
    evidence: [`artifacts/mentor-rive/${prefix}/${id}.json`],
  }));
}

function acceptedDocument(stage = "spike") {
  const document = structuredClone(template);
  const requirements = acceptanceRequirements(manifest, stage);
  document.stage = stage;
  document.asset = {
    path: "public/rive/mentor/tecpey-mentor-global.v1.riv",
    sha256: "a".repeat(64),
    bytes: 500000,
    signedBy: "character-release-owner",
    signedAt: "2026-08-30T12:00:00.000Z",
  };
  document.identityProfile.nose.status = "accepted";
  document.identityProfile.nose.evidence = [
    "artifacts/mentor-rive/identity/nose-angle-regression.json",
  ];

  for (const [key, ids] of Object.entries(requirements)) {
    document.coverage[key] = acceptedEntries(ids, key);
  }
  document.coverage.globalization = acceptedEntries(
    GLOBALIZATION_TESTS,
    "globalization",
  );
  document.coverage.accessibility = acceptedEntries(
    ACCESSIBILITY_TESTS,
    "accessibility",
  );
  document.coverage.securityPrivacy = acceptedEntries(
    SECURITY_PRIVACY_TESTS,
    "security-privacy",
  );

  for (const runtime of document.runtimeTargets) {
    runtime.version = "1.2.3";
    runtime.status = "accepted";
    runtime.evidence = [
      `artifacts/mentor-rive/runtime/${runtime.platform}.json`,
    ];
    runtime.behaviors = runtime.behaviors.map((behavior) => ({
      ...behavior,
      status: "accepted",
      evidence: [
        `artifacts/mentor-rive/runtime/${runtime.platform}/${behavior.id}.json`,
      ],
    }));
  }

  document.performance.productionBuild = true;
  document.performance.readiness = {
    cachedReadyP95Ms: 300,
    uncachedReadyP95Ms: 1200,
    fallbackCommitP95Ms: 80,
    baselineRegressionPercent: 5,
    status: "accepted",
    evidence: ["artifacts/mentor-rive/performance/readiness.json"],
  };
  document.performance.deviceTiers = [
    {
      id: "reference_web",
      mode: "animated",
      p95FrameMs: 15.8,
      minimumFps: 58,
      status: "accepted",
      evidence: ["artifacts/mentor-rive/performance/reference-web.json"],
    },
    {
      id: "reference_mobile",
      mode: "animated",
      p95FrameMs: 16.2,
      minimumFps: 52,
      status: "accepted",
      evidence: ["artifacts/mentor-rive/performance/reference-mobile.json"],
    },
    {
      id: "low_tier_fallback",
      mode: "static_fallback",
      p95FrameMs: 30,
      minimumFps: 30,
      status: "accepted",
      evidence: ["artifacts/mentor-rive/performance/low-tier.json"],
    },
  ];

  document.signoffs = manifest.gates.map((gate) => ({
    gateId: gate.id,
    owner: gate.owner,
    status: "accepted",
    reviewer: `${gate.owner}-reviewer`,
    reviewedAt: "2026-08-30T12:00:00.000Z",
    evidence: [`artifacts/mentor-rive/signoffs/${gate.id}.json`],
  }));
  document.decision = {
    status: "accepted",
    stage,
    decidedAt: "2026-08-30T12:30:00.000Z",
    reason: "all_required_gates_accepted",
  };
  return document;
}

test("the committed template fails closed before the signed asset exists", () => {
  const result = evaluateMentorRiveAcceptance(template, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("asset.sha256")));
  assert.ok(result.errors.some((error) => error.includes("coverage.acts.greet")));
  assert.ok(result.errors.some((error) => error.includes("decision.status")));
});

test("an evidence-complete five-act spike passes the policy", () => {
  const result = evaluateMentorRiveAcceptance(
    acceptedDocument("spike"),
    manifest,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.requiredCounts.acts, 5);
  assert.equal(result.requiredCounts.expressionReferences, 12);
  assert.equal(result.requiredCounts.articulationControls, 9);
});

test("the identity-critical nose cannot be widened, humped, or deformed", () => {
  const document = acceptedDocument("spike");
  document.identityProfile.nose.dorsalHump = true;
  document.identityProfile.nose.tip = "drooping";
  document.identityProfile.nose.speechDeformation = true;
  const result = evaluateMentorRiveAcceptance(document, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("dorsalHump")));
  assert.ok(result.errors.some((error) => error.includes("tip")));
  assert.ok(result.errors.some((error) => error.includes("speechDeformation")));
});

test("global readiness fails when RTL and missing-locale behavior lack evidence", () => {
  const document = acceptedDocument("spike");
  document.coverage.globalization = document.coverage.globalization.filter(
    (entry) =>
      entry.id !== "rtl_connected_script" &&
      entry.id !== "missing_locale_fail_closed",
  );
  const result = evaluateMentorRiveAcceptance(document, manifest);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("rtl_connected_script")),
  );
  assert.ok(
    result.errors.some((error) => error.includes("missing_locale_fail_closed")),
  );
});

test("production expands the same rig to all acts and all speech anchors", () => {
  const document = acceptedDocument("production");
  const result = evaluateMentorRiveAcceptance(document, manifest);
  assert.equal(result.ok, true);
  assert.equal(result.requiredCounts.acts, 13);
  assert.equal(result.requiredCounts.speechAnchors, 15);
  assert.equal(result.requiredCounts.globalPoses, 8);
});

test("runtime versions must be pinned and performance limits block regressions", () => {
  const document = acceptedDocument("spike");
  document.runtimeTargets[0].version = "^1.2.3";
  document.performance.deviceTiers[0].p95FrameMs = 21;
  document.performance.readiness.fallbackCommitP95Ms = 140;
  const result = evaluateMentorRiveAcceptance(document, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("pinned semver")));
  assert.ok(result.errors.some((error) => error.includes("p95FrameMs")));
  assert.ok(
    result.errors.some((error) => error.includes("fallbackCommitP95Ms")),
  );
});

test("accepted labels cannot hide missing measurements", () => {
  const document = acceptedDocument("spike");
  document.performance.warmupSeconds = null;
  document.performance.readiness.cachedReadyP95Ms = null;
  document.performance.readiness.uncachedReadyP95Ms = null;
  const result = evaluateMentorRiveAcceptance(document, manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("warmupSeconds")));
  assert.ok(result.errors.some((error) => error.includes("cachedReadyP95Ms")));
  assert.ok(
    result.errors.some((error) => error.includes("uncachedReadyP95Ms")),
  );
});

test("artifact hashes bind acceptance to the exact Rive file and contracts", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "tecpey-rive-gate-"));
  try {
    const document = acceptedDocument("spike");
    const assetBytes = Buffer.from("signed-rive-fixture");
    const assetPath = path.join(temporaryRoot, document.asset.path);
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(assetPath, assetBytes);
    document.asset.bytes = assetBytes.length;
    document.asset.sha256 = createHash("sha256")
      .update(assetBytes)
      .digest("hex");

    document.contracts = [];
    for (const contract of REQUIRED_CONTRACT_ARTIFACTS) {
      const bytes = Buffer.from(`contract:${contract.id}`);
      const contractPath = path.join(temporaryRoot, contract.path);
      await mkdir(path.dirname(contractPath), { recursive: true });
      await writeFile(contractPath, bytes);
      document.contracts.push({
        ...contract,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }

    const accepted = await verifyMentorRiveArtifacts(
      document,
      manifest,
      temporaryRoot,
    );
    assert.deepEqual(accepted.errors, []);
    assert.equal(accepted.ok, true);

    await writeFile(assetPath, "tampered");
    const tampered = await verifyMentorRiveArtifacts(
      document,
      manifest,
      temporaryRoot,
    );
    assert.equal(tampered.ok, false);
    assert.ok(tampered.errors.some((error) => error.includes("SHA-256")));
    assert.ok(tampered.errors.some((error) => error.includes("byte count")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("motion review blocks ease-in, non-interruptible acts, and slow UI transitions", () => {
  const unsafeManifest = structuredClone(manifest);
  unsafeManifest.motion.curves.push({ id: "ease_in", value: "unsafe" });
  unsafeManifest.motion.transitions[1].curve = "ease_in";
  unsafeManifest.motion.transitions[1].interruptible = false;
  unsafeManifest.motion.transitions[1].maximumMs = 480;
  const result = evaluateMentorRiveAcceptance(
    acceptedDocument("spike"),
    unsafeManifest,
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("ease_in UI curve")));
  assert.ok(result.errors.some((error) => error.includes("must not use ease_in")));
  assert.ok(result.errors.some((error) => error.includes("interruptible")));
  assert.ok(result.errors.some((error) => error.includes("0–300 ms")));
});
