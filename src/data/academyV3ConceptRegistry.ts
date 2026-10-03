export type AcademyV3SafetyCriticality = "standard" | "important" | "critical";

export type AcademyV3Concept = {
  id: string;
  version: 1;
  term: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  safetyCriticality: AcademyV3SafetyCriticality;
  prerequisiteConceptIds: readonly string[];
};

const c = (
  id: string,
  term: AcademyV3Concept["term"],
  safetyCriticality: AcademyV3SafetyCriticality,
  prerequisiteConceptIds: readonly string[] = [],
): AcademyV3Concept => ({ id, version: 1, term, safetyCriticality, prerequisiteConceptIds });

export const academyV3Concepts = [
  c("T1.MONEY_TRUST",1,"important"), c("T1.CRYPTO_PRIMITIVES",1,"important"),
  c("T1.BLOCKCHAIN_MODEL",1,"important",["T1.CRYPTO_PRIMITIVES"]),
  c("T1.BITCOIN_MODEL",1,"important",["T1.MONEY_TRUST","T1.CRYPTO_PRIMITIVES"]),
  c("T1.ETH_SMART_CONTRACTS",1,"important",["T1.BLOCKCHAIN_MODEL"]),
  c("T1.STABLECOINS",1,"critical",["T1.MONEY_TRUST"]),
  c("T1.MARKET_VOCAB",1,"important"), c("T1.FOUNDATIONAL_RISK",1,"critical"),
  c("T2.AUTH_SECURITY",2,"critical",["T1.FOUNDATIONAL_RISK"]),
  c("T2.SEED_RECOVERY",2,"critical",["T1.FOUNDATIONAL_RISK"]),
  c("T2.CUSTODY_MODELS",2,"critical",["T2.SEED_RECOVERY"]),
  c("T2.PHISHING_SOCIAL",2,"critical",["T2.AUTH_SECURITY"]),
  c("T2.MALWARE_DEVICE",2,"critical",["T2.AUTH_SECURITY"]),
  c("T2.TRANSFER_SAFETY",2,"critical",["T1.FOUNDATIONAL_RISK"]),
  c("T2.APPROVAL_RISK",2,"critical",["T1.ETH_SMART_CONTRACTS","T2.PHISHING_SOCIAL"]),
  c("T2.INCIDENT_RESPONSE",2,"critical",["T2.AUTH_SECURITY","T2.SEED_RECOVERY"]),
  c("T3.EXCHANGE_MODEL",3,"important",["T1.MARKET_VOCAB"]),
  c("T3.ORDER_TYPES",3,"important",["T3.EXCHANGE_MODEL"]),
  c("T3.ORDERBOOK_LIQUIDITY",3,"important",["T1.MARKET_VOCAB"]),
  c("T3.SPREAD_SLIPPAGE",3,"important",["T3.ORDERBOOK_LIQUIDITY"]),
  c("T3.EXECUTION_COST",3,"important",["T3.SPREAD_SLIPPAGE"]),
  c("T3.DEPOSIT_WITHDRAW",3,"critical",["T2.TRANSFER_SAFETY","T3.EXCHANGE_MODEL"]),
  c("T3.EXECUTION_DISCIPLINE",3,"critical",["T1.FOUNDATIONAL_RISK","T3.ORDER_TYPES"]),
  c("T4.UTILITY_EVIDENCE",4,"important"), c("T4.TEAM_GOVERNANCE",4,"important"),
  c("T4.TOKEN_SUPPLY",4,"important",["T1.MARKET_VOCAB"]),
  c("T4.VESTING_UNLOCKS",4,"important",["T4.TOKEN_SUPPLY"]),
  c("T4.VALUATION_CONTEXT",4,"important",["T4.TOKEN_SUPPLY"]),
  c("T4.PROTOCOL_METRICS",4,"important"), c("T4.LIQUIDITY_CONCENTRATION",4,"critical",["T3.ORDERBOOK_LIQUIDITY"]),
  c("T4.SOURCE_VERIFICATION",4,"critical"), c("T4.RED_FLAGS",4,"critical",["T4.SOURCE_VERIFICATION"]),
  c("T5.PRICE_STRUCTURE",5,"important"), c("T5.SUPPORT_RESISTANCE",5,"important",["T5.PRICE_STRUCTURE"]),
  c("T5.VOLUME_CONTEXT",5,"important",["T1.MARKET_VOCAB"]), c("T5.INDICATOR_LIMITS",5,"important"),
  c("T5.MULTI_SIGNAL_REASONING",5,"important",["T4.SOURCE_VERIFICATION"]),
  c("T5.TIMEFRAME_CONTEXT",5,"important",["T5.PRICE_STRUCTURE"]),
  c("T5.INVALIDATION",5,"critical",["T5.PRICE_STRUCTURE"]),
  c("T5.ANALYSIS_UNCERTAINTY",5,"critical",["T4.SOURCE_VERIFICATION"]),
  c("T6.POSITION_SIZING",6,"critical",["T5.INVALIDATION"]),
  c("T6.EXPECTANCY",6,"critical",["T1.FOUNDATIONAL_RISK"]),
  c("T6.DRAWDOWN",6,"critical",["T6.EXPECTANCY"]), c("T6.CORRELATION",6,"critical",["T1.MARKET_VOCAB"]),
  c("T6.RISK_BUDGET",6,"critical",["T6.POSITION_SIZING","T6.CORRELATION"]),
  c("T6.FOMO",6,"critical",["T1.FOUNDATIONAL_RISK"]), c("T6.REVENGE",6,"critical",["T6.DRAWDOWN"]),
  c("T6.OVERCONFIDENCE",6,"critical",["T5.ANALYSIS_UNCERTAINTY"]),
  c("T6.CONFIRMATION_BIAS",6,"important",["T4.SOURCE_VERIFICATION"]),
  c("T6.NO_TRADE",6,"critical",["T6.RISK_BUDGET"]), c("T6.DECISION_JOURNAL",6,"important"),
  c("T7.RESEARCH_WORKFLOW",7,"important",["T4.SOURCE_VERIFICATION","T5.MULTI_SIGNAL_REASONING"]),
  c("T7.PLAN_CONSTRUCTION",7,"critical",["T6.RISK_BUDGET","T6.NO_TRADE","T6.DECISION_JOURNAL"]),
  c("T7.SCENARIO_PORTFOLIO",7,"critical",["T6.RISK_BUDGET","T6.CORRELATION"]),
  c("T7.SECURITY_REVIEW",7,"critical",["T2.INCIDENT_RESPONSE","T3.DEPOSIT_WITHDRAW"]),
  c("T7.EXECUTION_REVIEW",7,"important",["T3.EXECUTION_DISCIPLINE","T6.DECISION_JOURNAL"]),
  c("T7.JOURNAL_REVIEW",7,"important",["T6.DECISION_JOURNAL"]),
  c("T7.EVIDENCE_COMMUNICATION",7,"important",["T7.RESEARCH_WORKFLOW"]),
  c("T7.ARENA_TRANSFER",7,"critical",["T7.PLAN_CONSTRUCTION","T7.EXECUTION_REVIEW"]),
  c("T7.GRADUATION_TRANSFER",7,"critical",["T7.ARENA_TRANSFER","T7.SECURITY_REVIEW","T7.EVIDENCE_COMMUNICATION"]),
] as const satisfies readonly AcademyV3Concept[];

export const academyV3ConceptIds = academyV3Concepts.map((concept) => concept.id);

export function validateAcademyV3ConceptRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const concept of academyV3Concepts) {
    if (ids.has(concept.id)) errors.push(`duplicate concept id: ${concept.id}`);
    ids.add(concept.id);
  }
  for (const concept of academyV3Concepts) {
    for (const prerequisite of concept.prerequisiteConceptIds) {
      if (!ids.has(prerequisite)) errors.push(`${concept.id}: unknown prerequisite ${prerequisite}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(academyV3Concepts.map((concept) => [concept.id, concept] as const));
  const visit = (id: string): void => {
    if (visiting.has(id)) { errors.push(`prerequisite cycle detected at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)?.prerequisiteConceptIds ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return errors;
}
