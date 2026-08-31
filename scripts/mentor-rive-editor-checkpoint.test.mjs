import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateEditorCheckpoint,
  loadAndEvaluateEditorCheckpoint,
} from "./check-mentor-rive-editor-checkpoint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the repository records an accepted phase-1 Rive editor skeleton", async () => {
  const result = await loadAndEvaluateEditorCheckpoint(ROOT);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("a reference artboard cannot be promoted to a runtime component", () => {
  const checkpoint = {
    artboards: [
      {
        name: "IdentityReference",
        componentAllowed: false,
        isComponent: true,
        placedAssets: [{ locked: true }],
      },
      {
        name: "ExpressionReference",
        componentAllowed: false,
        isComponent: false,
        placedAssets: [{ locked: true }],
      },
    ],
  };
  const result = evaluateEditorCheckpoint(checkpoint, { requiredNodes: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /IdentityReference must remain a non-component/);
});

test("missing semantic groups fail the checkpoint", () => {
  const checkpoint = {
    artboards: [
      {
        name: "MentorCore",
        componentAllowed: true,
        isComponent: true,
        status: "component_semantic_group_skeleton_created",
        semanticHierarchy: {
          root: "MentorCore",
          topLevel: ["grp_shadow"],
          children: { grp_character: [] },
        },
        geometryStatus: "not_authored",
        meshAndWeightsStatus: "not_authored",
        motionStatus: "not_authored",
        editorBinding: { acceptedAsContract: false },
      },
      {
        name: "IdentityReference",
        componentAllowed: false,
        isComponent: false,
        placedAssets: [{ locked: true }],
      },
      {
        name: "ExpressionReference",
        componentAllowed: false,
        isComponent: false,
        placedAssets: [{ locked: true }],
      },
    ],
    identityLocks: {
      nose: {
        speechWeight: 0,
        affectWeight: 0,
        jawWeight: 0,
        headAimDeformationWeight: 0,
      },
    },
    editorIntegrity: {
      productionRuntimeActivated: false,
      accidentalExperimentalNodesRemaining: false,
    },
    nextGate: { id: "rive_contract_topology" },
  };
  const rigManifest = {
    requiredNodes: [
      "grp_shadow",
      "grp_character",
      "grp_controls",
      "grp_skeleton",
      "grp_debug",
      "grp_body_back",
      "grp_torso",
      "grp_head",
      "grp_body_front",
    ],
  };
  const result = evaluateEditorCheckpoint(checkpoint, rigManifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /top-level semantic groups/);
  assert.match(result.errors.join("\n"), /grp_character children/);
});
