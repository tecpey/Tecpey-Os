import { detectBodyLimitEvidence } from "./api-security-body-limit-policy.mjs";
import { runtimeEvidenceSource } from "./api-security-runtime-evidence.mjs";

const BOUNDED_BODY_READERS = [
  "readJsonBody",
  "readBoundedJson",
  "readBoundedBody",
  "readBodyWithLimit",
  "parseBoundedJsonBody",
];
const BOUNDED_READER_PATTERN = new RegExp(
  `\\b(${BOUNDED_BODY_READERS.join("|")})\\s*\\(`,
);

export function detectBodyParser(source) {
  const runtime = runtimeEvidenceSource(source);
  if (/\b(?:req|request)\.json\s*\(/.test(runtime)) return "json";
  if (/\b(?:req|request)\.formData\s*\(/.test(runtime)) return "form-data";
  if (/\b(?:req|request)\.text\s*\(/.test(runtime)) return "text";
  const boundedReader = runtime.match(BOUNDED_READER_PATTERN)?.[1] ?? null;
  if (boundedReader) return "bounded-json-helper";
  return runtime.match(/\b(parse[A-Z][A-Za-z0-9_]*)\s*\(/)?.[1] ?? null;
}

export function evaluateBodyBoundaryStages(stages) {
  const parsedStages = stages
    .map((stage) => {
      const parser = detectBodyParser(stage.source);
      if (!parser) return null;
      const limit = detectBodyLimitEvidence(stage.source);
      return {
        role: stage.role,
        sourcePath: stage.sourcePath,
        method: stage.method,
        parser,
        limit,
      };
    })
    .filter(Boolean);

  if (parsedStages.length === 0) {
    return {
      expectsBody: false,
      inputParser: null,
      headerBodySizeHint: false,
      bodySizeLimit: false,
      bodySizeLimitAuthority: null,
      stages: [],
    };
  }

  const enforceable = parsedStages.every((stage) => stage.limit.enforceable);
  const parserChain = parsedStages
    .map((stage) => `${stage.role}:${stage.parser}`)
    .join(" -> ");
  const authorityChain = enforceable
    ? parsedStages
        .map((stage) => `${stage.role}:${stage.limit.authority}`)
        .join(" -> ")
    : null;

  return {
    expectsBody: true,
    inputParser: parserChain,
    headerBodySizeHint: parsedStages.some((stage) => stage.limit.headerHint),
    bodySizeLimit: enforceable,
    bodySizeLimitAuthority: authorityChain,
    stages: parsedStages,
  };
}
