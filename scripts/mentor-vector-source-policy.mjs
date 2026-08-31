import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const MENTOR_VECTOR_SOURCE_CONTRACT =
  "tecpey-mentor-vector-source-pack.v1";

export const REQUIRED_VECTOR_SOURCE_IDS = Object.freeze([
  "identity_primary_four_view",
  "identity_front",
  "identity_three_quarter_near",
  "identity_three_quarter_far",
  "identity_profile",
  "expression_angle_reference",
]);

export const REQUIRED_SEMANTIC_GROUPS = Object.freeze([
  "grp_head",
  "mesh_face_base",
  "geo_nose_identity",
  "grp_eye_L",
  "grp_eye_R",
  "grp_brow_L",
  "grp_brow_R",
  "grp_mouth",
  "mesh_lower_face_speech",
  "mesh_beard_lower",
  "geo_hair_back",
  "geo_hair_front",
]);

export const REQUIRED_INITIAL_ACTS = Object.freeze([
  "idle_attentive",
  "greet",
  "explain",
  "celebrate_effort",
  "risk_caution",
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_EASINGS = new Set(["none", "ease_out", "ease_in_out"]);
const ALLOWED_PURPOSES = new Set([
  "feedback",
  "state_indication",
  "spatial_consistency",
  "preventing_jarring_change",
  "explanation",
  "delight",
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function requireExactMembers(errors, location, actual, required) {
  const values = array(actual);
  for (const id of required) {
    if (!values.includes(id)) errors.push(`${location} is missing ${id}.`);
  }
  if (new Set(values).size !== values.length) {
    errors.push(`${location} contains duplicate values.`);
  }
}

function validateIdentityLock(errors, identityLock) {
  const lock = object(identityLock);
  const nose = object(lock.nose);
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

  if (lock.group !== "geo_nose_identity") {
    errors.push("identityLock.group must be geo_nose_identity.");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (nose[key] !== value) {
      errors.push(`identityLock.nose.${key} must remain ${JSON.stringify(value)}.`);
    }
  }
}

function validateSources(errors, sources) {
  if (!Array.isArray(sources)) {
    errors.push("sources must be an array.");
    return;
  }

  const ids = sources.map((source) => source?.id);
  requireExactMembers(errors, "sources", ids, REQUIRED_VECTOR_SOURCE_IDS);
  const paths = new Set();

  for (const source of sources) {
    const location = `sources.${source?.id ?? "unknown"}`;
    if (typeof source?.path !== "string" || !source.path.endsWith(".svg")) {
      errors.push(`${location}.path must name an SVG.`);
    } else if (paths.has(source.path)) {
      errors.push(`${location}.path is duplicated.`);
    } else {
      paths.add(source.path);
    }
    if (!Number.isInteger(source?.width) || source.width <= 0) {
      errors.push(`${location}.width must be a positive integer.`);
    }
    if (!Number.isInteger(source?.height) || source.height <= 0) {
      errors.push(`${location}.height must be a positive integer.`);
    }
    if (!Number.isInteger(source?.bytes) || source.bytes <= 0) {
      errors.push(`${location}.bytes must be a positive integer.`);
    }
    if (!Number.isInteger(source?.pathCount) || source.pathCount <= 0) {
      errors.push(`${location}.pathCount must be a positive integer.`);
    }
    if (!SHA256_PATTERN.test(source?.sha256 ?? "")) {
      errors.push(`${location}.sha256 must be lowercase SHA-256.`);
    }
    if (source?.containsRaster !== false) {
      errors.push(`${location}.containsRaster must be false.`);
    }
    if (source?.productionImport !== false) {
      errors.push(`${location}.productionImport must be false for flat traces.`);
    }
  }
}

function validateMotion(errors, acts) {
  if (!Array.isArray(acts)) {
    errors.push("initialActs must be an array.");
    return;
  }

  requireExactMembers(
    errors,
    "initialActs",
    acts.map((act) => act?.id),
    REQUIRED_INITIAL_ACTS,
  );

  for (const act of acts) {
    const location = `initialActs.${act?.id ?? "unknown"}`;
    if (!ALLOWED_PURPOSES.has(act?.purpose)) {
      errors.push(`${location}.purpose is not a governed motion purpose.`);
    }
    for (const key of ["entryMs", "exitMs"]) {
      if (!Number.isInteger(act?.[key]) || act[key] < 0 || act[key] > 300) {
        errors.push(`${location}.${key} must be an integer from 0 to 300.`);
      }
    }
    if (!ALLOWED_EASINGS.has(act?.easing)) {
      errors.push(`${location}.easing cannot use ease-in or an unapproved curve.`);
    }
    if (act?.interruptible !== true) {
      errors.push(`${location}.interruptible must be true.`);
    }
    if (
      typeof act?.reducedMotion !== "string" ||
      act.reducedMotion.trim().length === 0
    ) {
      errors.push(`${location}.reducedMotion must define a gentler state.`);
    }
  }
}

export function evaluateMentorVectorSourcePack(document) {
  const errors = [];
  const sourcePack = object(document);

  if (sourcePack.contract !== MENTOR_VECTOR_SOURCE_CONTRACT) {
    errors.push(`contract must be ${MENTOR_VECTOR_SOURCE_CONTRACT}.`);
  }
  if (sourcePack.status !== "trace_reference_only") {
    errors.push("status must remain trace_reference_only before semantic rebuild.");
  }
  if (sourcePack.characterBoundary !== "inspired_by_mahdi_not_mahdi") {
    errors.push("characterBoundary must be inspired_by_mahdi_not_mahdi.");
  }

  const decision = object(sourcePack.authoringDecision);
  if (decision.expressionMayOverrideIdentityGeometry !== false) {
    errors.push("expression references cannot override identity geometry.");
  }
  if (decision.flatTraceMayShipToRuntime !== false) {
    errors.push("flat traces cannot ship to runtime.");
  }
  if (decision.canonicalRiveComponent !== "MentorCore") {
    errors.push("canonicalRiveComponent must be MentorCore.");
  }

  validateIdentityLock(errors, sourcePack.identityLock);
  validateSources(errors, sourcePack.sources);

  const coverage = object(sourcePack.coverage);
  if (coverage.mirroringDoesNotCloseCoverage !== true) {
    errors.push("mirroringDoesNotCloseCoverage must be true.");
  }
  requireExactMembers(
    errors,
    "coverage.acceptanceAnglesStillRequired",
    coverage.acceptanceAnglesStillRequired,
    ["three_quarter_L", "profile_L"],
  );

  const semanticTarget = object(sourcePack.semanticTarget);
  requireExactMembers(
    errors,
    "semanticTarget.requiredGroups",
    semanticTarget.requiredGroups,
    REQUIRED_SEMANTIC_GROUPS,
  );
  requireExactMembers(
    errors,
    "semanticTarget.noseZeroWeightDomains",
    semanticTarget.noseZeroWeightDomains,
    ["speech", "affect", "jaw", "head_aim"],
  );
  validateMotion(errors, sourcePack.initialActs);

  return { ok: errors.length === 0, errors };
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function parseSvgDimension(svg, name) {
  const match = svg.match(new RegExp(`\\b${name}="(\\d+)"`));
  return match ? Number(match[1]) : null;
}

function resolveInsideRoot(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

export async function verifyMentorVectorSourceFiles(document, root) {
  const evaluated = evaluateMentorVectorSourcePack(document);
  const errors = [...evaluated.errors];
  const repositoryRoot = await realpath(root);

  for (const source of array(document?.sources)) {
    const location = `sources.${source?.id ?? "unknown"}`;
    try {
      const filePath = resolveInsideRoot(repositoryRoot, source.path);
      const canonicalPath = await realpath(filePath);
      const relative = path.relative(repositoryRoot, canonicalPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("resolved source is outside the repository root");
      }

      const [bytes, metadata] = await Promise.all([
        readFile(canonicalPath),
        stat(canonicalPath),
      ]);
      const svg = bytes.toString("utf8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const pathCount = countMatches(svg, /<path\b/g);

      if (metadata.size !== source.bytes) {
        errors.push(`${location}.bytes does not match the file.`);
      }
      if (sha256 !== source.sha256) {
        errors.push(`${location}.sha256 does not match the file.`);
      }
      if (pathCount !== source.pathCount) {
        errors.push(`${location}.pathCount does not match the SVG.`);
      }
      if (parseSvgDimension(svg, "width") !== source.width) {
        errors.push(`${location}.width does not match the SVG.`);
      }
      if (parseSvgDimension(svg, "height") !== source.height) {
        errors.push(`${location}.height does not match the SVG.`);
      }
      if (/<(?:image|script|foreignObject)\b/i.test(svg)) {
        errors.push(`${location} contains embedded raster or active content.`);
      }
      if (!/^<svg\b/.test(svg.trimStart())) {
        errors.push(`${location} is not an SVG document.`);
      }
    } catch (error) {
      errors.push(`${location} could not be verified: ${error.message}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
