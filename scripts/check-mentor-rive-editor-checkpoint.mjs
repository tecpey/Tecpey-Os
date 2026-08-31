import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKPOINT_PATH =
  "design/mentor/rive-authoring/tecpey-mentor-rive-editor-checkpoint.v1.json";
const RIG_MANIFEST_PATH =
  "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json";

const EXPECTED_TOP_LEVEL = [
  "grp_shadow",
  "grp_character",
  "grp_controls",
  "grp_skeleton",
  "grp_debug",
];
const EXPECTED_CHARACTER_CHILDREN = [
  "grp_body_back",
  "grp_torso",
  "grp_head",
  "grp_body_front",
];

function sameOrderedValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function evaluateEditorCheckpoint(checkpoint, rigManifest) {
  const errors = [];
  const artboards = new Map(
    (checkpoint.artboards ?? []).map((artboard) => [artboard.name, artboard]),
  );
  const core = artboards.get("MentorCore");
  const references = [
    artboards.get("IdentityReference"),
    artboards.get("ExpressionReference"),
  ];

  if (!core) {
    errors.push("MentorCore is missing from the editor checkpoint.");
  } else {
    if (core.isComponent !== true || core.componentAllowed !== true) {
      errors.push("MentorCore must be the sole allowed runtime component.");
    }
    if (core.status !== "component_semantic_group_skeleton_created") {
      errors.push("MentorCore phase-1 semantic skeleton is not recorded as complete.");
    }
    if (core.semanticHierarchy?.root !== "MentorCore") {
      errors.push("The semantic hierarchy root must be MentorCore.");
    }
    if (
      !sameOrderedValues(
        core.semanticHierarchy?.topLevel,
        EXPECTED_TOP_LEVEL,
      )
    ) {
      errors.push("MentorCore top-level semantic groups differ from the contract.");
    }
    if (
      !sameOrderedValues(
        core.semanticHierarchy?.children?.grp_character,
        EXPECTED_CHARACTER_CHILDREN,
      )
    ) {
      errors.push("grp_character children differ from the contract.");
    }
    for (const status of [
      core.geometryStatus,
      core.meshAndWeightsStatus,
      core.motionStatus,
    ]) {
      if (status !== "not_authored") {
        errors.push(
          "Identity geometry, mesh/weights and motion must remain unauthored at this gate.",
        );
        break;
      }
    }
    if (core.editorBinding?.acceptedAsContract !== false) {
      errors.push("Provisional Rive editor defaults must not be accepted as contract names.");
    }
  }

  for (const reference of references) {
    if (!reference) {
      errors.push("Both authoring reference artboards must be recorded.");
      continue;
    }
    if (reference.componentAllowed !== false || reference.isComponent !== false) {
      errors.push(`${reference.name} must remain a non-component authoring reference.`);
    }
    if (!(reference.placedAssets ?? []).every((asset) => asset.locked === true)) {
      errors.push(`${reference.name} contains an unlocked reference asset.`);
    }
  }

  const semanticNodes = [
    ...EXPECTED_TOP_LEVEL,
    ...EXPECTED_CHARACTER_CHILDREN,
  ];
  const rigNodes = new Set(rigManifest.requiredNodes ?? []);
  for (const node of semanticNodes) {
    if (!rigNodes.has(node)) {
      errors.push(`The rig manifest does not require semantic node ${node}.`);
    }
  }

  const nose = checkpoint.identityLocks?.nose;
  for (const property of [
    "speechWeight",
    "affectWeight",
    "jawWeight",
    "headAimDeformationWeight",
  ]) {
    if (nose?.[property] !== 0) {
      errors.push(`Identity nose lock ${property} must be zero.`);
    }
  }

  if (checkpoint.editorIntegrity?.productionRuntimeActivated !== false) {
    errors.push("Production runtime activation must remain false at phase 1.");
  }
  if (checkpoint.editorIntegrity?.accidentalExperimentalNodesRemaining !== false) {
    errors.push("The checkpoint must record a clean hierarchy without experimental nodes.");
  }
  if (checkpoint.nextGate?.id !== "rive_contract_topology") {
    errors.push("The next gate must be rive_contract_topology.");
  }

  return { ok: errors.length === 0, errors };
}

export async function loadAndEvaluateEditorCheckpoint(rootDir = ROOT) {
  const [checkpoint, rigManifest] = await Promise.all([
    readFile(path.join(rootDir, CHECKPOINT_PATH), "utf8").then(JSON.parse),
    readFile(path.join(rootDir, RIG_MANIFEST_PATH), "utf8").then(JSON.parse),
  ]);
  return evaluateEditorCheckpoint(checkpoint, rigManifest);
}

async function runCli() {
  const result = await loadAndEvaluateEditorCheckpoint();
  if (result.ok) {
    console.log("Rive Mentor editor checkpoint: ACCEPTED PHASE-1 SKELETON");
    return;
  }
  console.error("Rive Mentor editor checkpoint: BLOCKED");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runCli();
