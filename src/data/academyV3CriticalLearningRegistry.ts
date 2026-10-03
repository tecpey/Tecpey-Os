import { academyV3Concepts } from "./academyV3ConceptRegistry";

export type AcademyV3EvidenceKind =
  | "retrieval"
  | "application"
  | "calculation"
  | "scenario"
  | "transfer"
  | "reassessment"
  | "arena";

export type AcademyV3CriticalObjective = {
  id: string;
  conceptId: string;
  evidenceKinds: readonly AcademyV3EvidenceKind[];
};

export type AcademyV3Misconception = {
  id: string;
  conceptId: string;
  severity: "important" | "critical";
  remediation: "explain" | "worked-example" | "contrast" | "scenario-repair";
  reassessment: "changed-context" | "delayed-retrieval" | "scenario-transfer";
};

const o = (
  id: string,
  conceptId: string,
  evidenceKinds: readonly AcademyV3EvidenceKind[],
): AcademyV3CriticalObjective => ({ id, conceptId, evidenceKinds });

const m = (
  id: string,
  conceptId: string,
  severity: AcademyV3Misconception["severity"],
  remediation: AcademyV3Misconception["remediation"],
  reassessment: AcademyV3Misconception["reassessment"],
): AcademyV3Misconception => ({ id, conceptId, severity, remediation, reassessment });

export const academyV3CriticalObjectives = [
  o("O.SEED.AUTHORITY","T2.SEED_RECOVERY",["retrieval","scenario","reassessment"]),
  o("O.SEED.COMPROMISE_RESPONSE","T2.SEED_RECOVERY",["scenario","transfer"]),
  o("O.TRANSFER.VERIFY","T2.TRANSFER_SAFETY",["application","scenario","reassessment"]),
  o("O.SOURCE.PROVENANCE","T4.SOURCE_VERIFICATION",["retrieval","application","transfer"]),
  o("O.SOURCE.DISCONFIRM","T4.SOURCE_VERIFICATION",["scenario","transfer"]),
  o("O.INVALIDATION.TESTABLE","T5.INVALIDATION",["application","scenario","arena"]),
  o("O.INVALIDATION.RISK_INPUT","T5.INVALIDATION",["transfer","arena"]),
  o("O.SIZE.BOUNDED_RISK","T6.POSITION_SIZING",["calculation","scenario","transfer"]),
  o("O.SIZE.REJECT_UNSAFE","T6.POSITION_SIZING",["scenario","transfer"]),
  o("O.DRAWDOWN.ASYMMETRY","T6.DRAWDOWN",["calculation","retrieval","reassessment"]),
  o("O.DRAWDOWN.RESPONSE","T6.DRAWDOWN",["scenario","transfer"]),
  o("O.REVENGE.RECOGNIZE","T6.REVENGE",["scenario","reassessment"]),
  o("O.REVENGE.PAUSE","T6.REVENGE",["application","scenario","transfer"]),
  o("O.NOTRADE.IDENTIFY","T6.NO_TRADE",["scenario","transfer"]),
  o("O.NOTRADE.DEFEND","T6.NO_TRADE",["scenario","arena","reassessment"]),
] as const satisfies readonly AcademyV3CriticalObjective[];

export const academyV3Misconceptions = [
  m("M.SEED.RESET","T2.SEED_RECOVERY","critical","contrast","changed-context"),
  m("M.SEED.CLOUD","T2.SEED_RECOVERY","critical","scenario-repair","changed-context"),
  m("M.SEED.VERIFY","T2.SEED_RECOVERY","critical","contrast","scenario-transfer"),
  m("M.TRANSFER.CHEAPEST","T2.TRANSFER_SAFETY","critical","scenario-repair","changed-context"),
  m("M.TRANSFER.ADDRESS_ONLY","T2.TRANSFER_SAFETY","critical","worked-example","scenario-transfer"),
  m("M.TRANSFER.REVERSIBLE","T2.TRANSFER_SAFETY","critical","contrast","changed-context"),
  m("M.SOURCE.POPULAR","T4.SOURCE_VERIFICATION","important","contrast","changed-context"),
  m("M.SOURCE.MULTIPLE","T4.SOURCE_VERIFICATION","important","worked-example","scenario-transfer"),
  m("M.SOURCE.RECENTPRICE","T4.SOURCE_VERIFICATION","important","scenario-repair","changed-context"),
  m("M.INVALIDATION.HOPE","T5.INVALIDATION","critical","contrast","scenario-transfer"),
  m("M.INVALIDATION.STOPONLY","T5.INVALIDATION","critical","worked-example","changed-context"),
  m("M.INVALIDATION.MOVE","T5.INVALIDATION","critical","scenario-repair","scenario-transfer"),
  m("M.SIZE.FIXED","T6.POSITION_SIZING","critical","worked-example","changed-context"),
  m("M.SIZE.CONVICTION","T6.POSITION_SIZING","critical","scenario-repair","scenario-transfer"),
  m("M.SIZE.STOP","T6.POSITION_SIZING","critical","worked-example","changed-context"),
  m("M.DD.SYMMETRY","T6.DRAWDOWN","critical","worked-example","delayed-retrieval"),
  m("M.DD.RECOVERFAST","T6.DRAWDOWN","critical","scenario-repair","scenario-transfer"),
  m("M.DD.OUTCOME","T6.DRAWDOWN","critical","contrast","changed-context"),
  m("M.REVENGE.DEBT","T6.REVENGE","critical","contrast","changed-context"),
  m("M.REVENGE.SIZE","T6.REVENGE","critical","scenario-repair","scenario-transfer"),
  m("M.REVENGE.WIN","T6.REVENGE","critical","contrast","changed-context"),
  m("M.NOTRADE.MISSED","T6.NO_TRADE","critical","contrast","changed-context"),
  m("M.NOTRADE.ALWAYSOPPORTUNITY","T6.NO_TRADE","critical","scenario-repair","scenario-transfer"),
  m("M.NOTRADE.FOMO","T6.NO_TRADE","critical","scenario-repair","changed-context"),
] as const satisfies readonly AcademyV3Misconception[];

export const academyV3CriticalRegistryConceptIds = [
  "T2.SEED_RECOVERY",
  "T2.TRANSFER_SAFETY",
  "T4.SOURCE_VERIFICATION",
  "T5.INVALIDATION",
  "T6.POSITION_SIZING",
  "T6.DRAWDOWN",
  "T6.REVENGE",
  "T6.NO_TRADE",
] as const;

export function validateAcademyV3CriticalLearningRegistry(): string[] {
  const errors: string[] = [];
  const conceptIds = new Set(academyV3Concepts.map((concept) => concept.id));
  const objectiveIds = new Set<string>();
  const misconceptionIds = new Set<string>();

  for (const objective of academyV3CriticalObjectives) {
    if (objectiveIds.has(objective.id)) errors.push(`duplicate objective id: ${objective.id}`);
    objectiveIds.add(objective.id);
    if (!conceptIds.has(objective.conceptId)) errors.push(`${objective.id}: unknown concept ${objective.conceptId}`);
    if (objective.evidenceKinds.length === 0) errors.push(`${objective.id}: evidence strategy required`);
  }
  for (const misconception of academyV3Misconceptions) {
    if (misconceptionIds.has(misconception.id)) errors.push(`duplicate misconception id: ${misconception.id}`);
    misconceptionIds.add(misconception.id);
    if (!conceptIds.has(misconception.conceptId)) errors.push(`${misconception.id}: unknown concept ${misconception.conceptId}`);
  }

  for (const conceptId of academyV3CriticalRegistryConceptIds) {
    if (!academyV3CriticalObjectives.some((objective) => objective.conceptId === conceptId)) {
      errors.push(`${conceptId}: measurable objective required`);
    }
    if (!academyV3Misconceptions.some((misconception) => misconception.conceptId === conceptId)) {
      errors.push(`${conceptId}: misconception coverage required`);
    }
  }
  return errors;
}
