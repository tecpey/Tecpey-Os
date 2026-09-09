export const AI_INTELLIGENCE_OUTPUT_SCHEMA_IDS = [
  "news_translation_v1",
  "news_validation_v1",
  "growth_signal_batch_v1",
  "growth_research_dossier_v1",
  "knowledge_candidate_v1",
  "content_review_v1",
  "executive_synthesis_v1",
] as const;

export type AiIntelligenceOutputSchemaId =
  (typeof AI_INTELLIGENCE_OUTPUT_SCHEMA_IDS)[number];

export type AiIntelligenceJsonSchema = Readonly<Record<string, unknown>>;

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): AiIntelligenceJsonSchema {
  return Object.freeze({
    type: "object",
    properties: Object.freeze(properties),
    required: Object.freeze([...required]),
    additionalProperties: false,
  });
}

const boundedText = (maxLength: number) => Object.freeze({
  type: "string",
  minLength: 1,
  maxLength,
});

const nullableText = (maxLength: number) => Object.freeze({
  anyOf: [boundedText(maxLength), { type: "null" }],
});

const confidence = Object.freeze({
  type: "number",
  minimum: 0,
  maximum: 1,
});

const urlReference = objectSchema(
  {
    url: Object.freeze({ type: "string", format: "uri", maxLength: 2048 }),
    title: nullableText(300),
  },
  ["url", "title"],
);

const evidenceReference = objectSchema(
  {
    evidenceId: boundedText(160),
    contentHash: Object.freeze({ type: "string", pattern: "^[a-f0-9]{64}$" }),
  },
  ["evidenceId", "contentHash"],
);

export const AI_INTELLIGENCE_OUTPUT_SCHEMAS = Object.freeze({
  news_translation_v1: objectSchema(
    {
      title: boundedText(500),
      lead: boundedText(4000),
      body: boundedText(6000),
    },
    ["title", "lead", "body"],
  ),
  news_validation_v1: objectSchema(
    {
      accepted: { type: "boolean" },
      numericIntegrity: { type: "boolean" },
      namedEntityIntegrity: { type: "boolean" },
      noAddedAdvice: { type: "boolean" },
      languageShapeValid: { type: "boolean" },
      reasonCodes: {
        type: "array",
        maxItems: 20,
        items: boundedText(120),
      },
    },
    [
      "accepted",
      "numericIntegrity",
      "namedEntityIntegrity",
      "noAddedAdvice",
      "languageShapeValid",
      "reasonCodes",
    ],
  ),
  growth_signal_batch_v1: objectSchema(
    {
      signals: {
        type: "array",
        maxItems: 40,
        items: objectSchema(
          {
            entityType: { type: "string", enum: ["coin", "tool", "topic"] },
            entityId: boundedText(120),
            label: boundedText(160),
            sourceReferenceIndex: { type: "integer", minimum: 0, maximum: 255 },
            magnitude: confidence,
            velocity: confidence,
            confidence,
            manipulationRisk: confidence,
            evidence: boundedText(420),
          },
          [
            "entityType",
            "entityId",
            "label",
            "sourceReferenceIndex",
            "magnitude",
            "velocity",
            "confidence",
            "manipulationRisk",
            "evidence",
          ],
        ),
      },
    },
    ["signals"],
  ),
  growth_research_dossier_v1: objectSchema(
    {
      subjectType: { type: "string", enum: ["coin", "tool", "topic"] },
      subjectId: boundedText(120),
      thesis: boundedText(1200),
      findings: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: objectSchema(
          {
            statement: boundedText(1200),
            confidence,
            sourceReferenceIndexes: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: { type: "integer", minimum: 0, maximum: 255 },
            },
          },
          ["statement", "confidence", "sourceReferenceIndexes"],
        ),
      },
      manipulationRisk: confidence,
      uncertainty: boundedText(1200),
    },
    ["subjectType", "subjectId", "thesis", "findings", "manipulationRisk", "uncertainty"],
  ),
  knowledge_candidate_v1: objectSchema(
    {
      subjectType: boundedText(80),
      subjectId: boundedText(160),
      statement: boundedText(2400),
      locale: boundedText(16),
      confidence,
      evidenceRefs: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: evidenceReference,
      },
      validFrom: Object.freeze({ type: "string", format: "date-time" }),
      expiresAt: Object.freeze({
        anyOf: [
          { type: "string", format: "date-time" },
          { type: "null" },
        ],
      }),
      contradictionKeys: {
        type: "array",
        maxItems: 20,
        items: boundedText(160),
      },
    },
    [
      "subjectType",
      "subjectId",
      "statement",
      "locale",
      "confidence",
      "evidenceRefs",
      "validFrom",
      "expiresAt",
      "contradictionKeys",
    ],
  ),
  content_review_v1: objectSchema(
    {
      decision: { type: "string", enum: ["approve", "revise", "reject"] },
      factualSupport: confidence,
      editorialQuality: confidence,
      seoAeoQuality: confidence,
      duplicateRisk: confidence,
      unsupportedClaims: {
        type: "array",
        maxItems: 20,
        items: boundedText(500),
      },
      requiredChanges: {
        type: "array",
        maxItems: 20,
        items: boundedText(500),
      },
    },
    [
      "decision",
      "factualSupport",
      "editorialQuality",
      "seoAeoQuality",
      "duplicateRisk",
      "unsupportedClaims",
      "requiredChanges",
    ],
  ),
  executive_synthesis_v1: objectSchema(
    {
      summary: boundedText(3000),
      decisions: {
        type: "array",
        maxItems: 20,
        items: objectSchema(
          {
            statement: boundedText(1000),
            confidence,
            evidenceRefs: {
              type: "array",
              maxItems: 20,
              items: evidenceReference,
            },
          },
          ["statement", "confidence", "evidenceRefs"],
        ),
      },
      risks: {
        type: "array",
        maxItems: 20,
        items: boundedText(1000),
      },
      openQuestions: {
        type: "array",
        maxItems: 20,
        items: boundedText(1000),
      },
    },
    ["summary", "decisions", "risks", "openQuestions"],
  ),
} as const satisfies Readonly<Record<AiIntelligenceOutputSchemaId, AiIntelligenceJsonSchema>>);

export function aiIntelligenceOutputSchema(
  schemaId: AiIntelligenceOutputSchemaId,
): AiIntelligenceJsonSchema {
  const schema = AI_INTELLIGENCE_OUTPUT_SCHEMAS[schemaId];
  if (!schema) throw new Error(`ai_intelligence_output_schema_unknown:${schemaId}`);
  return schema;
}

function validateObjectSchema(
  schema: AiIntelligenceJsonSchema,
  path: string,
): void {
  if (schema.type !== "object") return;
  const properties = schema.properties;
  const required = schema.required;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(`ai_intelligence_schema_properties_invalid:${path}`);
  }
  if (!Array.isArray(required)) {
    throw new Error(`ai_intelligence_schema_required_invalid:${path}`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`ai_intelligence_schema_additional_properties_invalid:${path}`);
  }
  const propertyNames = Object.keys(properties as Record<string, unknown>);
  if (
    required.length !== propertyNames.length ||
    propertyNames.some((name) => !required.includes(name))
  ) {
    throw new Error(`ai_intelligence_schema_required_incomplete:${path}`);
  }
}

export function validateAiIntelligenceOutputSchemaRegistry(): void {
  const ids = Object.keys(AI_INTELLIGENCE_OUTPUT_SCHEMAS).sort();
  if (ids.length !== AI_INTELLIGENCE_OUTPUT_SCHEMA_IDS.length) {
    throw new Error("ai_intelligence_schema_registry_incomplete");
  }
  for (const schemaId of AI_INTELLIGENCE_OUTPUT_SCHEMA_IDS) {
    if (!ids.includes(schemaId)) {
      throw new Error(`ai_intelligence_schema_missing:${schemaId}`);
    }
    validateObjectSchema(AI_INTELLIGENCE_OUTPUT_SCHEMAS[schemaId], schemaId);
  }
}

validateAiIntelligenceOutputSchemaRegistry();
