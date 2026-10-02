import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { LIVING_MENTOR_ACTS } from "@/lib/living-mentor-presentation";
import {
  LIVING_MENTOR_RIVE_V2_CONTRACT_VERSION,
  LIVING_MENTOR_RIVE_V2_EVENTS,
  LIVING_MENTOR_RIVE_V2_STATES,
  applyLivingMentorV2SafetyOverride,
  hasCompleteLivingMentorV1Compatibility,
  isLivingMentorRiveV2SafetyState,
  livingMentorV2StateToV1Act,
  projectLivingMentorRiveV2ViewModel,
  reduceLivingMentorRiveV2State,
  type LivingMentorRiveV2HostInput,
} from "@/lib/living-mentor-rive-v2";

const schemaPath = path.join(
  process.cwd(),
  "docs/mentor/schemas/tecpey-mentor-rive-viewmodel.v2.schema.json",
);

type ConditionalRule = {
  if?: {
    properties?: Record<string, { const?: unknown }>;
    required?: string[];
  };
  then?: {
    properties?: Record<string, Record<string, unknown>>;
  };
};

async function schema() {
  return JSON.parse(await readFile(schemaPath, "utf8")) as {
    properties: Record<string, { const?: string; enum?: string[] }>;
    required: string[];
    additionalProperties: boolean;
    allOf: ConditionalRule[];
  };
}

function conditionalConstraint(
  document: Awaited<ReturnType<typeof schema>>,
  sourceField: string,
  sourceValue: unknown,
  targetField: string,
) {
  return document.allOf.find(
    (rule) => rule.if?.properties?.[sourceField]?.const === sourceValue,
  )?.then?.properties?.[targetField];
}

test("v2 exposes at least twenty governed semantic states with exact schema parity", async () => {
  assert.ok(LIVING_MENTOR_RIVE_V2_STATES.length >= 20);
  assert.equal(new Set(LIVING_MENTOR_RIVE_V2_STATES).size, LIVING_MENTOR_RIVE_V2_STATES.length);
  const document = await schema();
  assert.equal(document.additionalProperties, false);
  assert.equal(document.properties.contractVersion.const, LIVING_MENTOR_RIVE_V2_CONTRACT_VERSION);
  assert.deepEqual(document.properties.state.enum, [...LIVING_MENTOR_RIVE_V2_STATES]);
});

test("every v2 state has an explicit compatible v1 act during migration", () => {
  assert.equal(hasCompleteLivingMentorV1Compatibility(), true);
  for (const state of LIVING_MENTOR_RIVE_V2_STATES) {
    assert.ok(LIVING_MENTOR_ACTS.includes(livingMentorV2StateToV1Act(state)));
  }
});

test("semantic transitions are deterministic and never derive mood or risk from PnL", () => {
  assert.equal(reduceLivingMentorRiveV2State("idle", "research_started"), "researching");
  assert.equal(reduceLivingMentorRiveV2State("researching", "sources_checking"), "source_checking");
  assert.equal(reduceLivingMentorRiveV2State("arena_coaching", "arena_reflection_due"), "arena_reflection");
  assert.equal(reduceLivingMentorRiveV2State("runtime_error", "reset"), "idle");
  assert.equal(
    LIVING_MENTOR_RIVE_V2_EVENTS.some((event) => /pnl|profit|loss|price/i.test(event)),
    false,
  );
});

test("safety override wins over ordinary presentation intent", () => {
  assert.equal(applyLivingMentorV2SafetyOverride("milestone_celebration", "risk_caution"), "risk_caution");
  assert.equal(applyLivingMentorV2SafetyOverride("explaining", "privacy_notice"), "privacy_notice");
  assert.equal(applyLivingMentorV2SafetyOverride("researching", "runtime_error"), "runtime_error");
  assert.equal(isLivingMentorRiveV2SafetyState("risk_caution"), true);
  assert.equal(isLivingMentorRiveV2SafetyState("explaining"), false);
});

test("projection minimizes personal data and distinguishes unknown from zero", () => {
  const model = projectLivingMentorRiveV2ViewModel({
    state: "learning_focus",
    allowsUserName: false,
    userName: "Private User",
    streakDays: null,
    mood: null,
    riskLevel: null,
    roomLevel: null,
    locale: "fa-IR",
    direction: "rtl",
    motionIntensity: 0.7,
  });
  assert.equal(model.userName, "");
  assert.equal(model.userNameVisible, false);
  assert.equal(model.streakDays, 0);
  assert.equal(model.streakKnown, false);
  assert.equal(model.roomLevel, 0);
  assert.equal(model.roomKnown, false);
  assert.equal(model.mood, "unknown");
  assert.equal(model.riskLevel, "unknown");
});

test("projection clamps bounded values, strips control characters and honors reduced motion", () => {
  const model = projectLivingMentorRiveV2ViewModel({
    state: "milestone_celebration",
    allowsUserName: true,
    userName: "  Ma\u0000nnan  ",
    streakDays: 99_999,
    mood: "ready",
    riskLevel: "moderate",
    roomLevel: 99,
    locale: "en-US",
    direction: "ltr",
    reducedMotion: true,
    highContrast: true,
    motionIntensity: 1,
  });
  assert.equal(model.userName, "Mannan");
  assert.equal(model.userNameVisible, true);
  assert.equal(model.streakDays, 3650);
  assert.equal(model.streakKnown, true);
  assert.equal(model.roomLevel, 5);
  assert.equal(model.roomKnown, true);
  assert.equal(model.motionIntensity, 0);
  assert.equal(model.reducedMotion, true);
  assert.equal(model.highContrast, true);
});

test("display-name permission requires the literal boolean true", () => {
  for (const allowsUserName of ["true", "false", 1, 0, {}, []]) {
    const model = projectLivingMentorRiveV2ViewModel({
      state: "greeting",
      allowsUserName,
      userName: "Private User",
    } as unknown as LivingMentorRiveV2HostInput);
    assert.equal(model.userName, "");
    assert.equal(model.userNameVisible, false);
  }
});

test("malformed reduced-motion input fails safe by suppressing non-essential motion", () => {
  for (const reducedMotion of ["false", "true", 0, 1, null, {}]) {
    const model = projectLivingMentorRiveV2ViewModel({
      state: "thinking",
      reducedMotion,
      motionIntensity: 1,
    } as unknown as LivingMentorRiveV2HostInput);
    assert.equal(model.reducedMotion, true);
    assert.equal(model.motionIntensity, 0);
  }
});

test("malformed runtime values fail closed instead of becoming renderer truth", () => {
  const malformed = {
    state: "invented_state",
    safetyOverride: "invented_override",
    allowsUserName: true,
    userName: "A".repeat(100),
    streakDays: Number.NaN,
    mood: "omniscient",
    riskLevel: "certain_profit",
    roomLevel: Infinity,
    locale: "not a locale !!!",
    direction: "sideways",
    reducedMotion: false,
    highContrast: "yes",
    motionIntensity: 20,
  } as unknown as LivingMentorRiveV2HostInput;
  const model = projectLivingMentorRiveV2ViewModel(malformed);
  assert.equal(model.state, "runtime_error");
  assert.equal(model.userName.length, 48);
  assert.equal(model.streakKnown, false);
  assert.equal(model.mood, "unknown");
  assert.equal(model.riskLevel, "unknown");
  assert.equal(model.roomKnown, false);
  assert.equal(model.locale, "fa");
  assert.equal(model.direction, "rtl");
  assert.equal(model.highContrast, false);
  assert.equal(model.motionIntensity, 1);
});

test("schema encodes renderer invariants instead of allowing contradictory payloads", async () => {
  const document = await schema();
  assert.deepEqual(
    conditionalConstraint(document, "userNameVisible", false, "userName"),
    { const: "" },
  );
  assert.deepEqual(
    conditionalConstraint(document, "userNameVisible", true, "userName"),
    { minLength: 1 },
  );
  assert.deepEqual(
    conditionalConstraint(document, "streakKnown", false, "streakDays"),
    { const: 0 },
  );
  assert.deepEqual(
    conditionalConstraint(document, "roomKnown", false, "roomLevel"),
    { const: 0 },
  );
  assert.deepEqual(
    conditionalConstraint(document, "reducedMotion", true, "motionIntensity"),
    { const: 0 },
  );
});

test("schema contains only the approved renderer-facing property set", async () => {
  const document = await schema();
  const approved = [
    "contractVersion",
    "state",
    "userName",
    "userNameVisible",
    "streakDays",
    "streakKnown",
    "mood",
    "riskLevel",
    "roomLevel",
    "roomKnown",
    "locale",
    "direction",
    "reducedMotion",
    "highContrast",
    "motionIntensity",
  ];
  assert.deepEqual(document.required, approved);
  assert.deepEqual(Object.keys(document.properties), approved);
  const serialized = JSON.stringify(document).toLowerCase();
  for (const forbidden of [
    "seedphrase",
    "privatekey",
    "password",
    "totp",
    "balance",
    "email",
    "phone",
    "documentid",
    "rawprofile",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
