import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const MENTOR_RIVE_ACCEPTANCE_CONTRACT =
  "tecpey-mentor-rive-acceptance.v1";

export const SPIKE_ACTS = Object.freeze([
  "idle_attentive",
  "greet",
  "explain",
  "celebrate_effort",
  "risk_caution",
]);

export const SPIKE_SPEECH_ANCHORS = Object.freeze([
  "sil",
  "bilabial",
  "labiodental",
  "interdental",
  "vowel_open",
  "vowel_close_back_round",
]);

export const IDENTITY_ANGLES = Object.freeze([
  "front",
  "three_quarter_L",
  "three_quarter_R",
  "profile_L",
  "profile_R",
]);

export const EXPRESSION_REFERENCES = Object.freeze([
  "neutral",
  "mild_smile",
  "warm_smile",
  "attentive",
  "curious",
  "concerned",
  "steady",
  "listening_soft",
  "explaining_focus",
  "effort_pride_restrained",
  "reflective",
  "risk_serious",
]);

export const GLOBALIZATION_TESTS = Object.freeze([
  "ltr_latin",
  "rtl_connected_script",
  "mixed_direction_financial",
  "cjk_no_spacing",
  "indic_complex_script",
  "code_switch_segment_boundary",
  "missing_locale_fail_closed",
  "native_text_outside_canvas",
]);

export const ACCESSIBILITY_TESTS = Object.freeze([
  "reduced_motion",
  "captions",
  "semantic_host_equivalent",
  "screen_reader_label",
  "high_contrast",
  "keyboard_focus",
  "no_audio_autoplay",
  "static_failure_fallback",
]);

export const SECURITY_PRIVACY_TESTS = Object.freeze([
  "binding_allowlist",
  "no_raw_profile_data_in_riv",
  "no_audio_or_timeline_persistence",
  "redacted_telemetry",
  "renderer_memory_cleanup",
  "stale_utterance_rejection",
]);

export const REQUIRED_CONTRACT_ARTIFACTS = Object.freeze([
  {
    id: "rig_manifest",
    path: "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json",
  },
  {
    id: "viewmodel_schema",
    path: "docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v1.schema.json",
  },
  {
    id: "character_bible",
    path: "docs/mentor/TECPEY_LIVING_MENTOR_CHARACTER_BIBLE_V1.md",
  },
  {
    id: "rig_blueprint",
    path: "docs/mentor/RIVE_RIG_BLUEPRINT_V1.md",
  },
  {
    id: "speech_contract",
    path: "docs/mentor/MULTILINGUAL_SPEECH_RIG_CONTRACT_V1.md",
  },
]);

const ARTICULATION_CONTROLS = Object.freeze([
  "ctl_jaw_open",
  "ctl_lip_close",
  "ctl_lip_press",
  "ctl_lip_wide",
  "ctl_lip_round",
  "ctl_lip_funnel",
  "ctl_lower_lip_bite",
  "ctl_tongue_tip_up",
  "ctl_tongue_forward",
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PINNED_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function unique(values) {
  return [...new Set(values)];
}

function layer(manifest, name) {
  return array(manifest.layers).find((candidate) => candidate?.name === name);
}

function requiredActs(manifest, stage) {
  if (stage === "spike") return [...SPIKE_ACTS];

  const conversation = array(layer(manifest, "ConversationAct")?.states);
  const safety = array(layer(manifest, "SafetyBase")?.states).filter(
    (state) => state !== "clear",
  );
  return unique([...conversation, ...safety]);
}

function requiredArtboards(manifest) {
  return array(manifest.artboards)
    .filter((artboard) => artboard?.delivery !== "deferred")
    .map((artboard) => artboard.id);
}

function requiredAffects(manifest) {
  return array(layer(manifest, "FaceAffect")?.states);
}

function requiredSpeechAnchors(manifest, stage) {
  return stage === "spike"
    ? [...SPIKE_SPEECH_ANCHORS]
    : array(manifest.speechAnchors);
}

function requiredGlobalPoses(manifest, stage) {
  const available = array(manifest.globalPoses);
  return stage === "spike"
    ? SPIKE_ACTS.filter((act) => available.includes(act))
    : available;
}

function evidenceIsPresent(entry) {
  return (
    entry?.status === "accepted" &&
    array(entry.evidence).length > 0 &&
    array(entry.evidence).every(
      (value) => typeof value === "string" && value.trim().length > 0,
    )
  );
}

function requireAcceptedEntries(errors, location, entries, requiredIds) {
  if (!Array.isArray(entries)) {
    errors.push(`${location} must be an array.`);
    return;
  }

  const seen = new Set();
  for (const entry of entries) {
    const id = entry?.id;
    if (typeof id !== "string" || id.length === 0) {
      errors.push(`${location} contains an entry without an id.`);
      continue;
    }
    if (seen.has(id)) errors.push(`${location} contains duplicate id: ${id}.`);
    seen.add(id);
  }

  for (const id of requiredIds) {
    const entry = entries.find((candidate) => candidate?.id === id);
    if (!entry) {
      errors.push(`${location} is missing required id: ${id}.`);
    } else if (!evidenceIsPresent(entry)) {
      errors.push(`${location}.${id} is not accepted with evidence.`);
    }
  }
}

function validateIdentityProfile(errors, identityProfile) {
  const profile = object(identityProfile);
  const nose = object(profile.nose);
  const expected = {
    bridge: "smooth_narrow",
    dorsum: "continuous_gentle_slightly_concave_slope",
    dorsalHump: false,
    upperBodySwelling: false,
    tip: "refined_slightly_upturned",
    nostrilWidth: "stable_across_angles",
    expressionDeformation: false,
    speechDeformation: false,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (nose[key] !== value) {
      errors.push(
        `identityProfile.nose.${key} must remain ${JSON.stringify(value)}.`,
      );
    }
  }

  if (!evidenceIsPresent(nose)) {
    errors.push("identityProfile.nose is not accepted with visual evidence.");
  }
  if (profile.characterBoundary !== "inspired_by_mahdi_not_mahdi") {
    errors.push(
      "identityProfile.characterBoundary must be inspired_by_mahdi_not_mahdi.",
    );
  }
}

function validateRuntimeTargets(errors, evidenceTargets, manifestTargets) {
  if (!Array.isArray(evidenceTargets)) {
    errors.push("runtimeTargets must be an array.");
    return;
  }

  for (const target of array(manifestTargets)) {
    const evidence = evidenceTargets.find(
      (candidate) => candidate?.platform === target.platform,
    );
    const location = `runtimeTargets.${target.platform}`;
    if (!evidence) {
      errors.push(`${location} is missing.`);
      continue;
    }
    if (evidence.package !== target.package) {
      errors.push(`${location}.package must be ${target.package}.`);
    }
    if (evidence.renderer !== target.renderer) {
      errors.push(`${location}.renderer must be ${target.renderer}.`);
    }
    if (!PINNED_VERSION_PATTERN.test(evidence.version ?? "")) {
      errors.push(`${location}.version must be an exact pinned semver.`);
    }
    if (!evidenceIsPresent(evidence)) {
      errors.push(`${location} is not accepted with evidence.`);
    }
    requireAcceptedEntries(
      errors,
      `${location}.behaviors`,
      evidence.behaviors,
      array(target.requiredBehaviors),
    );
  }
}

function validatePerformance(errors, performance, manifestPerformance) {
  const evidence = object(performance);
  const required = object(manifestPerformance);
  const measurement = object(required.measurement);
  const readiness = object(evidence.readiness);
  const ceilings = object(required.runtimeCeilings);

  if (!evidence.productionBuild) {
    errors.push("performance.productionBuild must be true.");
  }
  if (
    !Number.isInteger(evidence.warmupSeconds) ||
    evidence.warmupSeconds < measurement.warmupSeconds
  ) {
    errors.push(
      `performance.warmupSeconds must be at least ${measurement.warmupSeconds}.`,
    );
  }
  if (
    !Number.isInteger(evidence.sampleSeconds) ||
    evidence.sampleSeconds < measurement.sampleSeconds
  ) {
    errors.push(
      `performance.sampleSeconds must be at least ${measurement.sampleSeconds}.`,
    );
  }
  if (
    !Number.isInteger(evidence.repeatCount) ||
    evidence.repeatCount < measurement.repeatCount
  ) {
    errors.push(
      `performance.repeatCount must be at least ${measurement.repeatCount}.`,
    );
  }
  if (
    typeof readiness.cachedReadyP95Ms !== "number" ||
    readiness.cachedReadyP95Ms > ceilings.cachedReadyP95Ms
  ) {
    errors.push(
      "performance.readiness.cachedReadyP95Ms exceeds the ceiling or is missing.",
    );
  }
  if (
    typeof readiness.uncachedReadyP95Ms !== "number" ||
    readiness.uncachedReadyP95Ms > ceilings.uncachedReadyP95Ms
  ) {
    errors.push(
      "performance.readiness.uncachedReadyP95Ms exceeds the ceiling or is missing.",
    );
  }
  if (
    typeof readiness.fallbackCommitP95Ms !== "number" ||
    readiness.fallbackCommitP95Ms > ceilings.fallbackCommitP95Ms
  ) {
    errors.push(
      "performance.readiness.fallbackCommitP95Ms exceeds the ceiling or is missing.",
    );
  }
  if (
    typeof readiness.baselineRegressionPercent !== "number" ||
    readiness.baselineRegressionPercent > ceilings.baselineRegressionPercent
  ) {
    errors.push(
      "performance.readiness.baselineRegressionPercent exceeds the ceiling or is missing.",
    );
  }
  if (!evidenceIsPresent(readiness)) {
    errors.push("performance.readiness is not accepted with evidence.");
  }

  for (const tier of array(required.deviceTiers)) {
    const result = array(evidence.deviceTiers).find(
      (candidate) => candidate?.id === tier.id,
    );
    const location = `performance.deviceTiers.${tier.id}`;
    if (!result) {
      errors.push(`${location} is missing.`);
      continue;
    }
    if (
      typeof result.p95FrameMs !== "number" ||
      result.p95FrameMs > tier.p95FrameMs
    ) {
      errors.push(`${location}.p95FrameMs exceeds ${tier.p95FrameMs}.`);
    }
    if (
      typeof result.minimumFps !== "number" ||
      result.minimumFps < tier.minimumFps
    ) {
      errors.push(`${location}.minimumFps is below ${tier.minimumFps}.`);
    }
    const expectedMode =
      tier.failureAction === "static_fallback" ? "static_fallback" : "animated";
    if (result.mode !== expectedMode) {
      errors.push(`${location}.mode must be ${expectedMode}.`);
    }
    if (!evidenceIsPresent(result)) {
      errors.push(`${location} is not accepted with evidence.`);
    }
  }
}

function validateSignoffs(errors, signoffs, gates) {
  if (!Array.isArray(signoffs)) {
    errors.push("signoffs must be an array.");
    return;
  }
  for (const gate of array(gates).filter((candidate) => candidate?.required)) {
    const signoff = signoffs.find((candidate) => candidate?.gateId === gate.id);
    const location = `signoffs.${gate.id}`;
    if (!signoff) {
      errors.push(`${location} is missing.`);
      continue;
    }
    if (signoff.owner !== gate.owner) {
      errors.push(`${location}.owner must be ${gate.owner}.`);
    }
    if (!evidenceIsPresent(signoff)) {
      errors.push(`${location} is not accepted with evidence.`);
    }
    if (typeof signoff.reviewer !== "string" || signoff.reviewer.trim() === "") {
      errors.push(`${location}.reviewer is required.`);
    }
    if (
      typeof signoff.reviewedAt !== "string" ||
      Number.isNaN(Date.parse(signoff.reviewedAt))
    ) {
      errors.push(`${location}.reviewedAt must be an ISO timestamp.`);
    }
  }
}

function validateManifestMotionPolicy(errors, motion) {
  const manifestMotion = object(motion);
  const transitions = array(manifestMotion.transitions);
  const curves = array(manifestMotion.curves);
  const approvedCurves = new Map([
    ["ease_out", "cubic-bezier(0.23,1,0.32,1)"],
    ["ease_in_out", "cubic-bezier(0.77,0,0.175,1)"],
    ["linear", "linear"],
  ]);
  const curveIds = new Set();
  for (const curve of curves) {
    if (curveIds.has(curve?.id)) {
      errors.push(`rig.motion.curves contains duplicate id: ${curve.id}.`);
    }
    curveIds.add(curve?.id);
    if (approvedCurves.get(curve?.id) !== curve?.value) {
      errors.push(
        `rig.motion.curves.${curve?.id ?? "unknown"} is not an approved v1 curve.`,
      );
    }
  }

  if (curves.some((curve) => curve?.id === "ease_in")) {
    errors.push("rig motion must not define an ease_in UI curve.");
  }
  const transitionIds = new Set();
  for (const transition of transitions) {
    const location = `rig.motion.transitions.${transition?.id ?? "unknown"}`;
    if (transitionIds.has(transition?.id)) {
      errors.push(`rig.motion.transitions contains duplicate id: ${transition.id}.`);
    }
    transitionIds.add(transition?.id);
    if (transition?.interruptible !== true) {
      errors.push(`${location} must remain interruptible.`);
    }
    if (transition?.curve === "ease_in") {
      errors.push(`${location} must not use ease_in.`);
    }
    if (
      !Number.isInteger(transition?.minimumMs) ||
      transition.minimumMs < 0 ||
      typeof transition?.maximumMs !== "number" ||
      transition.minimumMs > transition.maximumMs ||
      transition.maximumMs > 300
    ) {
      errors.push(
        `${location} must have an ordered 0–300 ms transition window.`,
      );
    }
    if (!curveIds.has(transition?.curve)) {
      errors.push(`${location}.curve must reference a declared approved curve.`);
    }
  }

  const reduced = object(manifestMotion.reducedMotion);
  if (reduced.ambient !== "off") {
    errors.push("rig.motion.reducedMotion.ambient must be off.");
  }
  if (
    typeof reduced.maxPoseTransitionMs !== "number" ||
    reduced.maxPoseTransitionMs > 120
  ) {
    errors.push(
      "rig.motion.reducedMotion.maxPoseTransitionMs must not exceed 120.",
    );
  }
  if (reduced.headFollow !== false || reduced.secondaryMotion !== false) {
    errors.push(
      "rig reduced-motion mode must disable head follow and secondary motion.",
    );
  }
}

export function acceptanceRequirements(manifest, stage) {
  return {
    acts: requiredActs(manifest, stage),
    affects: requiredAffects(manifest),
    artboards: requiredArtboards(manifest),
    articulationControls: [...ARTICULATION_CONTROLS],
    expressionReferences: [...EXPRESSION_REFERENCES],
    globalPoses: requiredGlobalPoses(manifest, stage),
    identityAngles: [...IDENTITY_ANGLES],
    identityLocks: array(manifest.identityLocks),
    speechAnchors: requiredSpeechAnchors(manifest, stage),
  };
}

export function evaluateMentorRiveAcceptance(document, manifest) {
  const errors = [];
  const doc = object(document);
  const stage = doc.stage;

  if (doc.contract !== MENTOR_RIVE_ACCEPTANCE_CONTRACT) {
    errors.push(`contract must be ${MENTOR_RIVE_ACCEPTANCE_CONTRACT}.`);
  }
  if (stage !== "spike" && stage !== "production") {
    errors.push("stage must be spike or production.");
  }
  if (doc.rigManifestVersion !== manifest?.manifestVersion) {
    errors.push(
      `rigManifestVersion must match ${manifest?.manifestVersion ?? "the manifest"}.`,
    );
  }
  validateManifestMotionPolicy(errors, manifest?.motion);

  const asset = object(doc.asset);
  if (path.basename(asset.path ?? "") !== manifest?.asset?.sourceFile) {
    errors.push(`asset.path must end in ${manifest?.asset?.sourceFile}.`);
  }
  if (!SHA256_PATTERN.test(asset.sha256 ?? "")) {
    errors.push("asset.sha256 must be a lowercase SHA-256 digest.");
  }
  if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) {
    errors.push("asset.bytes must be a positive integer.");
  } else if (
    asset.bytes > manifest?.performance?.runtimeCeilings?.rivTransferBytes
  ) {
    errors.push("asset.bytes exceeds the Rive transfer budget.");
  }
  if (typeof asset.signedBy !== "string" || asset.signedBy.trim() === "") {
    errors.push("asset.signedBy is required.");
  }
  if (
    typeof asset.signedAt !== "string" ||
    Number.isNaN(Date.parse(asset.signedAt))
  ) {
    errors.push("asset.signedAt must be an ISO timestamp.");
  }

  validateIdentityProfile(errors, doc.identityProfile);

  const coverage = object(doc.coverage);
  const requirements = acceptanceRequirements(manifest, stage);
  for (const key of Object.keys(requirements)) {
    requireAcceptedEntries(
      errors,
      `coverage.${key}`,
      coverage[key],
      requirements[key],
    );
  }
  requireAcceptedEntries(
    errors,
    "coverage.globalization",
    coverage.globalization,
    GLOBALIZATION_TESTS,
  );
  requireAcceptedEntries(
    errors,
    "coverage.accessibility",
    coverage.accessibility,
    ACCESSIBILITY_TESTS,
  );
  requireAcceptedEntries(
    errors,
    "coverage.securityPrivacy",
    coverage.securityPrivacy,
    SECURITY_PRIVACY_TESTS,
  );

  validateRuntimeTargets(errors, doc.runtimeTargets, manifest?.runtimeTargets);
  validatePerformance(errors, doc.performance, manifest?.performance);
  validateSignoffs(errors, doc.signoffs, manifest?.gates);

  const decision = object(doc.decision);
  if (decision.status !== "accepted") {
    errors.push("decision.status must be accepted.");
  }
  if (decision.stage !== stage) {
    errors.push("decision.stage must match the document stage.");
  }
  if (
    typeof decision.decidedAt !== "string" ||
    Number.isNaN(Date.parse(decision.decidedAt))
  ) {
    errors.push("decision.decidedAt must be an ISO timestamp.");
  }

  return {
    ok: errors.length === 0,
    stage,
    errors,
    requiredCounts: Object.fromEntries(
      Object.entries(requirements).map(([key, values]) => [key, values.length]),
    ),
  };
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function resolveInsideRoot(rootDir, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("path must be a non-empty repository-relative path");
  }

  const root = await realpath(rootDir);
  const candidate = await realpath(path.resolve(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error("path resolves outside the repository root");
  }
  return candidate;
}

async function verifyHashedArtifact({ rootDir, artifact, label }) {
  const errors = [];
  let filePath;
  try {
    filePath = await resolveInsideRoot(rootDir, artifact?.path);
  } catch (error) {
    return [`${label}: ${error.message}.`];
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return [`${label}: path is not a file.`];
  const digest = await sha256(filePath);
  if (artifact?.sha256 !== digest) {
    errors.push(`${label}: SHA-256 does not match the repository artifact.`);
  }
  if (
    artifact?.bytes !== undefined &&
    artifact?.bytes !== null &&
    artifact.bytes !== fileStat.size
  ) {
    errors.push(`${label}: byte count does not match the repository artifact.`);
  }
  return errors;
}

export async function verifyMentorRiveArtifacts(document, manifest, rootDir) {
  const errors = [];
  errors.push(
    ...(await verifyHashedArtifact({
      rootDir,
      artifact: document?.asset,
      label: "asset",
    })),
  );

  const contracts = array(document?.contracts);
  for (const required of REQUIRED_CONTRACT_ARTIFACTS) {
    const artifact = contracts.find((candidate) => candidate?.id === required.id);
    if (!artifact) {
      errors.push(`contracts.${required.id} is missing.`);
      continue;
    }
    if (artifact.path !== required.path) {
      errors.push(`contracts.${required.id}.path must be ${required.path}.`);
      continue;
    }
    if (!SHA256_PATTERN.test(artifact.sha256 ?? "")) {
      errors.push(`contracts.${required.id}.sha256 is invalid.`);
      continue;
    }
    errors.push(
      ...(await verifyHashedArtifact({
        rootDir,
        artifact,
        label: `contracts.${required.id}`,
      })),
    );
  }

  if (
    path.basename(document?.asset?.path ?? "") !== manifest?.asset?.sourceFile
  ) {
    errors.push("asset filename does not match the rig manifest sourceFile.");
  }

  return { ok: errors.length === 0, errors };
}
